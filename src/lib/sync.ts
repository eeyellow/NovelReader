import { LocalStore } from "./idb";
import { getDeviceName } from "./device";

export interface ProgressExtra {
  chapter_index?: number;
  page_index?: number;
  page_ratio?: number;
  total_pages?: number;
}

export interface SyncPayload extends ProgressExtra {
  book_id: string;
  char_offset: number;
  percentage: number;
  device_name: string;
  updated_at: string;
}

const PROGRESS_ENDPOINT = "/api/progress";
const DEBOUNCE_MS = 1500;
const LS_PENDING_SYNC_KEY = "novel_reader_pending_sync";

const pendingPayloads = new Map<string, SyncPayload>();
const beforeBackgroundCallbacks = new Set<() => void>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let hydratedFromStorage = false;

function hydratePendingPayloads() {
  if (hydratedFromStorage || typeof localStorage === "undefined") return;
  hydratedFromStorage = true;
  try {
    const raw = localStorage.getItem(LS_PENDING_SYNC_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, SyncPayload>;
    if (parsed && typeof parsed === "object") {
      for (const [bookId, payload] of Object.entries(parsed)) {
        if (bookId && bookId !== "__shell__" && payload && !pendingPayloads.has(bookId)) {
          pendingPayloads.set(bookId, payload);
        }
      }
    }
  } catch {}
}

function persistPendingPayloads() {
  if (typeof localStorage === "undefined") return;
  try {
    if (pendingPayloads.size === 0) {
      localStorage.removeItem(LS_PENDING_SYNC_KEY);
    } else {
      localStorage.setItem(
        LS_PENDING_SYNC_KEY,
        JSON.stringify(Object.fromEntries(pendingPayloads.entries()))
      );
    }
  } catch {}
}

function clearDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

export function onBeforeBackgroundSync(cb: () => void): () => void {
  beforeBackgroundCallbacks.add(cb);
  return () => {
    beforeBackgroundCallbacks.delete(cb);
  };
}

function sendInBackground(json: string): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([json], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon(PROGRESS_ENDPOINT, blob)) return true;
    } catch {}
  }
  if (typeof fetch !== "undefined") {
    try {
      fetch(PROGRESS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: true,
      }).catch(() => {});
      return true;
    } catch {}
  }
  return false;
}

export function syncProgress(
  bookId: string,
  charOffset: number,
  percentage: number,
  forceImmediate: boolean = false,
  extra?: ProgressExtra
) {
  if (typeof window === "undefined" || !bookId || bookId === "__shell__") return;
  hydratePendingPayloads();

  const deviceName = getDeviceName();
  const payload: SyncPayload = {
    book_id: bookId,
    char_offset: Math.round(charOffset),
    percentage: Number((Number.isFinite(percentage) ? percentage : 0).toFixed(2)),
    chapter_index: extra?.chapter_index,
    page_index: extra?.page_index,
    page_ratio: extra?.page_ratio,
    total_pages: extra?.total_pages,
    device_name: deviceName,
    updated_at: new Date().toISOString(),
  };

  try {
    localStorage.setItem("novel_reader_last_book_id", bookId);
  } catch {}

  LocalStore.saveLocalProgress(
    bookId,
    payload.char_offset,
    payload.percentage,
    deviceName,
    payload.updated_at,
    extra
  ).catch(() => {});

  pendingPayloads.set(bookId, payload);
  persistPendingPayloads();

  clearDebounce();
  if (forceImmediate) {
    void flushPendingProgress();
    return;
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushPendingProgress();
  }, DEBOUNCE_MS);
}

export async function flushPendingProgress(): Promise<void> {
  clearDebounce();
  hydratePendingPayloads();
  if (pendingPayloads.size === 0) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const entries = Array.from(pendingPayloads.entries());
  for (const [bookId, payload] of entries) {
    try {
      const res = await fetch(PROGRESS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      if (res.ok) {
        const current = pendingPayloads.get(bookId);
        if (current && current.updated_at === payload.updated_at) {
          pendingPayloads.delete(bookId);
          persistPendingPayloads();
        }
      }
    } catch {}
  }
}

export function beaconPendingProgress(): void {
  beforeBackgroundCallbacks.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
  clearDebounce();
  hydratePendingPayloads();
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    persistPendingPayloads();
    return; // 離線時保留 pending，待恢復連線後補傳
  }
  pendingPayloads.forEach((payload, bookId) => {
    if (sendInBackground(JSON.stringify(payload))) {
      pendingPayloads.delete(bookId);
    }
  });
  persistPendingPayloads();
}

if (typeof window !== "undefined") {
  hydratePendingPayloads();
  const onHidden = () => {
    beaconPendingProgress();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      onHidden();
    }
  });
  window.addEventListener("pagehide", onHidden);
  window.addEventListener("online", () => {
    void flushPendingProgress();
  });
}
