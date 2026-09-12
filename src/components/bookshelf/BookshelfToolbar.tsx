/**
 * @file BookshelfToolbar.tsx
 * @description 書庫清單工具列，包含書籍總數統計、排序選單、升降冪切換與檢視模式切換
 */

import React from "react";
import { ArrowUpDown, ArrowUpWideNarrow, ArrowDownWideNarrow, List, LayoutGrid } from "lucide-react";
import { SortField, SortOrder, ShelfLayoutMode } from "@/types/bookshelf";

interface BookshelfToolbarProps {
  totalCount: number;
  sortBy: SortField;
  sortOrder: SortOrder;
  layoutMode: ShelfLayoutMode;
  onSortByChange: (field: SortField) => void;
  onToggleSortOrder: () => void;
  onLayoutModeChange: (mode: ShelfLayoutMode) => void;
}

export const BookshelfToolbar: React.FC<BookshelfToolbarProps> = ({
  totalCount,
  sortBy,
  sortOrder,
  layoutMode,
  onSortByChange,
  onToggleSortOrder,
  onLayoutModeChange,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
        書庫清單 ({totalCount})
      </h2>
      <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Sorting Controls */}
        <div className="flex items-center space-x-1 p-0.5 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)]">
          <span className="pl-2 text-[var(--text-muted)] flex items-center">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1 shrink-0" />
            <span className="hidden xs:inline sm:inline text-xs">排序：</span>
          </span>
          <select
            value={sortBy}
            onChange={(e) => onSortByChange(e.target.value as SortField)}
            className="bg-transparent text-xs text-[var(--text-color)] focus:outline-none cursor-pointer py-1 pr-1 font-medium"
          >
            <option value="updated" className="bg-[var(--card-bg)] text-[var(--text-color)]">
              更新時間
            </option>
            <option value="title" className="bg-[var(--card-bg)] text-[var(--text-color)]">
              書名
            </option>
            <option value="progress" className="bg-[var(--card-bg)] text-[var(--text-color)]">
              閱讀進度
            </option>
            <option value="chars" className="bg-[var(--card-bg)] text-[var(--text-color)]">
              總字數
            </option>
          </select>

          <button
            onClick={onToggleSortOrder}
            className="p-1 px-1.5 rounded-md hover:bg-[var(--border-color)]/50 text-[var(--text-color)] transition-colors flex items-center space-x-1 font-medium"
            title={
              sortOrder === "asc"
                ? "目前為升冪（由小至大/舊至新），點擊切換為降冪"
                : "目前為降冪（由大至小/新至舊），點擊切換為升冪"
            }
            aria-label="切換升降冪"
          >
            {sortOrder === "asc" ? (
              <>
                <ArrowUpWideNarrow className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span className="text-[11px] text-[var(--accent-color)]">升冪</span>
              </>
            ) : (
              <>
                <ArrowDownWideNarrow className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                <span className="text-[11px] text-[var(--accent-color)]">降冪</span>
              </>
            )}
          </button>
        </div>

        {/* Layout Switcher */}
        <div className="flex items-center p-0.5 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)]">
          <button
            onClick={() => onLayoutModeChange("compact")}
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs flex items-center space-x-1 transition-all ${
              layoutMode === "compact"
                ? "bg-[var(--accent-color)] text-white shadow-sm font-medium"
                : "text-[var(--text-muted)] hover:text-[var(--text-color)]"
            }`}
            title="精簡資訊 (列表)"
            aria-label="精簡資訊"
          >
            <List className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xs:inline sm:inline text-xs">精簡</span>
          </button>
          <button
            onClick={() => onLayoutModeChange("detailed")}
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs flex items-center space-x-1 transition-all ${
              layoutMode === "detailed"
                ? "bg-[var(--accent-color)] text-white shadow-sm font-medium"
                : "text-[var(--text-muted)] hover:text-[var(--text-color)]"
            }`}
            title="詳細資訊 (卡片)"
            aria-label="詳細資訊"
          >
            <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xs:inline sm:inline text-xs">詳細</span>
          </button>
        </div>
      </div>
    </div>
  );
};
