/**
 * @file ReaderSearchModal.tsx
 * @description 閱讀器書內全文檢索對話框組件，支援即時關鍵字高亮預覽與點擊跳轉錨點
 */

import React from "react";
import { Search, X } from "lucide-react";
import { SearchResultItem } from "@/types/reader";

interface ReaderSearchModalProps {
  isOpen: boolean;
  searchQuery: string;
  searchResults: SearchResultItem[];
  isSearching: boolean;
  totalChars: number;
  onSearchChange: (val: string) => void;
  onClose: () => void;
  onJumpToResult: (res: SearchResultItem) => void;
  onClearSearch: () => void;
}

export const ReaderSearchModal: React.FC<ReaderSearchModalProps> = ({
  isOpen,
  searchQuery,
  searchResults,
  isSearching,
  totalChars,
  onSearchChange,
  onClose,
  onJumpToResult,
  onClearSearch,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-center items-start pt-14 p-4 animate-fade-in">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
        {/* Header & Search Input */}
        <div className="p-4 border-b border-[var(--border-color)] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base flex items-center gap-1.5">
              <Search className="w-4 h-4 text-[var(--accent-color)]" />
              書內全文檢索
            </h3>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1 rounded-lg"
              aria-label="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="輸入關鍵字或角色名稱搜尋..."
              autoFocus
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
            />
            {searchQuery && (
              <button
                onClick={onClearSearch}
                className="absolute right-3 top-3 text-[var(--text-muted)] hover:text-[var(--text-color)]"
                aria-label="清除關鍵字"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {searchQuery && searchResults.length === 0 && !isSearching && (
            <div className="py-12 text-center text-xs text-[var(--text-muted)]">
              找不到包含「{searchQuery}」的內文結果
            </div>
          )}

          {searchResults.map((res, i) => (
            <div
              key={i}
              onClick={() => onJumpToResult(res)}
              className="p-3 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--bg-color)] hover:bg-opacity-80 cursor-pointer transition-all space-y-1 group"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[var(--accent-color)] truncate max-w-[240px]">
                  {res.chapterTitle}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  {((res.charOffset / (totalChars || 1)) * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                ...{res.snippetBefore}
                <mark className="bg-[var(--accent-color)]/25 text-[var(--text-color)] font-bold px-1 rounded">
                  {res.matchText}
                </mark>
                {res.snippetAfter}...
              </p>
            </div>
          ))}

          {!searchQuery && (
            <div className="py-10 text-center text-xs text-[var(--text-muted)] space-y-1">
              <p>輸入小說內文關鍵字以快速搜尋章節與段落</p>
              <p className="text-[11px] opacity-70">支援即時命中預覽與點擊跳轉定位</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
