/**
 * @file TOCDrawer.tsx
 * @description 閱讀器章節目錄抽屜組件
 */

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Chapter } from "@/lib/parser";

interface TOCDrawerProps {
  isOpen: boolean;
  chapters: Chapter[];
  currentChapterIdx: number;
  totalChars: number;
  activeChapterBtnRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onJumpToChapter: (chapter: Chapter) => void;
}

export const TOCDrawer: React.FC<TOCDrawerProps> = ({
  isOpen,
  chapters,
  currentChapterIdx,
  totalChars,
  activeChapterBtnRef,
  onClose,
  onJumpToChapter,
}) => {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        activeChapterBtnRef.current?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, currentChapterIdx, activeChapterBtnRef]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-start animate-fade-in">
      <div className="bg-[var(--card-bg)] border-r border-[var(--border-color)] w-full max-w-sm h-full flex flex-col shadow-2xl">
        <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">章節目錄</h3>
            <p className="text-xs text-[var(--text-muted)]">
              共 {chapters.length} 個章節
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)]"
            aria-label="關閉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chapters.map((chapter) => {
            const isCurrent = chapter.index === currentChapterIdx;
            return (
              <button
                key={chapter.index}
                ref={isCurrent ? activeChapterBtnRef : undefined}
                onClick={() => onJumpToChapter(chapter)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                  isCurrent
                    ? "bg-[var(--accent-color)] text-white font-bold shadow-sm"
                    : "text-[var(--text-color)] hover:bg-[var(--bg-color)]"
                }`}
              >
                <span className="truncate pr-2">{chapter.title}</span>
                <span className="text-[10px] opacity-70 shrink-0">
                  {((chapter.charOffset / (totalChars || 1)) * 100).toFixed(0)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1" onClick={onClose} />
    </div>
  );
};
