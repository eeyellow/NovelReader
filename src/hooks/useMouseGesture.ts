"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { GestureAction, GestureConfig, Point } from "@/lib/gesture/types";
import { GestureRecognizer } from "@/lib/gesture/recognizer";
import { GESTURE_INFOS } from "@/lib/gesture/defaultGestures";

interface UseMouseGestureProps {
  config: GestureConfig;
  onAction: (action: GestureAction) => void;
}

export function useMouseGesture({ config, onAction }: UseMouseGestureProps) {
  const isTracking = useRef(false);
  const startPoint = useRef<Point | null>(null);
  const points = useRef<Point[]>([]);
  const hasMovedEnough = useRef(false);
  const recognizer = useRef(new GestureRecognizer(config.minDistance));

  const [trail, setTrail] = useState<Point[]>([]);
  const [currentGesture, setCurrentGesture] = useState<string>("");
  const [actionName, setActionName] = useState<string>("");
  const [currentPos, setCurrentPos] = useState<Point>({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);

  // 更新辨識器的採樣閾值
  useEffect(() => {
    recognizer.current.setMinDistance(config.minDistance || 22);
  }, [config.minDistance]);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!config.enabled || e.button !== config.triggerButton) return;

      isTracking.current = true;
      hasMovedEnough.current = false;
      startPoint.current = { x: e.clientX, y: e.clientY };
      points.current = [{ x: e.clientX, y: e.clientY }];

      setTrail([{ x: e.clientX, y: e.clientY }]);
      setCurrentPos({ x: e.clientX, y: e.clientY });
      setCurrentGesture("");
      setActionName("");
      setIsActive(true);
    },
    [config.enabled, config.triggerButton]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isTracking.current || !startPoint.current) return;

      const newPoint = { x: e.clientX, y: e.clientY };
      setCurrentPos(newPoint);

      // 檢查位移是否大於閾值以判定為手勢
      if (!hasMovedEnough.current) {
        const totalDist = Math.hypot(
          newPoint.x - startPoint.current.x,
          newPoint.y - startPoint.current.y
        );
        if (totalDist > 12) {
          hasMovedEnough.current = true;
        }
      }

      points.current.push(newPoint);
      setTrail([...points.current]);

      // 即時解析手勢
      const gesture = recognizer.current.recognize(points.current);
      setCurrentGesture(gesture);

      if (gesture && config.customMap[gesture]) {
        const act = config.customMap[gesture];
        setActionName(GESTURE_INFOS[act]?.name || act);
      } else if (gesture) {
        setActionName("未定義手勢");
      } else {
        setActionName("");
      }
    },
    [config.customMap]
  );

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!isTracking.current || e.button !== config.triggerButton) return;

      isTracking.current = false;
      setIsActive(false);

      if (hasMovedEnough.current) {
        const finalGesture = recognizer.current.recognize(points.current);
        if (finalGesture && config.customMap[finalGesture]) {
          const act = config.customMap[finalGesture];
          onAction(act);
        }
      }

      // 平滑淡出清除軌跡
      setTimeout(() => {
        setTrail([]);
        setCurrentGesture("");
        setActionName("");
      }, 120);
    },
    [config.triggerButton, config.customMap, onAction]
  );

  const handleContextMenu = useCallback((e: MouseEvent) => {
    // 只有在觸發實質滑鼠手勢時攔截原生選單
    if (hasMovedEnough.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  useEffect(() => {
    if (!config.enabled) return;

    window.addEventListener("mousedown", handleMouseDown, { passive: true });
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp, { passive: true });
    window.addEventListener("contextmenu", handleContextMenu, { capture: true });

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("contextmenu", handleContextMenu, { capture: true });
    };
  }, [config.enabled, handleMouseDown, handleMouseMove, handleMouseUp, handleContextMenu]);

  return {
    isActive,
    trail,
    currentGesture,
    actionName,
    currentPos,
  };
}
