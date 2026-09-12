/**
 * @file ReaderSettingsDrawer.tsx
 * @description 閱讀器排版偏好抽屜組件，支援繁簡切換、翻頁模式、主題、字級、行距、版寬、對齊與手勢自訂入口
 */

import React from "react";
import { X, MousePointerClick } from "lucide-react";
import {
  ThemeId,
  FontFamilyId,
  MaxWidthMode,
  ClickDirection,
  ChineseVariant,
  ReadingMode,
  TextAlignMode,
  PaddingMode,
} from "@/types/reader";
import { THEMES, FONT_FAMILIES } from "@/constants/themes";

interface ReaderSettingsDrawerProps {
  isOpen: boolean;
  theme: string;
  fontSize: number;
  lineHeight: number;
  fontFamily: FontFamilyId;
  maxWidthMode: MaxWidthMode;
  clickDirection: ClickDirection;
  chineseVariant: ChineseVariant;
  readMode: ReadingMode;
  textAlign: TextAlignMode;
  paddingMode: PaddingMode;
  onClose: () => void;
  onUpdateTheme: (themeId: string) => void;
  onUpdateFontSize: (delta: number) => void;
  onUpdateLineHeight: (lh: number) => void;
  onUpdateFontFamily: (ff: FontFamilyId) => void;
  onUpdateMaxWidth: (mode: MaxWidthMode) => void;
  onUpdateClickDirection: (dir: ClickDirection) => void;
  onUpdateReadMode: (mode: ReadingMode) => void;
  onUpdateTextAlign: (align: TextAlignMode) => void;
  onUpdatePaddingMode: (pad: PaddingMode) => void;
  onUpdateChineseVariant: (variant: ChineseVariant) => void;
  onOpenGestureModal: () => void;
}

