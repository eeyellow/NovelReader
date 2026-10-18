/**
 * @file ContinuousViewport.tsx
 * @description 閱讀器垂直連續滾動閱讀視圖組件
 */

import React from "react";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { TextAlignMode } from "@/types/reader";

interface ContinuousViewportProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  paddingClass: string;
  maxWidthClass: string;
  currentFontClass: string;
  fontSize: number;
  lineHeight: number;
  textAlign: TextAlignMode;
  processedChapterTitle: string;
  processedParagraphs: string[];
  isLoading: boolean;
  currentChapterIdx: number;
  totalChapters: number;
  onScroll: () => void;
  onToggleToolbar: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
}

export const ContinuousViewport: React.FC<ContinuousViewportProps> = ({
  scrollContainerRef,
  paddingClass,
  maxWidthClass,
  currentFontClass,
  fontSize,
  lineHeight,
  textAlign,
  processedChapterTitle,
  processedParagraphs,
  isLoading,
  currentChapterIdx,
  totalChapters,
  onScroll,
  onToggleToolbar,
  onPrevChapter,
  onNextChapter,
}) => {
  return (
    <main
      ref={scrollContainerRef}
      onScroll={onScroll}
      onClick={(e) => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim().length > 0) return;
        const y = e.clientY;
        const h = window.innerHeight;
        if (y > h * 0.25 && y < h * 0.75) {
          onToggleToolbar();
        }
      }}
      className={`flex-1 overflow-y-auto ${paddingClass} reader-continuous-padding select-text`}
    >
      <div className={`mx-auto w-full ${maxWidthClass}`}>
        {isLoading ? (
          <div className="py-32 flex flex-col items-center justify-center space-y-4 text-[var(--text-muted)]">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <p className="text-sm">正在載入小說內容...</p>
          </div>
        ) : (
          <article
            className={`select-text ${currentFontClass}`}
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: lineHeight,
              letterSpacing: "0.03em",
            }}
          >
            <h2 className="text-xl sm:text-2xl font-bold mb-6 pb-3 border-b border-[var(--border-color)] text-[var(--text-color)]">
              {processedChapterTitle}
            </h2>

            {processedParagraphs.map((para, i) => (
              <p
                key={i}
                className={`novel-content-paragraph leading-relaxed mb-4 ${
                  textAlign === "justify" ? "text-justify" : "text-left"
                }`}
                style={{ textIndent: "2em" }}
              >
                {para}
              </p>
            ))}

            {/* Chapter Navigation Buttons in Continuous Mode */}
            <div className="pt-8 pb-12 flex items-center justify-between border-t border-[var(--border-color)] mt-8 gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPrevChapter();
                  if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = 0;
                  }
                }}
                disabled={currentChapterIdx <= 0}
                className="flex-1 py-3 rounded-xl border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] text-xs font-semibold flex items-center justify-center space-x-1 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>上一章</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onNextChapter();
                  if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTop = 0;
                  }
                }}
                disabled={currentChapterIdx >= totalChapters - 1}
                className="flex-1 py-3 rounded-xl border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] text-xs font-semibold flex items-center justify-center space-x-1 transition-all"
              >
                <span>下一章</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </article>
        )}
      </div>
    </main>
  );
};
