import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// Define storage directory: can be overridden via DATA_DIR environment variable (e.g. for Docker / NAS mount)
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
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
    try {
      dbInstance.pragma("journal_mode = WAL");
    } catch (e) {
      try {
        dbInstance.pragma("journal_mode = DELETE");
      } catch (err) {
        console.warn("Could not set journal mode:", err);
      }
    }

    // Initialize Schema lazily
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        total_chars INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reading_progress (
        book_id TEXT PRIMARY KEY,
        char_offset INTEGER NOT NULL DEFAULT 0,
        percentage REAL NOT NULL DEFAULT 0.0,
        device_name TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        char_offset INTEGER NOT NULL,
        title TEXT NOT NULL,
        preview_text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      );
    `);
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
  char_offset?: number;
  percentage?: number;
  last_device?: string;
  progress_updated_at?: string;
}

export interface ReadingProgress {
  book_id: string;
  char_offset: number;
  percentage: number;
  device_name: string;
  updated_at: string;
}

export interface Bookmark {
  id: string;
  book_id: string;
  char_offset: number;
  title: string;
  preview_text: string;
  created_at: string;
}

// Database helper functions
export const BookModel = {
  getAll(): Book[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        b.*,
        p.char_offset,
        p.percentage,
        p.device_name as last_device,
        p.updated_at as progress_updated_at
      FROM books b
      LEFT JOIN reading_progress p ON b.id = p.book_id
      ORDER BY COALESCE(p.updated_at, b.created_at) DESC
    `);
    return stmt.all() as Book[];
  },

  getById(id: string): Book | undefined {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT 
        b.*,
        p.char_offset,
        p.percentage,
        p.device_name as last_device,
        p.updated_at as progress_updated_at
      FROM books b
      LEFT JOIN reading_progress p ON b.id = p.book_id
      WHERE b.id = ?
    `);
    return stmt.get(id) as Book | undefined;
  },

  create(book: {
    id: string;
    title: string;
    file_name: string;
    file_size: number;
    total_chars: number;
  }) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO books (id, title, file_name, file_size, total_chars)
      VALUES (@id, @title, @file_name, @file_size, @total_chars)
    `);
    return stmt.run(book);
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
};

export const ProgressModel = {
  get(bookId: string): ReadingProgress | undefined {
    const db = getDb();
    const stmt = db.prepare(
      "SELECT * FROM reading_progress WHERE book_id = ?"
    );
    return stmt.get(bookId) as ReadingProgress | undefined;
  },

  upsert(
    bookId: string,
    charOffset: number,
    percentage: number,
    deviceName: string,
    clientUpdatedAt?: string
  ): { updated: boolean; currentProgress: ReadingProgress } {
    const db = getDb();
    const existing = this.get(bookId);
    const now = clientUpdatedAt || new Date().toISOString();

    if (existing) {
      const existingTime = new Date(existing.updated_at).getTime();
      const clientTime = new Date(now).getTime();

      // LWW: If incoming progress is newer or equal
      if (clientTime >= existingTime - 1000) {
        const stmt = db.prepare(`
          UPDATE reading_progress
          SET char_offset = ?, percentage = ?, device_name = ?, updated_at = ?
          WHERE book_id = ?
        `);
        stmt.run(charOffset, percentage, deviceName, now, bookId);
        return {
          updated: true,
          currentProgress: {
            book_id: bookId,
            char_offset: charOffset,
            percentage,
            device_name: deviceName,
            updated_at: now,
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
        INSERT INTO reading_progress (book_id, char_offset, percentage, device_name, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(bookId, charOffset, percentage, deviceName, now);
      return {
        updated: true,
        currentProgress: {
          book_id: bookId,
          char_offset: charOffset,
          percentage,
          device_name: deviceName,
          updated_at: now,
        },
      };
    }
  },
};

export { DATA_DIR, UPLOADS_DIR };
