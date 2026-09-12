/**
 * @file ContinuousViewport.tsx
 * @description 閱讀器垂直連續滾動閱讀視圖組件，整合滾動監聽、字型樣式、TTS 高亮與跨章節導航
 */

import React from "react";
import { RefreshCw, Volume2, ChevronLeft, ChevronRight } from "lucide-react";

interface ContinuousViewportProps {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  maxWidthClass: string;
  currentFontClass: string;
  fontSize: number;
  lineHeight: number;
  processedChapterTitle: string;
  processedParagraphs: string[];
  isLoading: boolean;
  ttsIsPlaying: boolean;
  ttsCurrentParagraphIdx: number;
  currentChapterIdx: number;
  totalChapters: number;
  onScroll: () => void;
  onToggleToolbar: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
}

export const ContinuousViewport: React.FC<ContinuousViewportProps> = ({
  scrollContainerRef,
  maxWidthClass,
  currentFontClass,
  fontSize,
  lineHeight,
  processedChapterTitle,
  processedParagraphs,
  isLoading,
  ttsIsPlaying,
  ttsCurrentParagraphIdx,
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
        const y = e.clientY;
        const h = window.innerHeight;
        if (y > h * 0.25 && y < h * 0.75) {
          onToggleToolbar();
        }
      }}
      className="flex-1 overflow-y-auto px-4 sm:px-8 pt-16 pb-24 select-text"
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

            {processedParagraphs.map((para, i) => {
              const isSpeakingThis = ttsIsPlaying && ttsCurrentParagraphIdx === i;
              return (
                <p
                  key={i}
                  className={`novel-content-paragraph leading-relaxed mb-4 text-justify transition-all duration-200 rounded-lg ${
                    isSpeakingThis
                      ? "bg-[var(--accent-color)]/20 px-2 py-1 shadow-sm font-medium"
                      : ""
                  }`}
                  style={{ textIndent: isSpeakingThis ? "0" : "2em" }}
                >
                  {isSpeakingThis && (
                    <Volume2 className="w-4 h-4 inline-block mr-1.5 text-[var(--accent-color)] animate-pulse align-middle" />
                  )}
                  {para}
                </p>
              );
            })}

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