export const ReaderSettingsDrawer: React.FC<ReaderSettingsDrawerProps> = ({
  isOpen,
  theme,
  fontSize,
  lineHeight,
  fontFamily,
  maxWidthMode,
  clickDirection,
  chineseVariant,
  readMode,
  textAlign,
  paddingMode,
  onClose,
  onUpdateTheme,
  onUpdateFontSize,
  onUpdateLineHeight,
  onUpdateFontFamily,
  onUpdateMaxWidth,
  onUpdateClickDirection,
  onUpdateReadMode,
  onUpdateTextAlign,
  onUpdatePaddingMode,
  onUpdateChineseVariant,
  onOpenGestureModal,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end animate-fade-in">
      <div className="flex-1" onClick={onClose} />
      <div className="bg-[var(--card-bg)] border-l border-[var(--border-color)] w-full max-w-sm h-full flex flex-col shadow-2xl p-6 space-y-5 overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
          <h3 className="font-bold text-base">排版與閱讀偏好</h3>
          <button
            onClick={onClose}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-color)]"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chinese Variant dynamic conversion */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-muted)]">簡繁中文轉換</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "original", name: "原文" },
              { id: "traditional", name: "正體(繁體)" },
              { id: "simplified", name: "簡體中文" },
            ].map((cv) => (
              <button
                key={cv.id}
                onClick={() => onUpdateChineseVariant(cv.id as ChineseVariant)}
                className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                  chineseVariant === cv.id
                    ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm font-semibold"
                    : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                }`}
              >
                {cv.name}
              </button>
            ))}
          </div>
        </div>

        {/* Reading Mode Selector (Paginated vs Continuous Scroll) */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-muted)]">閱讀翻頁模式</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateReadMode("paginated")}
              className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                readMode === "paginated"
                  ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm font-semibold"
                  : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
              }`}
            >
              左右分頁模式
            </button>
            <button
              onClick={() => onUpdateReadMode("continuous")}
              className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                readMode === "continuous"
                  ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm font-semibold"
                  : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
              }`}
            >
              垂直連續滾動
            </button>
          </div>
        </div>

        {/* Theme selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-muted)]">閱讀主題</label>
          <div className="grid grid-cols-5 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => onUpdateTheme(t.id)}
                style={{ backgroundColor: t.bg, color: t.text }}
                className={`h-11 rounded-xl border flex flex-col items-center justify-center text-[10px] font-medium transition-all ${
                  theme === t.id
                    ? "ring-2 ring-[var(--accent-color)] border-transparent shadow-md scale-105"
                    : "border-[var(--border-color)]"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {/* Font size */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <label className="font-semibold text-[var(--text-muted)]">字體大小</label>
            <span className="font-bold">{fontSize} px</span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => onUpdateFontSize(-1)}
              className="flex-1 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold hover:border-[var(--accent-color)]"
            >
              A- 縮小
            </button>
            <button
              onClick={() => onUpdateFontSize(1)}
              className="flex-1 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold hover:border-[var(--accent-color)]"
            >
              A+ 放大
            </button>
          </div>
        </div>

        {/* Line Height */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <label className="font-semibold text-[var(--text-muted)]">行距間距</label>
            <span className="font-bold">{lineHeight} 倍</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1.6, 1.85, 2.2].map((lh) => (
              <button
                key={lh}
                onClick={() => onUpdateLineHeight(lh)}
                className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                  lineHeight === lh
                    ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                    : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                }`}
              >
                {lh === 1.6 ? "緊湊" : lh === 1.85 ? "標準" : "寬鬆"}
              </button>
            ))}
          </div>
        </div>

        {/* Font Family */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-muted)]">字體樣式</label>
          <div className="grid grid-cols-3 gap-2">
            {FONT_FAMILIES.map((f) => (
              <button
                key={f.id}
                onClick={() => onUpdateFontFamily(f.id)}
                className={`py-2.5 rounded-xl border text-xs font-medium transition-all ${
                  fontFamily === f.id
                    ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                    : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Page Width */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-muted)]">版面寬度</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "narrow", name: "窄版" },
              { id: "normal", name: "標準" },
              { id: "wide", name: "寬版" },
            ].map((w) => (
              <button
                key={w.id}
                onClick={() => onUpdateMaxWidth(w.id as MaxWidthMode)}
                className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                  maxWidthMode === w.id
                    ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                    : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                }`}
              >
                {w.name}
              </button>
            ))}
          </div>
        </div>

        {/* Click Turn Direction */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-muted)]">點擊翻頁方向</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateClickDirection("standard")}
              className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                clickDirection === "standard"
                  ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                  : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
              }`}
            >
              左：上一頁 ｜ 右：下一頁
            </button>
            <button
              onClick={() => onUpdateClickDirection("inverted")}
              className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                clickDirection === "inverted"
                  ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                  : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
              }`}
            >
              左：下一頁 ｜ 右：上一頁
            </button>
          </div>
        </div>

        {/* Text Alignment */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-muted)]">文字對齊方式</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateTextAlign("justify")}
              className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                textAlign === "justify"
                  ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm font-semibold"
                  : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
              }`}
            >
              兩端對齊 (齊行)
            </button>
            <button
              onClick={() => onUpdateTextAlign("left")}
              className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                textAlign === "left"
                  ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm font-semibold"
                  : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
              }`}
            >
              靠左對齊
            </button>
          </div>
        </div>

        {/* Edge Padding */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-muted)]">內文側邊留白</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "compact", name: "緊湊" },
              { id: "normal", name: "標準" },
              { id: "spacious", name: "寬裕" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => onUpdatePaddingMode(p.id as PaddingMode)}
                className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                  paddingMode === p.id
                    ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm font-semibold"
                    : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Mouse Gesture Quick Settings */}
        <div className="pt-2 border-t border-[var(--border-color)] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold text-[var(--text-color)]">滑鼠手勢</label>
              <p className="text-[10px] text-[var(--text-muted)]">按住滑鼠右鍵拖曳快速控制</p>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenGestureModal();
              }}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-[11px] font-semibold text-[var(--accent-color)] hover:border-[var(--accent-color)] flex items-center gap-1"
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              自訂與試畫
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
