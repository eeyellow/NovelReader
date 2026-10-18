import { openDB, DBSchema, IDBPDatabase } from "idb";
import { parseSafeTime } from "./format";

interface NovelReaderDB extends DBSchema {
  books_content: {
    key: string;
    value: {
      book_id: string;
      title: string;
      content: string;
      total_chars: number;
      cached_at: string;
    };
  };
  local_progress: {
    key: string;
    value: {
      book_id: string;
      char_offset: number;
      percentage: number;
      chapter_index?: number;
      page_index?: number;
      page_ratio?: number;
      total_pages?: number;
      device_name: string;
      updated_at: string;
    };
  };
  chapters_cache: {
    key: string;
    value: {
      book_id: string;
      chapters: any[];
      cached_at: string;
    };
  };
}

const DB_NAME = "novel_reader_local";
const DB_VERSION = 3;
const LS_PROGRESS_PREFIX = "novel_reader_prog_";

let dbPromise: Promise<IDBPDatabase<NovelReaderDB>> | null = null;

export function getLocalDB() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!dbPromise) {
    dbPromise = openDB<NovelReaderDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("books_content")) {
          db.createObjectStore("books_content", { keyPath: "book_id" });
        }
        if (!db.objectStoreNames.contains("local_progress")) {
          db.createObjectStore("local_progress", { keyPath: "book_id" });
        }
        if (!db.objectStoreNames.contains("chapters_cache")) {
          db.createObjectStore("chapters_cache", { keyPath: "book_id" });
        }
      },
      blocking() {
        if (dbPromise) {
          dbPromise.then((db) => db.close()).catch(() => {});
          dbPromise = null;
        }
      },
      terminated() {
        dbPromise = null;
      },
    }).catch((err) => {
      console.error("Failed to open IndexedDB:", err);
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export type LocalProgressRecord = NovelReaderDB["local_progress"]["value"];

export interface ProgressExtraFields {
  chapter_index?: number;
  page_index?: number;
  page_ratio?: number;
  total_pages?: number;
}

function readLsProgress(bookId: string): LocalProgressRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw =
      localStorage.getItem(`${LS_PROGRESS_PREFIX}${bookId}`) ||
      localStorage.getItem(`${LS_PROGRESS_PREFIX}default_user:${bookId}`);
    return raw ? (JSON.parse(raw) as LocalProgressRecord) : null;
  } catch {
    return null;
  }
}

function writeLsProgress(bookId: string, record: LocalProgressRecord) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${LS_PROGRESS_PREFIX}${bookId}`, JSON.stringify(record));
  } catch {}
}

export const LocalStore = {
  async saveBookContent(bookId: string, title: string, content: string, totalChars: number) {
    if (
      !content ||
      typeof content !== "string" ||
      (content.startsWith('{"') && content.includes('"success":false'))
    ) {
      return;
    }
    try {
      const db = await getLocalDB();
      if (!db) return;
      await db.put("books_content", {
        book_id: bookId,
        title,
        content,
        total_chars: totalChars || content.length,
        cached_at: new Date().toISOString(),
      });
    } catch {}
  },

  async getBookContent(bookId: string) {
    try {
      const db = await getLocalDB();
      if (!db) return null;
      return await db.get("books_content", bookId);
    } catch {
      return null;
    }
  },

  async deleteBookContent(bookId: string) {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(`${LS_PROGRESS_PREFIX}${bookId}`);
        localStorage.removeItem(`${LS_PROGRESS_PREFIX}default_user:${bookId}`);
      } catch {}
    }
    try {
      const db = await getLocalDB();
      if (!db) return;
      await db.delete("books_content", bookId);
      await db.delete("local_progress", bookId);
      await db.delete("local_progress", `default_user:${bookId}`);
      await db.delete("chapters_cache", bookId);
    } catch {}
  },

  async updateBookTitle(bookId: string, title: string) {
    try {
      const db = await getLocalDB();
      if (!db) return;
      const existing = await db.get("books_content", bookId);
      if (existing) {
        existing.title = title;
        await db.put("books_content", existing);
      }
    } catch {}
  },

  async saveLocalProgress(
    bookId: string,
    charOffset: number,
    percentage: number,
    deviceName: string,
    timestamp?: string,
    extra?: ProgressExtraFields
  ) {
    const newProgress: LocalProgressRecord = {
      book_id: bookId,
      char_offset: charOffset,
      percentage,
      chapter_index: extra?.chapter_index,
      page_index: extra?.page_index,
      page_ratio: extra?.page_ratio,
      total_pages: extra?.total_pages,
      device_name: deviceName,
      updated_at: timestamp || new Date().toISOString(),
    };

    writeLsProgress(bookId, newProgress);

    try {
      const db = await getLocalDB();
      if (!db) return;
      await db.put("local_progress", newProgress);
    } catch {}
  },

  async getLocalProgress(bookId: string): Promise<LocalProgressRecord | null> {
    const lsProg = readLsProgress(bookId);
    try {
      const db = await getLocalDB();
      if (!db) return lsProg;
      const idbProg =
        (await db.get("local_progress", bookId)) ||
        (await db.get("local_progress", `default_user:${bookId}`));
      if (!idbProg) return lsProg;
      if (!lsProg) return idbProg;
      return parseSafeTime(lsProg.updated_at) >= parseSafeTime(idbProg.updated_at)
        ? lsProg
        : idbProg;
    } catch {
      return lsProg;
    }
  },

  async saveChapters(bookId: string, chapters: any[]) {
    try {
      const db = await getLocalDB();
      if (!db || !chapters) return;
      await db.put("chapters_cache", {
        book_id: bookId,
        chapters,
        cached_at: new Date().toISOString(),
      });
    } catch {}
  },

  async getChapters(bookId: string): Promise<any[] | null> {
    try {
      const db = await getLocalDB();
      if (!db) return null;
      const record = await db.get("chapters_cache", bookId);
      return record?.chapters || null;
    } catch {
      return null;
    }
  },
};
