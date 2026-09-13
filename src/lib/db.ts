import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Define storage directory: can be overridden via DATA_DIR environment variable (e.g. for Docker / NAS mount)
function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  // If running inside .next/standalone, always point to the external root project data directory
  if (process.cwd().includes(".next")) {
    return path.resolve(process.cwd(), "../../data");
  }
  return path.join(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "novel_reader.db");

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    // Ensure directories exist
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    // Initialize SQLite database with 10s retry timeout to prevent SQLITE_BUSY
    dbInstance = new Database(DB_PATH, {
      timeout: 10000,
    });

    // Set busy timeout and foreign keys
    dbInstance.pragma("busy_timeout = 10000");
    dbInstance.pragma("foreign_keys = ON");

    // Attempt WAL mode, fallback to DELETE mode if on network share / NAS without shared memory
    const preferredJournalMode = process.env.SQLITE_JOURNAL_MODE || "WAL";
    try {
      dbInstance.pragma(`journal_mode = ${preferredJournalMode}`);
    } catch (e) {
      try {
        dbInstance.pragma("journal_mode = DELETE");
      } catch (err) {
        console.warn("[DB] Could not set journal mode:", err);
      }
    }

    console.log(`[DB] SQLite initialized at: ${DB_PATH}`);
    console.log(`[DB] Uploads directory at: ${UPLOADS_DIR}`);

    // Register graceful shutdown to checkpoint WAL and close database safely
    if (typeof process !== "undefined" && !process.env.__DB_SHUTDOWN_REGISTERED) {
      process.env.__DB_SHUTDOWN_REGISTERED = "1";
      const flushAndClose = () => {
        if (dbInstance) {
          try {
            console.log("[DB] Gracefully checkpointing and closing SQLite database...");
            dbInstance.pragma("wal_checkpoint(TRUNCATE)");
            dbInstance.close();
          } catch (err) {
            console.warn("[DB] Error during SQLite shutdown checkpoint:", err);
          }
          dbInstance = null;
        }
      };
      process.once("SIGTERM", flushAndClose);
      process.once("SIGINT", flushAndClose);
      process.once("beforeExit", flushAndClose);
    }

    // Initialize Schema lazily
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        total_chars INTEGER NOT NULL,
        uploader_id TEXT DEFAULT 'default_user',
        uploader_name TEXT DEFAULT '系統',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reading_progress (
        user_id TEXT NOT NULL DEFAULT 'default_user',
        book_id TEXT NOT NULL,
        char_offset INTEGER NOT NULL DEFAULT 0,
        percentage REAL NOT NULL DEFAULT 0.0,
        device_name TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        chapter_index INTEGER,
        page_index INTEGER,
        page_ratio REAL,
        total_pages INTEGER,
        PRIMARY KEY (user_id, book_id),
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'default_user',
        book_id TEXT NOT NULL,
        char_offset INTEGER NOT NULL,
        title TEXT NOT NULL,
        preview_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      );
    `);

    // Ensure default user exists
    dbInstance
      .prepare(
        `INSERT OR IGNORE INTO users (id, email, name, role) VALUES ('default_user', 'admin@local', '預設管理員', 'admin')`
      )
      .run();

    // Migrations for existing databases
    try {
      // 1. Migrate reading_progress to composite key (user_id, book_id) if user_id is missing
      const progressColumns = dbInstance
        .prepare("PRAGMA table_info(reading_progress)")
        .all() as Array<{ name: string; pk: number }>;
      const hasUserIdInProgress = progressColumns.some((c) => c.name === "user_id");
      if (!hasUserIdInProgress) {
        console.log(
          "[DB Migration] Upgrading reading_progress table to composite primary key (user_id, book_id)..."
        );
        dbInstance.exec(`
          CREATE TABLE IF NOT EXISTS reading_progress_v2 (
            user_id TEXT NOT NULL DEFAULT 'default_user',
            book_id TEXT NOT NULL,
            char_offset INTEGER NOT NULL DEFAULT 0,
            percentage REAL NOT NULL DEFAULT 0.0,
            device_name TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            chapter_index INTEGER,
            page_index INTEGER,
            page_ratio REAL,
            total_pages INTEGER,
            PRIMARY KEY (user_id, book_id),
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
          );
          INSERT OR IGNORE INTO reading_progress_v2 (user_id, book_id, char_offset, percentage, device_name, updated_at, chapter_index, page_index, page_ratio, total_pages)
          SELECT 'default_user', book_id, char_offset, percentage, device_name, updated_at, chapter_index, page_index, page_ratio, total_pages
          FROM reading_progress;
          DROP TABLE reading_progress;
          ALTER TABLE reading_progress_v2 RENAME TO reading_progress;
        `);
      }

      // Check remaining reading_progress columns if needed
      const refreshedProgressCols = dbInstance
        .prepare("PRAGMA table_info(reading_progress)")
        .all() as Array<{ name: string }>;
      const progColNames = new Set(refreshedProgressCols.map((c) => c.name));
      if (!progColNames.has("chapter_index")) {
        dbInstance.exec("ALTER TABLE reading_progress ADD COLUMN chapter_index INTEGER");
      }
      if (!progColNames.has("page_index")) {
        dbInstance.exec("ALTER TABLE reading_progress ADD COLUMN page_index INTEGER");
      }
      if (!progColNames.has("page_ratio")) {
        dbInstance.exec("ALTER TABLE reading_progress ADD COLUMN page_ratio REAL");
      }
      if (!progColNames.has("total_pages")) {
        dbInstance.exec("ALTER TABLE reading_progress ADD COLUMN total_pages INTEGER");
      }

      // 2. Ensure bookmarks table has user_id column
      const bookmarkColumns = dbInstance
        .prepare("PRAGMA table_info(bookmarks)")
        .all() as Array<{ name: string }>;
      const bookmarkColNames = new Set(bookmarkColumns.map((c) => c.name));
      if (!bookmarkColNames.has("user_id")) {
        console.log("[DB Migration] Adding user_id to bookmarks table...");
        dbInstance.exec("ALTER TABLE bookmarks ADD COLUMN user_id TEXT DEFAULT 'default_user'");
        dbInstance.exec(
          "CREATE INDEX IF NOT EXISTS idx_bookmarks_user_book ON bookmarks(user_id, book_id)"
        );
      }

      // 3. Ensure books table has uploader_id, uploader_name, chapters_json
      const bookColumns = dbInstance
        .prepare("PRAGMA table_info(books)")
        .all() as Array<{ name: string }>;
      const bookColNames = new Set(bookColumns.map((c) => c.name));
      if (!bookColNames.has("uploader_id")) {
        dbInstance.exec("ALTER TABLE books ADD COLUMN uploader_id TEXT DEFAULT 'default_user'");
      }
      if (!bookColNames.has("uploader_name")) {
        dbInstance.exec("ALTER TABLE books ADD COLUMN uploader_name TEXT DEFAULT '系統'");
      }
      if (!bookColNames.has("chapters_json")) {
        dbInstance.exec("ALTER TABLE books ADD COLUMN chapters_json TEXT");
      }
    } catch (e) {
      console.warn("Table migration notice:", e);
    }
  }
  return dbInstance;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: "admin" | "user";
  created_at: string;
  updated_at: string;
}

export interface Book {
  id: string;
  title: string;
  file_name: string;
  file_size: number;
  total_chars: number;
  uploader_id?: string;
  uploader_name?: string;
  created_at: string;
  updated_at: string;
  chapters_json?: string;
  char_offset?: number;
  percentage?: number;
  last_device?: string;
  progress_updated_at?: string;
}

export interface ReadingProgress {
  user_id?: string;
  book_id: string;
  char_offset: number;
  percentage: number;
  device_name: string;
  updated_at: string;
  chapter_index?: number;
  page_index?: number;
  page_ratio?: number;
  total_pages?: number;
}

export interface Bookmark {
  id: string;
  user_id?: string;
  book_id: string;
  char_offset: number;
  title: string;
  preview_text: string;
  created_at: string;
}

// User Model
export const UserModel = {
  getById(id: string): User | undefined {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
    return stmt.get(id) as User | undefined;
  },

  getByEmail(email: string): User | undefined {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM users WHERE email = ?");
    return stmt.get(email) as User | undefined;
  },

  createOrUpdate(user: {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    role?: "admin" | "user";
  }): User {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO users (id, email, name, avatar, role)
      VALUES (@id, @email, @name, @avatar, COALESCE(@role, 'user'))
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        avatar = COALESCE(excluded.avatar, users.avatar),
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run({
      ...user,
      avatar: user.avatar || null,
      role: user.role || "user",
    });
    return this.getById(user.id)!;
  },

  getAll(): User[] {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM users ORDER BY created_at ASC");
    return stmt.all() as User[];
  },
};

// Database helper functions for Books
export const BookModel = {
  getAll(userId: string = "default_user"): Book[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        b.*,
        p.char_offset,
        p.percentage,
        p.device_name as last_device,
        p.updated_at as progress_updated_at
      FROM books b
      LEFT JOIN reading_progress p ON b.id = p.book_id AND p.user_id = ?
      ORDER BY COALESCE(p.updated_at, b.created_at) DESC
    `);
    return stmt.all(userId) as Book[];
  },

  getById(id: string, userId: string = "default_user"): Book | undefined {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        b.*,
        p.char_offset,
        p.percentage,
        p.device_name as last_device,
        p.updated_at as progress_updated_at
      FROM books b
      LEFT JOIN reading_progress p ON b.id = p.book_id AND p.user_id = ?
      WHERE b.id = ?
    `);
    return stmt.get(userId, id) as Book | undefined;
  },

  create(book: {
    id: string;
    title: string;
    file_name: string;
    file_size: number;
    total_chars: number;
    uploader_id?: string;
    uploader_name?: string;
    chapters_json?: string;
  }) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO books (id, title, file_name, file_size, total_chars, uploader_id, uploader_name, chapters_json)
      VALUES (@id, @title, @file_name, @file_size, @total_chars, @uploader_id, @uploader_name, @chapters_json)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        total_chars = excluded.total_chars,
        uploader_id = COALESCE(excluded.uploader_id, books.uploader_id),
        uploader_name = COALESCE(excluded.uploader_name, books.uploader_name),
        chapters_json = COALESCE(excluded.chapters_json, books.chapters_json),
        updated_at = CURRENT_TIMESTAMP
    `);
    const result = stmt.run({
      ...book,
      uploader_id: book.uploader_id || "default_user",
      uploader_name: book.uploader_name || "系統",
      chapters_json: book.chapters_json || null,
    });
    try {
      db.pragma("wal_checkpoint(PASSIVE)");
    } catch (e) {}
    console.log(`[DB] Book persisted: "${book.title}" (${book.id}) to ${DB_PATH}`);
    return result;
  },

  updateChapters(id: string, chaptersJson: string) {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE books SET chapters_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    return stmt.run(chaptersJson, id);
  },

  delete(id: string) {
    const book = this.getById(id);
    if (book) {
      const filePath = path.join(UPLOADS_DIR, book.file_name);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error("Failed to delete file:", e);
        }
      }
    }
    const db = getDb();
    const stmt = db.prepare("DELETE FROM books WHERE id = ?");
    return stmt.run(id);
  },

  updateTitle(id: string, title: string) {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE books 
      SET title = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(title, id);
  },
};

