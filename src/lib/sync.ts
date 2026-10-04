import { LocalStore, getProgressKey, type LocalProgressRecord } from "./idb";
import { getDeviceName } from "./device";
import { getCachedUserId } from "./clientAuth";

/**
 * 閱讀進度同步引擎
 *
 * 設計原則：
 * 1. updated_at 代表「使用者真正移動到這個位置的時間」，只在翻頁/跳轉時產生；
 *    生命週期事件（退背景、關閉、返回書架、恢復連線）只負責把「尚未被伺服器確認」的進度送出，
 *    絕不重新蓋時間戳，避免閒置裝置用舊位置覆蓋其他裝置較新的進度。
 * 2. 退到背景/關閉時只用 sendBeacon（同步排入瀏覽器佇列，頁面凍結後仍會送出）；
 *    beacon 無法得知結果，因此不視為成功，回到前景時再以 fetch 補送確認（伺服器 LWW 保證冪等）。
 * 3. 只有伺服器明確回應 success 才標記 synced，且需比對 updated_at，避免把較新的未上傳進度誤標。
 */

export interface ProgressExtra {
  chapter_index?: number;
  page_index?: number;
  page_ratio?: number;
  total_pages?: number;
}

export interface SyncPayload extends ProgressExtra {
  book_id: string;
  user_id?: string;
  char_offset: number;
  percentage: number;
  device_name: string;
  updated_at: string;
}

export interface ServerProgress {
  book_id: string;
  user_id?: string;
  char_offset: number;
  percentage: number;
  device_name?: string;
  updated_at: string;
  chapter_index?: number | null;
  page_index?: number | null;
  page_ratio?: number | null;
  total_pages?: number | null;
}

export interface SendResult {
  /** 伺服器明確回應成功 */
  success: boolean;
  /** 已交給 sendBeacon / keepalive，但無法確認結果 */
  queued?: boolean;
  /** false 代表伺服器已有更新的進度（LWW 拒絕寫入） */
  updated?: boolean;
  currentProgress?: ServerProgress;
  bookNotFound?: boolean;
  /** 被反向代理（如 Cloudflare Access）重導或拒絕，通常是登入憑證過期 */
  authExpired?: boolean;
}

export type SendMode = "foreground" | "background";

export const PROGRESS_CONFLICT_EVENT = "novel_reader_progress_conflict";
export const SYNC_AUTH_EXPIRED_EVENT = "novel_reader_sync_auth_expired";

const PROGRESS_ENDPOINT = "/api/progress";
const DEBOUNCE_MS = 3000;
const FOREGROUND_TIMEOUT_MS = 10000;

/** 尚未被伺服器確認的最新進度（key: `${userId}:${bookId}`） */
const pendingPayloads = new Map<string, SyncPayload>();
/** 已用 sendBeacon 送出的 updated_at，避免 visibilitychange + pagehide 連續觸發時重複送 */
const beaconedAt = new Map<string, string>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let flushPendingPromise: Promise<void> | null = null;
let flushUnsyncedPromise: Promise<void> | null = null;

function clearDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function emit(name: string, detail?: unknown) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * 背景/關閉專用：同步呼叫 sendBeacon（必須在事件處理器內同步執行，不能有任何 await）
 */
function sendInBackground(json: string): boolean {
  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      // text/plain 屬於 CORS safelisted MIME，WebKit 不會因需要 preflight 而靜默丟棄
      const blob = new Blob([json], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon(PROGRESS_ENDPOINT, blob)) return true;
    } catch (e) {}
  }
  if (typeof fetch !== "undefined") {
    try {
      fetch(PROGRESS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: json,
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => {});
      return true;
    } catch (e) {}
  }
  return false;
}

