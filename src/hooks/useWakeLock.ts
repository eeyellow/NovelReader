"use client";

import { useEffect, useRef, useCallback } from "react";

interface UseWakeLockOptions {
  enabled?: boolean;
  idleTimeoutMs?: number; // Auto release wake lock after idle time (e.g. 5 minutes)
}

export function useWakeLock({
  enabled = true,
  idleTimeoutMs = 5 * 60 * 1000,
}: UseWakeLockOptions = {}) {
  const wakeLockRef = useRef<any>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const releaseLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (e) {
        // Ignore release errors
      }
      wakeLockRef.current = null;
    }
  }, []);

  const acquireLock = useCallback(async () => {
    if (!enabled || typeof window === "undefined" || !("wakeLock" in navigator)) {
      return;
    }

    // Only acquire if page is visible and lock not currently active
    if (document.visibilityState !== "visible" || wakeLockRef.current) {
      return;
    }

    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      wakeLockRef.current.addEventListener("release", () => {
        wakeLockRef.current = null;
      });
    } catch (err) {
      // Screen wake lock request can fail (e.g. battery saver mode)
      wakeLockRef.current = null;
    }
  }, [enabled]);

  // Touch/activity heartbeat resets idle timer and re-acquires lock
  const onUserActivity = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    acquireLock();

    // Auto release after idleTimeoutMs of inactivity
    idleTimerRef.current = setTimeout(() => {
      releaseLock();
    }, idleTimeoutMs);
  }, [acquireLock, releaseLock, idleTimeoutMs]);

  useEffect(() => {
    if (!enabled) {
      releaseLock();
      return;
    }

    onUserActivity();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        onUserActivity();
      } else {
        releaseLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      releaseLock();
    };
  }, [enabled, onUserActivity, releaseLock]);

  return {
    onUserActivity,
    releaseLock,
  };
}
