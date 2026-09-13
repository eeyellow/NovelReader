import { openDB, DBSchema, IDBPDatabase } from "idb";
import type { Book } from "./db";

interface NovelReaderDB extends DBSchema {
  books_content: {
    key: string; // book_id
    value: {
      book_id: string;
      title: string;
      content: string;
      total_chars: number;
      cached_at: string;
    };
  };
  local_progress: {
    key: string; // book_id
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
      synced: boolean;
    };
  };
  bookmarks: {
    key: string; // id
    value: {
      id: string;
      book_id: string;
      char_offset: number;
      title: string;
      preview_text: string;
      created_at: string;
    };
    indexes: { "by_book": string };
  };
  chapters_cache: {
    key: string; // book_id
    value: {
      book_id: string;
      chapters: any[];
      cached_at: string;
    };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = "novel_reader_local";
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<NovelReaderDB>> | null = null;

export function getLocalDB() {
  if (typeof window === "undefined") {
    return null;
  }
  if (!dbPromise) {
    dbPromise = openDB<NovelReaderDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains("books_content")) {
          db.createObjectStore("books_content", { keyPath: "book_id" });
        }
        if (!db.objectStoreNames.contains("local_progress")) {
          db.createObjectStore("local_progress", { keyPath: "book_id" });
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
        if (!db.objectStoreNames.contains("bookmarks")) {
          const bmStore = db.createObjectStore("bookmarks", { keyPath: "id" });
          bmStore.createIndex("by_book", "book_id");
        }
        if (!db.objectStoreNames.contains("chapters_cache")) {
          db.createObjectStore("chapters_cache", { keyPath: "book_id" });
        }
      },
      blocked() {
        console.warn("IndexedDB upgrade blocked: Please close other tabs of NovelReader");
      },
      blocking() {
        console.warn("IndexedDB blocking: Closing connection to allow upgrade");
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

// Request persistent storage for Safari/iOS/Android
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof window !== "undefined" && navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      return await navigator.storage.persist();
    }
    return isPersisted;
  }
  return false;
}

