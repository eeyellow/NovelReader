import { LocalStore } from "./idb";
import { getDeviceName } from "./device";

interface SyncPayload {
  book_id: string;
  char_offset: number;
  percentage: number;
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
  forceImmediate: boolean = false
) {
  if (typeof window === "undefined" || !bookId) return;

  const deviceName = getDeviceName();
  const timestamp = new Date().toISOString();

  // 1. Save to local IndexedDB and localStorage immediately
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("novel_reader_last_book_id", bookId);
  }

  LocalStore.saveLocalProgress(
    bookId,
    charOffset,
    percentage,
    deviceName,
    false,
    timestamp
  );

  const payload: SyncPayload = {
    book_id: bookId,
    char_offset: Math.round(charOffset),
    percentage: Number(percentage.toFixed(2)),
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

  // 3. Debounce background sync (2.5 seconds)
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
          timestamp
        );
      }
    }
  }, 2500);
}
