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
const LS_BOOKS_KEY = "novel_reader_books_cache";

export const BooksCache = {
  save(books: unknown[]) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LS_BOOKS_KEY, JSON.stringify(books));
    } catch {}
  },
  load<T>(): T[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(LS_BOOKS_KEY) || "[]");
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  },
  remove(bookId: string) {
    const list = this.load<{ id: string }>();
    if (!list.length) return;
    this.save(list.filter((b) => b.id !== bookId));
  },
  rename(bookId: string, title: string) {
    const list = this.load<{ id: string; title: string }>();
    if (!list.length) return;
    this.save(list.map((b) => (b.id === bookId ? { ...b, title } : b)));
  },
};

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
  async listCachedBookIds(): Promise<Set<string>> {
    try {
      const db = await getLocalDB();
      if (!db) return new Set();
      const keys = (await db.getAllKeys("books_content")) as string[];
      return new Set(keys.filter((k) => k && k !== "__shell__"));
    } catch {
      return new Set();
    }
  },

  async mergeBooksWithLocalState<
    T extends {
      id: string;
      title: string;
      file_size?: number;
      total_chars: number;
      created_at?: string;
      char_offset?: number;
      percentage?: number;
      last_device?: string;
      progress_updated_at?: string;
      chapter_index?: number;
      page_index?: number;
      page_ratio?: number;
      total_pages?: number;
    }
  >(baseBooks: T[], includeIdbOnlyBooks: boolean = false): Promise<T[]> {
    const bookMap = new Map<string, T>();
    for (const b of baseBooks) {
      if (b && b.id && b.id !== "__shell__") {
        bookMap.set(b.id, { ...b });
      }
    }

    if (includeIdbOnlyBooks) {
      try {
        const db = await getLocalDB();
        if (db) {
          const allContent = await db.getAll("books_content");
          for (const rec of allContent) {
            if (!rec?.book_id || rec.book_id === "__shell__") continue;
            if (!bookMap.has(rec.book_id)) {
              const chars = rec.total_chars || rec.content?.length || 0;
              bookMap.set(rec.book_id, {
                id: rec.book_id,
                title: rec.title || "已快取小說",
                file_size: chars * 3,
                total_chars: chars,
                created_at: rec.cached_at || new Date().toISOString(),
              } as T);
            }
          }
        }
      } catch {}
    }

    const result: T[] = [];
    for (const book of bookMap.values()) {
      const localProg = await this.getLocalProgress(book.id);
      if (localProg) {
        const localTime = parseSafeTime(localProg.updated_at);
        const bookTime = parseSafeTime(book.progress_updated_at);
        if (localTime >= bookTime) {
          book.char_offset = localProg.char_offset;
          book.percentage = localProg.percentage;
          book.last_device = localProg.device_name || book.last_device;
          book.progress_updated_at = localProg.updated_at;
          book.chapter_index = localProg.chapter_index ?? book.chapter_index;
          book.page_index = localProg.page_index ?? book.page_index;
          book.page_ratio = localProg.page_ratio ?? book.page_ratio;
          book.total_pages = localProg.total_pages ?? book.total_pages;
        }
      }
      result.push(book);
    }

    return result;
  },

  async saveBookContent(bookId: string, title: string, content: string, totalChars: number) {
    if (
      !bookId ||
      bookId === "__shell__" ||
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
    BooksCache.remove(bookId);
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
    BooksCache.rename(bookId, title);
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
    if (!bookId || bookId === "__shell__") return;
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
    if (!bookId || bookId === "__shell__") return;
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
