"use client";

import { useEffect, useRef, useCallback } from "react";

interface UseTouchGestureProps {
  elementRef: React.RefObject<HTMLElement | null>;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onPinchZoom?: (delta: number) => void;
  onTap?: (x: number, y: number) => void;
  enabled?: boolean;
}

export function useTouchGesture({
  elementRef,
  onSwipeLeft,
  onSwipeRight,
  onPinchZoom,
  onTap,
  enabled = true,
}: UseTouchGestureProps) {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistRef = useRef<number | null>(null);
  const isPinchingRef = useRef(false);
  const hasMovedRef = useRef(false);

  // Trigger light haptic feedback on mobile devices
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(8);
      } catch (e) {
        // Ignore
      }
    }
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;

      if (e.touches.length === 2) {
        // Pinch zoom detected
        isPinchingRef.current = true;
        hasMovedRef.current = true;
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchStartDistRef.current = dist;
        return;
      }

      if (e.touches.length === 1) {
        isPinchingRef.current = false;
        hasMovedRef.current = false;
        const touch = e.touches[0];
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        };
        touchEndRef.current = { x: touch.clientX, y: touch.clientY };
      }
    },
    [enabled]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;

      if (e.touches.length === 2 && isPinchingRef.current && pinchStartDistRef.current !== null) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const delta = currentDist - pinchStartDistRef.current;

        // Threshold for font size adjustment
        if (Math.abs(delta) > 35) {
          if (delta > 0 && onPinchZoom) {
            onPinchZoom(1);
            triggerHaptic();
          } else if (delta < 0 && onPinchZoom) {
            onPinchZoom(-1);
            triggerHaptic();
          }
          pinchStartDistRef.current = currentDist;
        }
        return;
      }

      if (e.touches.length === 1 && touchStartRef.current) {
        const touch = e.touches[0];
        touchEndRef.current = { x: touch.clientX, y: touch.clientY };
        const dx = Math.abs(touch.clientX - touchStartRef.current.x);
        const dy = Math.abs(touch.clientY - touchStartRef.current.y);

        if (dx > 10 || dy > 10) {
          hasMovedRef.current = true;
        }
      }
    },
    [enabled, onPinchZoom, triggerHaptic]
  );

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return;

      if (isPinchingRef.current) {
        isPinchingRef.current = false;
        pinchStartDistRef.current = null;
        return;
      }

      if (!touchStartRef.current || !touchEndRef.current) return;

      const deltaX = touchEndRef.current.x - touchStartRef.current.x;
      const deltaY = touchEndRef.current.y - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Fast horizontal swipe threshold (min 35px, horizontal dominance)
      if (absX > 35 && absX > absY * 1.3 && deltaTime < 600) {
        if (deltaX < 0 && onSwipeLeft) {
          // Swipe Left -> Next Page
          onSwipeLeft();
          triggerHaptic();
        } else if (deltaX > 0 && onSwipeRight) {
          // Swipe Right -> Prev Page
          onSwipeRight();
          triggerHaptic();
        }
      } else if (!hasMovedRef.current && deltaTime < 400 && onTap) {
        // Tap gesture
        onTap(touchStartRef.current.x, touchStartRef.current.y);
      }

      touchStartRef.current = null;
      touchEndRef.current = null;
    },
    [enabled, onSwipeLeft, onSwipeRight, onTap, triggerHaptic]
  );

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !enabled) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [elementRef, enabled, handleTouchStart, handleTouchMove, handleTouchEnd]);
}
