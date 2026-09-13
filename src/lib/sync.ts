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

// Auto-register online listener to flush sync queue
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushUnsyncedProgress().catch(console.warn);
  });
  // Auto-flush pending syncs on startup if already online
  if (navigator.onLine) {
    setTimeout(() => {
      flushUnsyncedProgress().catch(console.warn);
    }, 2000);
  }
}

