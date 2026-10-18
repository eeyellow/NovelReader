import React from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Pencil, Trash2 } from "lucide-react";
import { Book } from "@/lib/db";
import { ShelfLayoutMode } from "@/types/bookshelf";
import { formatChars, formatSize, formatDate } from "@/lib/format";

interface BookCardProps {
  book: Book;
  layoutMode: ShelfLayoutMode;
  isCached?: boolean;
  isOffline?: boolean;
  onDelete: (e: React.MouseEvent, book: Book) => void;
  onOpenRename: (e: React.MouseEvent, book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  layoutMode,
  isCached = false,
  isOffline = false,
  onDelete,
  onOpenRename,
}) => {
  const percentage = book.percentage || 0;
  const unavailableOffline = isOffline && !isCached;

  const handleLinkClick = (e: React.MouseEvent) => {
    if (unavailableOffline) {
      e.preventDefault();
      alert("目前離線，且此書尚未下載到本機。請連線後開啟一次。");
      return;
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("novel_reader_last_book_id", book.id);
    }
  };

  if (layoutMode === "compact") {
    return (
      <Link
        href={`/reader/${book.id}`}
        prefetch={false}
        onClick={handleLinkClick}
        className={`group flex items-center justify-between p-3 sm:px-4.5 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:shadow-sm transition-all duration-150 gap-3 ${
          unavailableOffline ? "opacity-55 grayscale" : ""
        }`}
      >
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <h3 className="font-semibold text-sm sm:text-base truncate group-hover:text-[var(--accent-color)] transition-colors">
            {book.title}
          </h3>
          <span className="hidden sm:inline text-xs text-[var(--text-muted)] shrink-0">
            ({formatChars(book.total_chars)})
          </span>
          {isCached ? (
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0">
              已快取
            </span>
          ) : isOffline ? (
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
              未下載
            </span>
          ) : null}
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {percentage >= 99.9 ? (
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              已讀完
            </span>
          ) : (
            <span className="text-xs font-medium text-[var(--accent-color)] tabular-nums">
              {percentage > 0 ? `進度 ${percentage.toFixed(1)}%` : "未讀"}
            </span>
          )}

          {!isOffline && (
            <>
              <button
                onClick={(e) => onOpenRename(e, book)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors"
                title="修改書名"
                aria-label="修改書名"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => onDelete(e, book)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-red-500 transition-colors"
                title="刪除小說"
                aria-label="刪除小說"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </Link>
    );
  }

  const lastDevice = book.last_device;
  const lastUpdated = book.progress_updated_at || book.created_at;

  return (
    <Link
      href={`/reader/${book.id}`}
      prefetch={false}
      onClick={handleLinkClick}
      className={`group relative flex flex-col justify-between p-5 rounded-2xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:shadow-md transition-all duration-200 ${
        unavailableOffline ? "opacity-55 grayscale" : ""
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-base line-clamp-2 group-hover:text-[var(--accent-color)] transition-colors">
            {book.title}
          </h3>
          {isCached ? (
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
              已快取
            </span>
          ) : isOffline ? (
            <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full shrink-0">
              未下載
            </span>
          ) : null}
        </div>

        <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-2 mb-4">
          <span>{formatChars(book.total_chars)}</span>
          <span>•</span>
          <span>{formatSize(book.file_size)}</span>
        </div>
      </div>

      <div className="space-y-2.5 pt-2 border-t border-[var(--border-color)]/60">
        <div className="flex items-center justify-between text-xs">
          {percentage >= 99.9 ? (
            <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> 已完讀
            </span>
          ) : (
            <span className="font-medium text-[var(--accent-color)]">
              閱讀進度 {percentage.toFixed(1)}%
            </span>
          )}
          <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(lastUpdated)}
          </span>
        </div>

        <div className="w-full bg-[var(--border-color)] h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-[var(--accent-color)] h-full transition-all duration-300 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1">
          <span className="truncate max-w-[160px]">
            {lastDevice ? `上次：${lastDevice}` : "尚未開始"}
          </span>
          {!isOffline && (
            <div className="flex items-center space-x-1 shrink-0">
              <button
                onClick={(e) => onOpenRename(e, book)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors opacity-70 hover:opacity-100"
                title="修改書名"
                aria-label="修改書名"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => onDelete(e, book)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-red-500 transition-colors opacity-70 hover:opacity-100"
                title="刪除小說"
                aria-label="刪除小說"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};
