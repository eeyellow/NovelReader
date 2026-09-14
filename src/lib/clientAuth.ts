"use client";

/**
 * @file clientAuth.ts
 * @description 客戶端使用者身分與持久化管理，支援 PWA 100% 離線啟動時保留已登入身分
 */

export interface UserSession {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  role: "admin" | "user";
}

const USER_SESSION_KEY = "novel_reader_user_session";
const AUTH_EVENT_NAME = "novel_reader_auth_change";

/**
 * 從 localStorage 取得已快取的使用者資訊（離線模式可直接秒讀）
 */
export function getCachedUserSession(): UserSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserSession;
  } catch (e) {
    return null;
  }
}

/**
 * 更新或清除快取的使用者資訊，並向全域廣播身分變更事件
 */
export function setCachedUserSession(user: UserSession | null): void {
  if (typeof window === "undefined") return;
  try {
    const prev = getCachedUserSession();
    const isSame =
      (!prev && !user) ||
      (prev &&
        user &&
        prev.id === user.id &&
        prev.email === user.email &&
        prev.name === user.name &&
        prev.role === user.role);

    if (user) {
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_SESSION_KEY);
    }

    if (!isSame) {
      window.dispatchEvent(new CustomEvent(AUTH_EVENT_NAME, { detail: user }));
    }
  } catch (e) {
    console.warn("Failed to set cached user session:", e);
  }
}

/**
 * 取得當前活躍使用者的 ID（未登入時預設為 "default_user"）
 */
export function getCachedUserId(): string {
  const session = getCachedUserSession();
  return session?.id || "default_user";
}

/**
 * 監聽身分變更事件
 */
export function onAuthChange(callback: (user: UserSession | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<UserSession | null>;
    callback(customEvent.detail);
  };
  window.addEventListener(AUTH_EVENT_NAME, handler);
  return () => window.removeEventListener(AUTH_EVENT_NAME, handler);
}