export async function sendProgressToServer(
  payload: SyncPayload,
  mode: SendMode = "foreground"
): Promise<SendResult> {
  const json = JSON.stringify(payload);

  if (mode === "background") {
    return { success: false, queued: sendInBackground(json) };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FOREGROUND_TIMEOUT_MS) : null;
  try {
    const res = await fetch(PROGRESS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      keepalive: true,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
      signal: controller?.signal,
    });

    if (
      res.type === "opaqueredirect" ||
      (res.status >= 300 && res.status < 400) ||
      res.status === 401 ||
      res.status === 403
    ) {
      return { success: false, authExpired: true };
    }

    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      return {
        success: true,
        updated: data.updated !== false,
        currentProgress: data.currentProgress,
      };
    }
    if (res.status === 404 && data?.bookNotFound) {
      return { success: false, bookNotFound: true };
    }
    return { success: false };
  } catch (e) {
    // 網路錯誤 / 逾時：保持 unsynced，等待下次 visible / online / 啟動時補送
    return { success: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function applySendResult(progressKey: string, payload: SyncPayload, result: SendResult) {
  if (result.success) {
    const pending = pendingPayloads.get(progressKey);
    if (pending && pending.updated_at === payload.updated_at) {
      pendingPayloads.delete(progressKey);
      beaconedAt.delete(progressKey);
    }
    await LocalStore.markProgressSynced(progressKey, payload.updated_at).catch(() => {});
    if (result.updated === false && result.currentProgress) {
      emit(PROGRESS_CONFLICT_EVENT, result.currentProgress);
    }
  } else if (result.authExpired) {
    emit(SYNC_AUTH_EXPIRED_EVENT);
  }
}

/**
 * 記錄一次「使用者真正移動位置」的進度：立即寫入本機，並排程上傳
 * 注意：只應在翻頁、切章、跳轉等使用者操作後呼叫，不要在生命週期事件中呼叫
 */
export function syncProgress(
  bookId: string,
  charOffset: number,
  percentage: number,
  forceImmediate: boolean = false,
  extra?: ProgressExtra
) {
  if (typeof window === "undefined" || !bookId) return;

  const deviceName = getDeviceName();
  const userId = getCachedUserId();
  const payload: SyncPayload = {
    book_id: bookId,
    user_id: userId,
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
  } catch (e) {}

  LocalStore.saveLocalProgress(
    bookId,
    payload.char_offset,
    payload.percentage,
    deviceName,
    false,
    payload.updated_at,
    extra,
    userId
  ).catch((e) => console.warn("[SyncEngine] 本機進度寫入失敗:", e));

  const key = getProgressKey(bookId, userId);
  pendingPayloads.set(key, payload);
  beaconedAt.delete(key);

  clearDebounce();
  if (forceImmediate) {
    void flushPendingProgress();
    return;
  }
  // 停止翻頁 3 秒後上傳；單次計時器，閒置時零背景計時器
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushPendingProgress();
  }, DEBOUNCE_MS);
}

export function hasPendingProgress(bookId: string): boolean {
  return pendingPayloads.has(getProgressKey(bookId));
}

async function drainPending() {
  const attempted = new Set<SyncPayload>();
  while (isOnline()) {
    const batch = Array.from(pendingPayloads.entries()).filter(([, p]) => !attempted.has(p));
    if (batch.length === 0) return;
    for (const [key, payload] of batch) {
      attempted.add(payload);
      const result = await sendProgressToServer(payload, "foreground");
      await applySendResult(key, payload, result);
    }
  }
}

/**
 * 前景上傳所有尚未確認的進度（翻頁防抖到期、切章、返回書架、回到前景）
 * 沒有待上傳進度時不會發出任何請求
 */
export function flushPendingProgress(): Promise<void> {
  clearDebounce();
  if (!flushPendingPromise) {
    if (pendingPayloads.size === 0) return Promise.resolve();
    flushPendingPromise = drainPending()
      .catch((e) => console.warn("[SyncEngine] flushPendingProgress error:", e))
      .finally(() => {
        flushPendingPromise = null;
      });
  }
  return flushPendingPromise;
}

/**
 * 退到背景 / 關閉 / 凍結時呼叫：以 sendBeacon 同步送出尚未確認的進度
 * 必須在事件處理器中同步執行
 */
export function beaconPendingProgress(): void {
  clearDebounce();
  pendingPayloads.forEach((payload, key) => {
    if (beaconedAt.get(key) === payload.updated_at) return;
    if (sendInBackground(JSON.stringify(payload))) {
      beaconedAt.set(key, payload.updated_at);
    }
  });
}

