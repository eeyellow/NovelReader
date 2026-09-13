import React from "react";
import Link from "next/link";
import { CheckCircle2, DownloadCloud, Clock, Pencil, Trash2, User } from "lucide-react";
import { Book } from "@/lib/db";
import { ShelfLayoutMode } from "@/types/bookshelf";
import { formatChars, formatSize, formatDate } from "@/lib/format";
import { UserSession } from "@/lib/auth";

interface BookCardProps {
  book: Book;
  layoutMode: ShelfLayoutMode;
  isCached: boolean;
  isCaching: boolean;
  currentUser?: UserSession | null;
  localProgressData?: {
    percentage?: number;
    char_offset?: number;
    updated_at?: string;
    device_name?: string;
  };
  onCache: (e: React.MouseEvent, book: Book) => void;
  onDelete: (e: React.MouseEvent, book: Book) => void;
  onOpenRename: (e: React.MouseEvent, book: Book) => void;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  layoutMode,
  isCached,
  isCaching,
  currentUser,
  localProgressData,
  onCache,
  onDelete,
  onOpenRename,
}) => {
  const percentage =
    localProgressData?.percentage !== undefined
      ? localProgressData.percentage
      : book.percentage || 0;

  const canDelete =
    !book.uploader_id ||
    book.uploader_id === "default_user" ||
    currentUser?.role === "admin" ||
    (currentUser && book.uploader_id === currentUser.id);

  const handleLinkClick = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("novel_reader_last_book_id", book.id);
    }
  };

  if (layoutMode === "compact") {
    return (
      <Link
        href={`/reader/${book.id}`}
        onClick={handleLinkClick}
        className="group flex items-center justify-between p-3 sm:px-4.5 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:shadow-sm transition-all duration-150 gap-3"
      >
        {/* Book Title & Uploader */}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <h3 className="font-semibold text-sm sm:text-base truncate group-hover:text-[var(--accent-color)] transition-colors">
            {book.title}
          </h3>
          {book.uploader_name && (
            <span className="hidden sm:inline-flex items-center text-[10px] text-[var(--text-muted)] bg-[var(--border-color)]/50 px-1.5 py-0.5 rounded shrink-0">
              <User className="w-2.5 h-2.5 mr-0.5 inline" /> {book.uploader_name}
            </span>
          )}
        </div>

        {/* Right: Progress & Cache Status Icon */}
        <div className="flex items-center space-x-3 shrink-0">
          {percentage >= 99.9 ? (
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              已讀完
            </span>
          ) : (
            <span className="text-xs font-medium text-[var(--accent-color)] tabular-nums">
              {percentage > 0 ? `進度 ${percentage.toFixed(1)}%` : "未讀"}
            </span>
          )}

          {isCached ? (
            <span
              className="inline-flex items-center text-emerald-600 dark:text-emerald-400"
              title="已快取至本機，離線可讀"
            >
              <CheckCircle2 className="w-4 h-4" />
            </span>
          ) : (
            <button
              onClick={(e) => onCache(e, book)}
              disabled={isCaching}
              className="p-0.5 text-amber-600 dark:text-amber-400 hover:scale-110 transition-transform disabled:opacity-60"
              title={isCaching ? "下載快取中..." : "點擊預先下載至本機快取"}
            >
              <DownloadCloud className={`w-4 h-4 ${isCaching ? "animate-bounce" : ""}`} />
            </button>
          )}
        </div>
      </Link>
    );
  }

  // Detailed Grid View
  const lastDevice = localProgressData?.device_name || book.last_device;
  const lastUpdated =
    localProgressData?.updated_at || book.progress_updated_at || book.created_at;

  return (
    <Link
      href={`/reader/${book.id}`}
      onClick={handleLinkClick}
      className="group relative flex flex-col justify-between p-5 rounded-2xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:shadow-md transition-all duration-200"
    >
      <div>
        {/* Card Top: Title & Cache Badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-base line-clamp-2 group-hover:text-[var(--accent-color)] transition-colors">
            {book.title}
          </h3>
          <div className="shrink-0">
            {isCached ? (
              <span
                className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                title="已快取至本機，斷網可讀"
              >
                <CheckCircle2 className="w-3 h-3 mr-1 inline" /> 本機離線
              </span>
            ) : (
              <button
                onClick={(e) => onCache(e, book)}
                disabled={isCaching}
                className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors font-medium disabled:opacity-60"
                title={isCaching ? "正在下載快取..." : "點擊預先下載至本機快取"}
              >
                <DownloadCloud className={`w-3 h-3 mr-1 inline ${isCaching ? "animate-spin" : ""}`} />
                {isCaching ? "快取中..." : "點擊快取"}
              </button>
            )}
          </div>
        </div>

        {/* File Metadata & Uploader */}
        <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-2 mb-4">
          <span>{formatChars(book.total_chars)}</span>
          <span>•</span>
          <span>{formatSize(book.file_size)}</span>
          {book.uploader_name && (
            <>
              <span>•</span>
              <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-[var(--border-color)]/50">
                <User className="w-2.5 h-2.5 mr-0.5 inline" /> {book.uploader_name}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Card Bottom: Progress Bar & Sync Device Info */}
      <div className="space-y-2.5 pt-2 border-t border-[var(--border-color)]/60">
        <div className="flex items-center justify-between text-xs">
          {percentage >= 99.9 ? (
            <span className="font-bold text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> 我的進度：已完讀
            </span>
          ) : (
            <span className="font-medium text-[var(--accent-color)]">
              我的進度 {percentage.toFixed(1)}%
            </span>
          )}
          <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(lastUpdated)}
          </span>
        </div>

        {/* Progress Track */}
        <div className="w-full bg-[var(--border-color)] h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-[var(--accent-color)] h-full transition-all duration-300 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
          />
        </div>

        {/* Device & Actions */}
        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1">
          <span className="truncate max-w-[140px]">
            {lastDevice ? `上次：${lastDevice}` : "尚未開始"}
          </span>
          <div className="flex items-center space-x-1 shrink-0">
            <button
              onClick={(e) => onOpenRename(e, book)}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors opacity-60 hover:opacity-100"
              title="修改書名"
              aria-label="修改書名"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {canDelete ? (
              <button
                onClick={(e) => onDelete(e, book)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-red-500 transition-colors opacity-60 hover:opacity-100"
                title="刪除小說"
                aria-label="刪除小說"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                disabled
                className="p-1 rounded text-[var(--text-muted)] opacity-20 cursor-not-allowed"
                title="僅上傳者或管理員可刪除此書籍"
                aria-label="僅上傳者或管理員可刪除此書籍"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};
