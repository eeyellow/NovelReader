import { openDB, DBSchema, IDBPDatabase } from "idb";

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
      device_name: string;
      updated_at: string;
      synced: boolean;
    };
  };
  settings: {
    key: string;
    value: any;
  };
}

const DB_NAME = "novel_reader_local";
const DB_VERSION = 1;

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
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
      },
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
    const db = await getLocalDB();
    if (!db) return;
    await db.put("books_content", {
      book_id: bookId,
      title,
      content,
      total_chars: totalChars,
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

  async deleteBookContent(bookId: string) {
    const db = await getLocalDB();
    if (!db) return;
    await db.delete("books_content", bookId);
    await db.delete("local_progress", bookId);
  },

  async saveLocalProgress(
    bookId: string,
    charOffset: number,
    percentage: number,
    deviceName: string,
    synced: boolean = false,
    timestamp?: string
  ) {
    const db = await getLocalDB();
    if (!db) return;
    const updatedAt = timestamp || new Date().toISOString();
    await db.put("local_progress", {
      book_id: bookId,
      char_offset: charOffset,
      percentage,
      device_name: deviceName,
      updated_at: updatedAt,
      synced,
    });
  },

  async getLocalProgress(bookId: string) {
    const db = await getLocalDB();
    if (!db) return null;
    return await db.get("local_progress", bookId);
  },

  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const db = await getLocalDB();
    if (!db) return defaultValue;
    const val = await db.get("settings", key);
    return val !== undefined ? (val as T) : defaultValue;
  },

  async setSetting(key: string, value: any) {
    const db = await getLocalDB();
    if (!db) return;
    await db.put("settings", value, key);
  },
};
