import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { parseSafeTime } from "./format";

function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return process.env.DATA_DIR;
  }
  if (process.cwd().includes(".next")) {
    return path.resolve(process.cwd(), "../../data");
  }
  return path.join(process.cwd(), "data");
}

const DATA_DIR = resolveDataDir();
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "novel_reader.db");
const DEFAULT_USER_ID = "default_user";

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    dbInstance = new Database(DB_PATH, {
      timeout: 10000,
    });

    dbInstance.pragma("busy_timeout = 10000");
    dbInstance.pragma("foreign_keys = ON");

    const preferredJournalMode = process.env.SQLITE_JOURNAL_MODE || "WAL";
    try {
      dbInstance.pragma(`journal_mode = ${preferredJournalMode}`);
    } catch {
      try {
        dbInstance.pragma("journal_mode = DELETE");
      } catch (err) {
        console.warn("[DB] Could not set journal mode:", err);
      }
    }

    if (typeof process !== "undefined" && !process.env.__DB_SHUTDOWN_REGISTERED) {
      process.env.__DB_SHUTDOWN_REGISTERED = "1";
      const flushAndClose = () => {
        if (dbInstance) {
          try {
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

    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        total_chars INTEGER NOT NULL,
        chapters_json TEXT,
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
    `);

    // 向下相容舊資料庫欄位遷移
    try {
      const bookColumns = dbInstance
        .prepare("PRAGMA table_info(books)")
        .all() as Array<{ name: string }>;
      const bookColNames = new Set(bookColumns.map((c) => c.name));
      if (!bookColNames.has("chapters_json")) {
        dbInstance.exec("ALTER TABLE books ADD COLUMN chapters_json TEXT");
      }
    } catch (e) {
      console.warn("[DB Migration] books table migration notice:", e);
    }

    try {
      const refreshedProgressCols = dbInstance
        .prepare("PRAGMA table_info(reading_progress)")
        .all() as Array<{ name: string }>;
      const progColNames = new Set(refreshedProgressCols.map((c) => c.name));
      if (!progColNames.has("user_id")) {
        dbInstance.exec(
          "ALTER TABLE reading_progress ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default_user'"
        );
      }
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
    } catch (e) {
      console.warn("[DB Migration] reading_progress table migration notice:", e);
    }
  }
  return dbInstance;
}

export interface Book {
  id: string;
  title: string;
  file_name: string;
  file_size: number;
  total_chars: number;
  created_at: string;
  updated_at: string;
  chapters_json?: string;
  char_offset?: number;
  percentage?: number;
  last_device?: string;
  progress_updated_at?: string;
  chapter_index?: number;
  page_index?: number;
  page_ratio?: number;
  total_pages?: number;
}

export interface ReadingProgress {
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

export const BookModel = {
  getAll(): Book[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        b.*,
        p.char_offset,
        p.percentage,
        p.device_name as last_device,
        p.updated_at as progress_updated_at,
        p.chapter_index,
        p.page_index,
        p.page_ratio,
        p.total_pages
      FROM books b
      LEFT JOIN reading_progress p ON b.id = p.book_id AND p.user_id = ?
      ORDER BY COALESCE(p.updated_at, b.created_at) DESC
    `);
    return stmt.all(DEFAULT_USER_ID) as Book[];
  },

  getById(id: string): Book | undefined {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        b.*,
        p.char_offset,
        p.percentage,
        p.device_name as last_device,
        p.updated_at as progress_updated_at,
        p.chapter_index,
        p.page_index,
        p.page_ratio,
        p.total_pages
      FROM books b
      LEFT JOIN reading_progress p ON b.id = p.book_id AND p.user_id = ?
      WHERE b.id = ?
    `);
    return stmt.get(DEFAULT_USER_ID, id) as Book | undefined;
  },

  create(book: {
    id: string;
    title: string;
    file_name: string;
    file_size: number;
    total_chars: number;
    chapters_json?: string;
  }) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO books (id, title, file_name, file_size, total_chars, chapters_json)
      VALUES (@id, @title, @file_name, @file_size, @total_chars, @chapters_json)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        total_chars = excluded.total_chars,
        chapters_json = COALESCE(excluded.chapters_json, books.chapters_json),
        updated_at = CURRENT_TIMESTAMP
    `);
    const result = stmt.run({
      ...book,
      chapters_json: book.chapters_json || null,
    });
    try {
      db.pragma("wal_checkpoint(PASSIVE)");
    } catch {}
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
    db.prepare("DELETE FROM reading_progress WHERE book_id = ?").run(id);
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
  get(bookId: string): ReadingProgress | undefined {
    const db = getDb();
    const stmt = db.prepare(
      "SELECT * FROM reading_progress WHERE user_id = ? AND book_id = ?"
    );
    return stmt.get(DEFAULT_USER_ID, bookId) as ReadingProgress | undefined;
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
    }
  ): { updated: boolean; currentProgress: ReadingProgress } {
    const db = getDb();
    const now = clientUpdatedAt || new Date().toISOString();
    const chIdx = extra?.chapter_index ?? null;
    const pIdx = extra?.page_index ?? null;
    const pRatio = extra?.page_ratio ?? null;
    const totPages = extra?.total_pages ?? null;

    const book = BookModel.getById(bookId);
    if (!book) {
      return {
        updated: false,
        currentProgress: {
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

    const existing = this.get(bookId);

    if (existing) {
      const existingTime = parseSafeTime(existing.updated_at);
      const clientTime = parseSafeTime(now);

      if (clientTime >= existingTime - 1000) {
        const nextChIdx = chIdx !== null ? chIdx : (existing.chapter_index ?? null);
        const isChapterSwitched =
          chIdx !== null &&
          existing.chapter_index !== undefined &&
          existing.chapter_index !== null &&
          existing.chapter_index !== chIdx;
        const nextPIdx =
          pIdx !== null ? pIdx : isChapterSwitched ? null : (existing.page_index ?? null);
        const nextPRatio =
          pRatio !== null ? pRatio : isChapterSwitched ? null : (existing.page_ratio ?? null);
        const nextTotPages =
          totPages !== null ? totPages : isChapterSwitched ? null : (existing.total_pages ?? null);

        const stmt = db.prepare(`
          UPDATE reading_progress
          SET char_offset = ?, percentage = ?, device_name = ?, updated_at = ?,
              chapter_index = ?,
              page_index = ?,
              page_ratio = ?,
              total_pages = ?
          WHERE user_id = ? AND book_id = ?
        `);
        stmt.run(
          charOffset,
          percentage,
          deviceName,
          now,
          nextChIdx,
          nextPIdx,
          nextPRatio,
          nextTotPages,
          DEFAULT_USER_ID,
          bookId
        );
        return {
          updated: true,
          currentProgress: {
            book_id: bookId,
            char_offset: charOffset,
            percentage,
            device_name: deviceName,
            updated_at: now,
            chapter_index: nextChIdx ?? undefined,
            page_index: nextPIdx ?? undefined,
            page_ratio: nextPRatio ?? undefined,
            total_pages: nextTotPages ?? undefined,
          },
        };
      }
      return {
        updated: false,
        currentProgress: existing,
      };
    }

    const stmt = db.prepare(`
      INSERT INTO reading_progress (user_id, book_id, char_offset, percentage, device_name, updated_at, chapter_index, page_index, page_ratio, total_pages)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      DEFAULT_USER_ID,
      bookId,
      charOffset,
      percentage,
      deviceName,
      now,
      chIdx,
      pIdx,
      pRatio,
      totPages
    );
    return {
      updated: true,
      currentProgress: {
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
  },
};

export { DATA_DIR, UPLOADS_DIR, DB_PATH };
