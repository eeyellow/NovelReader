/**
 * @file TOCDrawer.tsx
 * @description 閱讀器章節目錄與書籤抽屜組件，支援雙頁籤切換、進度百分比標籤、書籤刪除與跳轉
 */

import React, { useState, useEffect } from "react";
import { X, Bookmark, Trash2 } from "lucide-react";
import { Chapter } from "@/lib/parser";
import { Bookmark as BookmarkType } from "@/lib/db";
import { formatDate } from "@/lib/format";

interface TOCDrawerProps {
  isOpen: boolean;
  chapters: Chapter[];
  bookmarks: BookmarkType[];
  currentChapterIdx: number;
  totalChars: number;
  activeChapterBtnRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onJumpToChapter: (chapter: Chapter) => void;
  onJumpToBookmark: (bm: BookmarkType) => void;
  onDeleteBookmark: (e: React.MouseEvent, bmId: string) => void;
}

export const TOCDrawer: React.FC<TOCDrawerProps> = ({
  isOpen,
  chapters,
  bookmarks,
  currentChapterIdx,
  totalChars,
  activeChapterBtnRef,
  onClose,
  onJumpToChapter,
  onJumpToBookmark,
  onDeleteBookmark,
}) => {
  const [activeDrawerTab, setActiveDrawerTab] = useState<"chapters" | "bookmarks">("chapters");

  // 當抽屜開啟時自動平滑滾動至當前章節
  useEffect(() => {
    if (isOpen && activeDrawerTab === "chapters") {
      const timer = setTimeout(() => {
        activeChapterBtnRef.current?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeDrawerTab, currentChapterIdx, activeChapterBtnRef]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-start animate-fade-in">
      <div className="bg-[var(--card-bg)] border-r border-[var(--border-color)] w-full max-w-sm h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">目錄與書籤</h3>
            <p className="text-xs text-[var(--text-muted)]">
              {activeDrawerTab === "chapters"
                ? `共 ${chapters.length} 個章節錨點`
                : `共 ${bookmarks.length} 個已存書籤`}
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

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 p-2 gap-1 border-b border-[var(--border-color)] bg-[var(--bg-color)]/50">
          <button
            onClick={() => setActiveDrawerTab("chapters")}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeDrawerTab === "chapters"
                ? "bg-[var(--accent-color)] text-white shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-color)]"
            }`}
          >
            章節目錄 ({chapters.length})
          </button>
          <button
            onClick={() => setActiveDrawerTab("bookmarks")}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeDrawerTab === "bookmarks"
                ? "bg-[var(--accent-color)] text-white shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-color)]"
            }`}
          >
            書籤清單 ({bookmarks.length})
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {activeDrawerTab === "chapters" ? (
            /* Chapters List */
            chapters.map((chapter) => {
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
            })
          ) : /* Bookmarks List */
          bookmarks.length === 0 ? (
            <div className="py-16 text-center text-xs text-[var(--text-muted)] space-y-2">
              <Bookmark className="w-8 h-8 mx-auto opacity-40" />
              <p>目前尚無書籤</p>
              <p className="text-[11px] opacity-70">
                點擊上方工具列的「加入書籤」圖示即可收藏精彩段落
              </p>
            </div>
          ) : (
            bookmarks.map((bm) => (
              <div
                key={bm.id}
                onClick={() => onJumpToBookmark(bm)}
                className="p-3 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:bg-[var(--bg-color)] cursor-pointer transition-all space-y-1.5 group relative"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[var(--text-color)] group-hover:text-[var(--accent-color)] truncate max-w-[200px]">
                    {bm.title}
                  </span>
                  <div className="flex items-center space-x-1 shrink-0">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {((bm.char_offset / (totalChars || 1)) * 100).toFixed(0)}%
                    </span>
                    <button
                      onClick={(e) => onDeleteBookmark(e, bm.id)}
                      className="p-1 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                      title="刪除此書籤"
                      aria-label="刪除此書籤"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                  {bm.preview_text}
                </p>
                <p className="text-[10px] text-[var(--text-muted)]/70">
                  {formatDate(bm.created_at)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="flex-1" onClick={onClose} />
    </div>
  );
};