export const LocalStore = {
  async saveBookContent(bookId: string, title: string, content: string, totalChars: number) {
    if (!content || typeof content !== "string" || (content.startsWith('{"') && content.includes('"success":false'))) {
      console.warn("Refusing to save corrupt content for book:", bookId);
      return;
    }
    const db = await getLocalDB();
    if (!db) return;
    await db.put("books_content", {
      book_id: bookId,
      title,
      content,
      total_chars: totalChars || content.length,
      cached_at: new Date().toISOString(),
    });
  },

  async getBookContent(bookId: string) {
    const db = await getLocalDB();
    if (!db) return null;
    return await db.get("books_content", bookId);
  },

  async isBookCached(bookId: string): Promise<boolean> {
    const db = await getLocalDB();
    if (!db) return false;
    const count = await db.count("books_content", bookId);
    return count > 0;
  },

  async clearBookContentOnly(bookId: string) {
    const db = await getLocalDB();
    if (!db) return;
    await db.delete("books_content", bookId);
    await db.delete("chapters_cache", bookId);
  },

  async deleteBookContent(bookId: string) {
    const db = await getLocalDB();
    if (!db) return;
    await db.delete("books_content", bookId);
    await db.delete("local_progress", bookId);
    await db.delete("chapters_cache", bookId);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(`novel_reader_prog_${bookId}`);
      } catch (e) {}
    }
    try {
      const tx = db.transaction("bookmarks", "readwrite");
      const index = tx.store.index("by_book");
      let cursor = await index.openCursor(bookId);
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    } catch (e) {
      console.warn("Error cleaning bookmarks for deleted book:", e);
    }
  },

  async updateBookTitle(bookId: string, title: string) {
    const db = await getLocalDB();
    if (!db) return;
    const existing = await db.get("books_content", bookId);
    if (existing) {
      existing.title = title;
      await db.put("books_content", existing);
    }
  },

  async saveLocalProgress(
    bookId: string,
    charOffset: number,
    percentage: number,
    deviceName: string,
    synced: boolean = false,
    timestamp?: string,
    extra?: {
      chapter_index?: number;
      page_index?: number;
      page_ratio?: number;
      total_pages?: number;
    }
  ) {
    const db = await getLocalDB();
    if (!db) return;
    const existing = await db.get("local_progress", bookId);
    const updatedAt = timestamp || new Date().toISOString();
    const newProgress = {
      book_id: bookId,
      char_offset: charOffset,
      percentage,
      chapter_index:
        extra?.chapter_index !== undefined ? extra.chapter_index : existing?.chapter_index,
      page_index: extra?.page_index !== undefined ? extra.page_index : existing?.page_index,
      page_ratio: extra?.page_ratio !== undefined ? extra.page_ratio : existing?.page_ratio,
      total_pages: extra?.total_pages !== undefined ? extra.total_pages : existing?.total_pages,
      device_name: deviceName,
      updated_at: updatedAt,
      synced,
    };
    await db.put("local_progress", newProgress);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`novel_reader_prog_${bookId}`, JSON.stringify(newProgress));
      } catch (e) {}
    }
  },

  async getLocalProgress(bookId: string) {
    const db = await getLocalDB();
    let record: any = null;
    if (db) {
      record = await db.get("local_progress", bookId);
    }
    if (!record && typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(`novel_reader_prog_${bookId}`);
        if (raw) record = JSON.parse(raw);
      } catch (e) {}
    }
    return record;
  },

  async getAllUnsyncedProgress() {
    const db = await getLocalDB();
    if (!db) return [];
    const all = await db.getAll("local_progress");
    return all.filter((p) => !p.synced);
  },

  async markProgressSynced(bookId: string) {
    const db = await getLocalDB();
    if (!db) return;
    const existing = await db.get("local_progress", bookId);
    if (existing) {
      existing.synced = true;
      await db.put("local_progress", existing);
    }
  },

  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const db = await getLocalDB();
    if (!db) return defaultValue;
    const val = await db.get("settings", key);
    return val !== undefined ? (val as T) : defaultValue;
  },

  async getAllCachedBooks(): Promise<Book[]> {
    try {
      const db = await getLocalDB();
      if (!db) return [];
      const contents = await db.getAll("books_content");
      return contents
        .filter((c) => c && c.book_id)
        .map((c) => ({
          id: c.book_id,
          title: c.title || "未命名小說",
          file_name: `${c.title || c.book_id}.txt`,
          file_size: c.content?.length || 0,
          total_chars: c.total_chars || c.content?.length || 0,
          created_at: c.cached_at || new Date().toISOString(),
          updated_at: c.cached_at || new Date().toISOString(),
        }));
    } catch (e) {
      console.warn("Failed to get all cached books from IndexedDB:", e);
      return [];
    }
  },

  async saveBookmark(bookmark: {
    id: string;
    book_id: string;
    char_offset: number;
    title: string;
    preview_text: string;
    created_at?: string;
  }) {
    const db = await getLocalDB();
    if (!db) return;
    await db.put("bookmarks", {
      ...bookmark,
      created_at: bookmark.created_at || new Date().toISOString(),
    });
  },

  async getBookmarks(bookId: string) {
    const db = await getLocalDB();
    if (!db) return [];
    const index = db.transaction("bookmarks").store.index("by_book");
    return await index.getAll(bookId);
  },

  async deleteBookmark(id: string) {
    const db = await getLocalDB();
    if (!db) return;
    await db.delete("bookmarks", id);
  },

  async setSetting(key: string, value: any) {
    const db = await getLocalDB();
    if (!db) return;
    await db.put("settings", value, key);
  },

  async saveChapters(bookId: string, chapters: any[]) {
    const db = await getLocalDB();
    if (!db || !chapters) return;
    await db.put("chapters_cache", {
      book_id: bookId,
      chapters,
      cached_at: new Date().toISOString(),
    });
  },

  async getChapters(bookId: string): Promise<any[] | null> {
    const db = await getLocalDB();
    if (!db) return null;
    const record = await db.get("chapters_cache", bookId);
    return record?.chapters || null;
  },
};

