"use client";

import React, { useMemo } from "react";
import { GestureConfig, Point } from "@/lib/gesture/types";
import { GestureRecognizer } from "@/lib/gesture/recognizer";

interface GestureOverlayProps {
  config: GestureConfig;
  isActive: boolean;
  trail: Point[];
  currentGesture: string;
  actionName: string;
  currentPos: Point;
}

export const GestureOverlay: React.FC<GestureOverlayProps> = ({
  config,
  isActive,
  trail,
  currentGesture,
  actionName,
  currentPos,
}) => {
  if (!config.enabled || (!isActive && trail.length === 0)) {
    return null;
  }

  // 將軌跡點轉換為 SVG 路徑指令
  const pathData = useMemo(() => {
    if (trail.length < 2) return "";
    return trail.reduce((acc, point, index) => {
      return index === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`;
    }, "");
  }, [trail]);

  // 取得箭頭指示文字
  const arrows = useMemo(() => {
    return currentGesture ? GestureRecognizer.toArrowSymbols(currentGesture) : "";
  }, [currentGesture]);

  // 計算浮動 HUD 位置（避開邊界）
  const hudStyle = useMemo(() => {
    const offsetX = 24;
    const offsetY = 24;
    let left = currentPos.x + offsetX;
    let top = currentPos.y + offsetY;

    if (typeof window !== "undefined") {
      if (left + 160 > window.innerWidth) {
        left = currentPos.x - 170;
      }
      if (top + 60 > window.innerHeight) {
        top = currentPos.y - 70;
      }
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [currentPos]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden select-none">
      {/* 1. 軌跡畫布 */}
      {config.showTrail && pathData && (
        <svg className="w-full h-full absolute inset-0">
          <filter id="gesture-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <path
            d={pathData}
            fill="none"
            stroke={config.strokeColor || "var(--accent-color, #3b82f6)"}
            strokeWidth={config.strokeWidth || 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#gesture-glow)"
            className="transition-opacity duration-150"
            style={{
              opacity: isActive ? 0.95 : 0,
            }}
          />
        </svg>
      )}

      {/* 2. 游標旁浮動 HUD 提示 */}
      {config.showHUD && (currentGesture || actionName) && (
        <div
          style={hudStyle}
          className="fixed flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-neutral-950/85 text-white backdrop-blur-md shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-100"
        >
          {arrows && (
            <span className="text-base tracking-widest font-mono font-bold text-amber-300 drop-shadow">
              {arrows}
            </span>
          )}
          <span
            className={`text-xs font-semibold ${
              actionName === "未定義手勢" ? "text-neutral-400" : "text-sky-300"
            }`}
          >
            {actionName}
          </span>
        </div>
      )}
    </div>
  );
};
