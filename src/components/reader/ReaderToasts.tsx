/**
 * @file ReaderToasts.tsx
 * @description 閱讀器通知提示組件集合，包含書籤新增提示、章節切換提示與跨裝置進度衝突對話框
 */

import React from "react";
import { Check, BookMarked, Sparkles, X } from "lucide-react";
import { ConflictPromptData } from "@/types/reader";

interface ReaderToastsProps {
  bookmarkToast: string | null;
  chapterSwitchToast: string | null;
  conflictPrompt: ConflictPromptData | null;
  onDismissConflict: () => void;
  onAcceptConflict: (serverOffset: number) => void;
}

export const ReaderToasts: React.FC<ReaderToastsProps> = ({
  bookmarkToast,
  chapterSwitchToast,
  conflictPrompt,
  onDismissConflict,
  onAcceptConflict,
}) => {
  return (
    <>
      {/* Bookmark Added Toast */}
      {bookmarkToast && (
        <div className="fixed top-16 inset-x-0 mx-auto w-fit z-50 bg-[var(--accent-color)] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center space-x-1.5 animate-bounce-short">
          <Check className="w-4 h-4" />
          <span>{bookmarkToast}</span>
        </div>
      )}

      {/* Chapter Switch Toast */}
      {chapterSwitchToast && (
        <div className="fixed top-16 inset-x-0 mx-auto w-fit z-50 bg-[var(--accent-color)] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center space-x-1.5 animate-fade-in truncate max-w-[85vw]">
          <BookMarked className="w-4 h-4 shrink-0" />
          <span className="truncate">{chapterSwitchToast}</span>
        </div>
      )}

      {/* Cloud Conflict Prompt Toast */}
      {conflictPrompt && (
        <div className="fixed top-16 inset-x-4 sm:inset-x-auto sm:right-6 z-50 max-w-md bg-[var(--card-bg)] border-2 border-[var(--accent-color)] rounded-2xl p-4 shadow-2xl animate-bounce-short">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-sm text-[var(--accent-color)] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> 偵測到來自「{conflictPrompt.deviceName}」的較新進度
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                雲端進度已讀至 {conflictPrompt.serverPercentage}%，是否立即跳轉同步？
              </p>
            </div>
            <button
              onClick={onDismissConflict}
              className="text-[var(--text-muted)] hover:text-[var(--text-color)]"
              aria-label="關閉"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex justify-end space-x-2 mt-3 pt-2 border-t border-[var(--border-color)]">
            <button
              onClick={onDismissConflict}
              className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:bg-[var(--bg-color)]"
            >
              保留目前位置
            </button>
            <button
              onClick={() => onAcceptConflict(conflictPrompt.serverOffset)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90"
            >
              立刻跳轉同步
            </button>
          </div>
        </div>
      )}
    </>
  );
};
