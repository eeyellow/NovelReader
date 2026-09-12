/**
 * @file ReaderFooter.tsx
 * @description 閱讀器底部控制列，整合進度滑桿 (Scrubber)、章節與頁面快速切換按鈕、字數與進度資訊
 */

import React from "react";
import { ChevronLeft, ChevronRight, ChevronFirst, ChevronLast } from "lucide-react";
import { ScrubberMode } from "@/types/reader";

interface ReaderFooterProps {
  showToolbar: boolean;
  scrubberMode: ScrubberMode;
  isScrubbing: boolean;
  scrubPage: number;
  scrubBookPercentage: number;
  currentPage: number;
  totalPages: number;
  currentPercentage: number;
  currentChapterIdx: number;
  totalChapters: number;
  processedChapterTitle: string;
  currentOffset: number;
  totalChars: number;
  scrubTargetInfo: { title: string; subtitle: string } | null;
  onToggleScrubberMode: () => void;
  onScrubbingInput: (val: number) => void;
  onScrubbingChange: (val: number) => void;
  onPrevChapter: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onNextChapter: () => void;
}

export const ReaderFooter: React.FC<ReaderFooterProps> = ({
  showToolbar,
  scrubberMode,
  isScrubbing,
  scrubPage,
  scrubBookPercentage,
  currentPage,
  totalPages,
  currentPercentage,
  currentChapterIdx,
  totalChapters,
  processedChapterTitle,
  currentOffset,
  totalChars,
  scrubTargetInfo,
  onToggleScrubberMode,
  onScrubbingInput,
  onScrubbingChange,
  onPrevChapter,
  onPrevPage,
  onNextPage,
  onNextChapter,
}) => {
  return (
    <footer
      className={`fixed bottom-0 inset-x-0 z-40 transition-transform duration-300 backdrop-blur-md bg-[var(--header-bg)] border-t border-[var(--border-color)] px-4 py-2.5 safe-area-bottom shadow-lg ${
        showToolbar ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="max-w-2xl mx-auto space-y-2">
        {/* Quick Progress Scrubber Slider */}
        <div className="relative flex items-center space-x-2 px-1">
          {/* Realtime Floating Tooltip when scrubbing */}
          {isScrubbing && scrubTargetInfo && (
            <div className="absolute -top-11 inset-x-0 mx-auto w-fit max-w-[90%] bg-[var(--accent-color)] text-white text-[11px] font-medium px-3 py-1.5 rounded-xl shadow-xl flex items-center space-x-1.5 animate-fade-in pointer-events-none z-50 truncate">
              <span className="font-bold truncate">{scrubTargetInfo.title}</span>
              <span className="opacity-80 shrink-0 font-mono">({scrubTargetInfo.subtitle})</span>
            </div>
          )}

          {/* Mode Switch Button */}
          <button
            onClick={onToggleScrubberMode}
            className="px-2 py-0.5 rounded-md text-[10px] font-semibold border border-[var(--border-color)] hover:border-[var(--accent-color)] text-[var(--accent-color)] bg-[var(--card-bg)] transition-colors shrink-0"
            title="點擊切換本章/全書滑桿模式"
          >
            {scrubberMode === "chapter" ? "本章" : "全書"}
          </button>

          <span className="text-[11px] text-[var(--text-muted)] font-mono shrink-0">
            {scrubberMode === "chapter" ? "1" : "0%"}
          </span>

          <input
            type="range"
            min={0}
            max={scrubberMode === "chapter" ? Math.max(0, totalPages - 1) : 100}
            step={scrubberMode === "chapter" ? 1 : 0.1}
            value={
              isScrubbing
                ? scrubberMode === "chapter"
                  ? scrubPage
                  : scrubBookPercentage
                : scrubberMode === "chapter"
                ? currentPage
                : currentPercentage
            }
            onInput={(e) => onScrubbingInput(Number((e.target as HTMLInputElement).value))}
            onChange={(e) => onScrubbingChange(Number(e.target.value))}
            className="w-full h-1.5 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
            aria-label={scrubberMode === "chapter" ? "本章頁數滑桿" : "全書進度滑桿"}
          />

          <span className="text-[11px] text-[var(--text-muted)] font-mono shrink-0">
            {scrubberMode === "chapter" ? totalPages : "100%"}
          </span>
        </div>

        {/* Page & Chapter Turn Buttons */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-1">
            <button
              onClick={onPrevChapter}
              disabled={currentChapterIdx <= 0}
              className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
              title="上一章"
            >
              <ChevronFirst className="w-4 h-4" />
              <span className="hidden sm:inline ml-1 text-[11px]">上一章</span>
            </button>
            <button
              onClick={onPrevPage}
              disabled={currentChapterIdx === 0 && currentPage === 0}
              className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
              title="上一頁"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline ml-1 text-[11px]">上一頁</span>
            </button>
          </div>

          {/* Current Chapter Page Indicator */}
          <div className="flex flex-col items-center justify-center">
            <span className="text-xs font-bold text-[var(--accent-color)]">
              第 {currentPage + 1} / {totalPages} 頁
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">
              全書 {currentPercentage}%
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={onNextPage}
              disabled={
                currentChapterIdx >= totalChapters - 1 && currentPage >= totalPages - 1
              }
              className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
              title="下一頁"
            >
              <span className="hidden sm:inline mr-1 text-[11px]">下一頁</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={onNextChapter}
              disabled={currentChapterIdx >= totalChapters - 1}
              className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
              title="下一章"
            >
              <span className="hidden sm:inline mr-1 text-[11px]">下一章</span>
              <ChevronLast className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Info */}
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5">
          <span className="truncate max-w-[200px]">{processedChapterTitle}</span>
          <span>
            {currentOffset.toLocaleString()} / {totalChars.toLocaleString()} 字
          </span>
        </div>
      </div>
    </footer>
  );
};