export const ProgressModel = {
  get(bookId: string, userId: string = "default_user"): ReadingProgress | undefined {
    const db = getDb();
    const stmt = db.prepare(
      "SELECT * FROM reading_progress WHERE user_id = ? AND book_id = ?"
    );
    return stmt.get(userId, bookId) as ReadingProgress | undefined;
  },

  upsert(
    bookId: string,
    charOffset: number,
    percentage: number,
    deviceName: string,
    clientUpdatedAt?: string,
    extra?: {
      chapter_index?: number;
      page_index?: number;
      page_ratio?: number;
      total_pages?: number;
    },
    userId: string = "default_user"
  ): { updated: boolean; currentProgress: ReadingProgress } {
    const db = getDb();
    const existing = this.get(bookId, userId);
    const now = clientUpdatedAt || new Date().toISOString();
    const chIdx = extra?.chapter_index ?? null;
    const pIdx = extra?.page_index ?? null;
    const pRatio = extra?.page_ratio ?? null;
    const totPages = extra?.total_pages ?? null;

    if (existing) {
      const existingTime = new Date(existing.updated_at).getTime();
      const clientTime = new Date(now).getTime();

      // LWW: If incoming progress is newer or equal
      if (clientTime >= existingTime - 1000) {
        const stmt = db.prepare(`
          UPDATE reading_progress
          SET char_offset = ?, percentage = ?, device_name = ?, updated_at = ?,
              chapter_index = COALESCE(?, chapter_index),
              page_index = COALESCE(?, page_index),
              page_ratio = COALESCE(?, page_ratio),
              total_pages = COALESCE(?, total_pages)
          WHERE user_id = ? AND book_id = ?
        `);
        stmt.run(charOffset, percentage, deviceName, now, chIdx, pIdx, pRatio, totPages, userId, bookId);
        return {
          updated: true,
          currentProgress: {
            user_id: userId,
            book_id: bookId,
            char_offset: charOffset,
            percentage,
            device_name: deviceName,
            updated_at: now,
            chapter_index: chIdx ?? existing.chapter_index,
            page_index: pIdx ?? existing.page_index,
            page_ratio: pRatio ?? existing.page_ratio,
            total_pages: totPages ?? existing.total_pages,
          },
        };
      } else {
        // Server has newer record (Conflict)
        return {
          updated: false,
          currentProgress: existing,
        };
      }
    } else {
      const stmt = db.prepare(`
        INSERT INTO reading_progress (user_id, book_id, char_offset, percentage, device_name, updated_at, chapter_index, page_index, page_ratio, total_pages)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(userId, bookId, charOffset, percentage, deviceName, now, chIdx, pIdx, pRatio, totPages);
      return {
        updated: true,
        currentProgress: {
          user_id: userId,
          book_id: bookId,
          char_offset: charOffset,
          percentage,
          device_name: deviceName,
          updated_at: now,
          chapter_index: chIdx ?? undefined,
          page_index: pIdx ?? undefined,
          page_ratio: pRatio ?? undefined,
          total_pages: totPages ?? undefined,
        },
      };
    }
  },
};

export const BookmarkModel = {
  getAllByBookId(bookId: string, userId: string = "default_user"): Bookmark[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM bookmarks 
      WHERE user_id = ? AND book_id = ?
      ORDER BY char_offset ASC, created_at DESC
    `);
    return stmt.all(userId, bookId) as Bookmark[];
  },

  create(bookmark: {
    id: string;
    book_id: string;
    char_offset: number;
    title: string;
    preview_text: string;
    user_id?: string;
  }) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO bookmarks (id, user_id, book_id, char_offset, title, preview_text)
      VALUES (@id, @user_id, @book_id, @char_offset, @title, @preview_text)
    `);
    return stmt.run({
      ...bookmark,
      user_id: bookmark.user_id || "default_user",
    });
  },

  delete(id: string, userId?: string) {
    const db = getDb();
    if (userId) {
      const stmt = db.prepare("DELETE FROM bookmarks WHERE id = ? AND user_id = ?");
      return stmt.run(id, userId);
    }
    const stmt = db.prepare("DELETE FROM bookmarks WHERE id = ?");
    return stmt.run(id);
  },
};

export { DATA_DIR, UPLOADS_DIR, DB_PATH };

