/**
 * @file PaginatedViewport.tsx
 * @description 閱讀器水平多欄分頁閱讀視圖組件，整合點擊翻頁、CSS Columns 排版、TTS 語音高亮與邊界提示
 */

import React from "react";
import { RefreshCw, Volume2, ChevronRight } from "lucide-react";
import { ClickDirection, TextAlignMode } from "@/types/reader";

interface PaginatedViewportProps {
  readerMainRef: React.RefObject<HTMLElement | null>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  paddingClass: string;
  maxWidthClass: string;
  currentFontClass: string;
  viewportWidth: number;
  currentPage: number;
  totalPages: number;
  currentChapterIdx: number;
  totalChapters: number;
  totalChars: number;
  columnGap: number;
  fontSize: number;
  lineHeight: number;
  textAlign: TextAlignMode;
  clickDirection: ClickDirection;
  processedChapterTitle: string;
  processedParagraphs: string[];
  isLoading: boolean;
  ttsIsPlaying: boolean;
  ttsCurrentParagraphIdx: number;
  lastTouchActionTime: React.RefObject<number>;
  onPrevPage: () => void;
  onNextPage: () => void;
  onToggleToolbar: () => void;
  onActivity?: () => void;
}

export const PaginatedViewport: React.FC<PaginatedViewportProps> = ({
  readerMainRef,
  viewportRef,
  contentRef,
  paddingClass,
  maxWidthClass,
  currentFontClass,
  viewportWidth,
  currentPage,
  totalPages,
  currentChapterIdx,
  totalChapters,
  totalChars,
  columnGap,
  fontSize,
  lineHeight,
  textAlign,
  clickDirection,
  processedChapterTitle,
  processedParagraphs,
  isLoading,
  ttsIsPlaying,
  ttsCurrentParagraphIdx,
  lastTouchActionTime,
  onPrevPage,
  onNextPage,
  onToggleToolbar,
  onActivity,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    if (Date.now() - (lastTouchActionTime.current || 0) < 450) return;
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) return;

    const x = e.clientX;
    const w = window.innerWidth;
    const ratio = x / w;

    if (ratio < 0.28) {
      clickDirection === "inverted" ? onNextPage() : onPrevPage();
      onActivity?.();
    } else if (ratio > 0.72) {
      clickDirection === "inverted" ? onPrevPage() : onNextPage();
      onActivity?.();
    } else {
      onToggleToolbar();
      onActivity?.();
    }
  };

  return (
    <main
      ref={readerMainRef}
      onClick={handleClick}
      className={`flex-1 overflow-hidden relative flex flex-col justify-center ${paddingClass} py-14 select-text cursor-default`}
    >
      <div className={`mx-auto w-full h-full ${maxWidthClass} relative overflow-hidden`}>
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4 text-[var(--text-muted)]">
            <RefreshCw className="w-8 h-8 animate-spin" />
            <p className="text-sm">正在載入小說文本並初始化分頁排版...</p>
          </div>
        ) : (
          <div ref={viewportRef} className="w-full h-full relative overflow-hidden">
            <div
              ref={contentRef}
              className="h-full transition-transform duration-200 ease-out"
              style={{
                width: viewportWidth > 0 ? `${viewportWidth}px` : "100%",
                columnWidth: viewportWidth > 0 ? `${viewportWidth}px` : "auto",
                columnGap: `${columnGap}px`,
                columnFill: "auto",
                transform:
                  viewportWidth > 0
                    ? `translateX(-${currentPage * (viewportWidth + columnGap)}px)`
                    : "none",
                fontSize: `${fontSize}px`,
                lineHeight: lineHeight,
                letterSpacing: "0.03em",
              }}
            >
              <article className={`select-text ${currentFontClass}`}>
                {/* Chapter Header */}
                <h2 className="text-xl sm:text-2xl font-bold mb-6 pb-3 border-b border-[var(--border-color)] text-[var(--text-color)]">
                  {processedChapterTitle}
                </h2>

                {/* Paragraphs */}
                {processedParagraphs.map((para, i) => {
                  const isSpeakingThis = ttsIsPlaying && ttsCurrentParagraphIdx === i;
                  return (
                    <p
                      key={i}
                      className={`novel-content-paragraph leading-relaxed mb-4 ${
                        textAlign === "justify" ? "text-justify" : "text-left"
                      } transition-all duration-200 rounded-lg ${
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

                {/* End of chapter boundary hint */}
                {currentPage === totalPages - 1 && currentChapterIdx < totalChapters - 1 && (
                  <div className="pt-6 pb-2 text-center text-xs text-[var(--text-muted)] opacity-70 flex items-center justify-center space-x-1 select-none">
                    <span>本章完 • 點擊右側或往左滑進入下一章</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                )}

                {/* End of book marker if on last chapter */}
                {currentChapterIdx === totalChapters - 1 && (
                  <div className="py-12 text-center text-xs text-[var(--text-muted)] space-y-2 border-t border-[var(--border-color)] mt-8">
                    <p>—— 全文完 ——</p>
                    <p>總字數：{totalChars.toLocaleString()} 字</p>
                  </div>
                )}
              </article>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};
