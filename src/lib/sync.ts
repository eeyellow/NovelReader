import { LocalStore } from "./idb";
import { getDeviceName } from "./device";
import { getCachedUserId } from "./clientAuth";

interface SyncPayload {
  book_id: string;
  user_id?: string;
  char_offset: number;
  percentage: number;
  chapter_index?: number;
  page_index?: number;
  page_ratio?: number;
  total_pages?: number;
  device_name: string;
  updated_at: string;
}

let syncTimeout: NodeJS.Timeout | null = null;
let lastSyncedOffset = -1;

export async function sendProgressToServer(
  payload: SyncPayload,
  useBeacon: boolean = false
): Promise<{ success: boolean; currentProgress?: any }> {
  const jsonString = JSON.stringify(payload);

  if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      const blob = new Blob([jsonString], { type: "application/json" });
      const queued = navigator.sendBeacon("/api/progress", blob);
      if (queued) {
        return { success: true };
      }
    } catch (e) {
      console.warn("sendBeacon failed, falling back to fetch", e);
    }
  }

  try {
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: jsonString,
      keepalive: true,
    });
    const data = await res.json();
    return data;
  } catch (error) {
    // Offline or network error - local progress is already saved
    return { success: false };
  }
}

export function syncProgress(
  bookId: string,
  charOffset: number,
  percentage: number,
  forceImmediate: boolean = false,
  extra?: {
    chapter_index?: number;
    page_index?: number;
    page_ratio?: number;
    total_pages?: number;
  }
) {
  if (typeof window === "undefined" || !bookId) return;

  const deviceName = getDeviceName();
  const timestamp = new Date().toISOString();
  const currentUserId = getCachedUserId();

  // 1. Save to local IndexedDB and localStorage immediately with user isolation
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("novel_reader_last_book_id", bookId);
  }

  LocalStore.saveLocalProgress(
    bookId,
    charOffset,
    percentage,
    deviceName,
    false,
    timestamp,
    extra,
    currentUserId
  );

  const payload: SyncPayload = {
    book_id: bookId,
    user_id: currentUserId,
    char_offset: Math.round(charOffset),
    percentage: Number(percentage.toFixed(2)),
    chapter_index: extra?.chapter_index,
    page_index: extra?.page_index,
    page_ratio: extra?.page_ratio,
    total_pages: extra?.total_pages,
    device_name: deviceName,
    updated_at: timestamp,
  };

  // 2. Clear previous debounce timeout
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  if (forceImmediate) {
    sendProgressToServer(payload, true);
    lastSyncedOffset = charOffset;
    return;
  }

  // 3. Debounce background sync (3 seconds) to reduce radio wakeups
  syncTimeout = setTimeout(async () => {
    if (Math.abs(charOffset - lastSyncedOffset) > 10) {
      const result = await sendProgressToServer(payload, false);
      if (result.success) {
        lastSyncedOffset = charOffset;
        LocalStore.saveLocalProgress(
          bookId,
          charOffset,
          percentage,
          deviceName,
          true,
          timestamp,
          extra,
          currentUserId
        );
      }
    }
  }, 3000);
}

/**
 * Flushes all pending unsynced reading progress records stored in IndexedDB to the server
 */
export async function flushUnsyncedProgress(): Promise<void> {
  if (typeof window === "undefined" || !navigator.onLine) return;

  try {
    const unsynced = await LocalStore.getAllUnsyncedProgress();
    const fallbackUserId = getCachedUserId();

    for (const item of unsynced) {
      const parts = item.book_id.split(":");
      const realBookId = parts.length > 1 ? parts[1] : parts[0];
      const itemUserId = item.user_id || (parts.length > 1 ? parts[0] : fallbackUserId);

      const res = await sendProgressToServer(
        {
          book_id: realBookId,
          user_id: itemUserId,
          char_offset: item.char_offset,
          percentage: item.percentage,
          chapter_index: item.chapter_index,
          page_index: item.page_index,
          page_ratio: item.page_ratio,
          total_pages: item.total_pages,
          device_name: item.device_name,
          updated_at: item.updated_at,
        },
        false
      );

      if (res.success) {
        await LocalStore.markProgressSynced(item.book_id);
      }
    }
  } catch (e) {
    console.warn("Failed to flush unsynced progress:", e);
  }
}

/**
 * 同步離線時待上傳的小說至伺服器
 */
export async function syncPendingUploads(): Promise<string[]> {
  if (typeof window === "undefined" || !navigator.onLine) return [];

  const syncedBookIds: string[] = [];
  try {
    const pendingList = await LocalStore.getPendingUploads();
    if (pendingList.length === 0) return [];

    console.log(`[SyncEngine] 偵測到 ${pendingList.length} 本離線上傳的小說，開始同步至雲端...`);

    for (const item of pendingList) {
      try {
        const blob = new Blob([item.content], { type: "text/plain;charset=utf-8" });
        const file = new File([blob], item.originalFileName || `${item.title}.txt`, {
          type: "text/plain",
        });

        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", item.title);
        formData.append("id", item.id);
        if (item.convertToTraditional) {
          formData.append("convertToTraditional", "true");
        }

        const res = await fetch("/api/books", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            await LocalStore.removePendingUpload(item.id);
            syncedBookIds.push(item.id);
            console.log(`[SyncEngine] 《${item.title}》已成功同步至伺服器！`);
          }
        }
      } catch (err) {
        console.warn(`[SyncEngine] 書籍《${item.title}》同步失敗，保留於佇列等待下次重試:`, err);
      }
    }
  } catch (e) {
    console.warn("[SyncEngine] 讀取待同步書籍失敗:", e);
  }

  return syncedBookIds;
}

/**
 * 完整同步引擎：並行同步未同步進度與離線上傳小說至伺服器
 */
export async function flushAllSyncTasks(): Promise<{ syncedBookIds: string[] }> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { syncedBookIds: [] };
  }

  const [syncedBookIds] = await Promise.all([
    syncPendingUploads().catch((e) => {
      console.warn("syncPendingUploads error:", e);
      return [] as string[];
    }),
    flushUnsyncedProgress().catch((e) => console.warn("flushUnsyncedProgress error:", e)),
  ]);

  return { syncedBookIds };
}

// Auto-register online listener to flush sync queue
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushAllSyncTasks().catch(console.warn);
  });
  // Auto-flush pending syncs on startup if already online
  if (navigator.onLine) {
    setTimeout(() => {
      flushAllSyncTasks().catch(console.warn);
    }, 2000);
  }
}