function recordToPayload(record: LocalProgressRecord, fallbackUserId: string): SyncPayload {
  const sep = record.book_id.indexOf(":");
  const realBookId = sep >= 0 ? record.book_id.slice(sep + 1) : record.book_id;
  const userId = record.user_id || (sep >= 0 ? record.book_id.slice(0, sep) : fallbackUserId);
  return {
    book_id: realBookId,
    user_id: userId,
    char_offset: Math.round(record.char_offset || 0),
    percentage: record.percentage || 0,
    chapter_index: record.chapter_index,
    page_index: record.page_index,
    page_ratio: record.page_ratio,
    total_pages: record.total_pages,
    device_name: record.device_name || getDeviceName(),
    updated_at: record.updated_at,
  };
}

/**
 * 以原始時間戳上傳一筆本機紀錄（例如伺服器尚無此書進度時補傳）
 */
export async function pushLocalProgressRecord(record: LocalProgressRecord): Promise<SendResult> {
  const payload = recordToPayload(record, getCachedUserId());
  const result = await sendProgressToServer(payload, "foreground");
  await applySendResult(record.book_id, payload, result);
  return result;
}

async function drainUnsynced() {
  if (typeof window === "undefined" || !isOnline()) return;
  const unsynced = await LocalStore.getAllUnsyncedProgress();
  if (unsynced.length === 0) return;

  const pendingUploadIds = new Set((await LocalStore.getPendingUploads()).map((b) => b.id));
  const fallbackUserId = getCachedUserId();

  for (const item of unsynced) {
    const payload = recordToPayload(item, fallbackUserId);
    const result = await sendProgressToServer(payload, "foreground");
    await applySendResult(item.book_id, payload, result);

    if (result.bookNotFound && !pendingUploadIds.has(payload.book_id)) {
      // 書籍已不存在於伺服器且不在待上傳佇列，停止無限重試
      await LocalStore.markProgressSynced(item.book_id, item.updated_at).catch(() => {});
    } else if (result.authExpired || (!result.success && !result.bookNotFound && !isOnline())) {
      break;
    }
  }
}

/**
 * 上傳 IndexedDB / localStorage 中所有 unsynced 的進度（使用原始時間戳，伺服器以 LWW 判斷）
 */
export function flushUnsyncedProgress(): Promise<void> {
  if (!flushUnsyncedPromise) {
    flushUnsyncedPromise = drainUnsynced()
      .catch((e) => console.warn("[SyncEngine] flushUnsyncedProgress error:", e))
      .finally(() => {
        flushUnsyncedPromise = null;
      });
  }
  return flushUnsyncedPromise;
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
 * 完整同步引擎：依序同步離線上傳小說至伺服器後，再同步閱讀進度，防止觸發外鍵約束錯誤
 */
export async function flushAllSyncTasks(): Promise<{ syncedBookIds: string[] }> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { syncedBookIds: [] };
  }

  // 必須先將待上傳的小說同步建立至伺服器，再同步進度，避免書籍尚未寫入觸發外鍵約束異常
  const syncedBookIds = await syncPendingUploads().catch((e) => {
    console.warn("syncPendingUploads error:", e);
    return [] as string[];
  });

  await flushPendingProgress();
  await flushUnsyncedProgress();

  return { syncedBookIds };
}

/** 回到前景：先確認背景時用 beacon 送出的進度，再補送其他 unsynced 紀錄 */
function resumeSync() {
  if (!isOnline()) return;
  flushPendingProgress()
    .then(() => flushUnsyncedProgress())
    .catch(console.warn);
}

// 全域生命週期監聽（模組只會載入一次，書架與閱讀器頁面皆生效）
if (typeof window !== "undefined") {
  const onHidden = () => beaconPendingProgress();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      onHidden();
    } else {
      resumeSync();
    }
  });
  window.addEventListener("pagehide", onHidden);
  // Chrome Page Lifecycle：頁面被凍結前
  document.addEventListener("freeze", onHidden);
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) resumeSync();
  });

  window.addEventListener("online", () => {
    flushAllSyncTasks().catch(console.warn);
  });
  // 啟動時補送上次未完成的同步
  if (navigator.onLine) {
    setTimeout(() => {
      flushAllSyncTasks().catch(console.warn);
    }, 2000);
  }
}
