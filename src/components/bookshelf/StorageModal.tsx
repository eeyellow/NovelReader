/**
 * @file StorageModal.tsx
 * @description 離線空間與本機 IndexedDB 快取管理對話框組件
 */

import React from "react";
import { HardDrive, X, DownloadCloud, Trash2 } from "lucide-react";
import { formatSize } from "@/lib/format";
import { CacheAllProgress } from "@/types/bookshelf";

interface StorageModalProps {
  isOpen: boolean;
  storageUsage: number;
  storageQuota: number;
  cachedCount: number;
  totalBooksCount: number;
  isCachingAll: boolean;
  cacheAllProgress: CacheAllProgress | null;
  onClose: () => void;
  onCacheAll: () => void;
  onClearAll: () => void;
}

export const StorageModal: React.FC<StorageModalProps> = ({
  isOpen,
  storageUsage,
  storageQuota,
  cachedCount,
  totalBooksCount,
  isCachingAll,
  cacheAllProgress,
  onClose,
  onCacheAll,
  onClearAll,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-[var(--accent-color)]/15 text-[var(--accent-color)]">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">離線空間與快取管理</h3>
              <p className="text-xs text-[var(--text-muted)]">管理瀏覽器 IndexedDB 離線數據</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1 rounded-lg"
            aria-label="關閉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Storage Usage Bar */}
        <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[var(--text-muted)]">本機已用空間</span>
            <span className="font-bold">
              {formatSize(storageUsage)} / {storageQuota > 0 ? formatSize(storageQuota) : "未知"}
            </span>
          </div>
          {storageQuota > 0 && (
            <div className="w-full bg-[var(--border-color)] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[var(--accent-color)] h-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(1, (storageUsage / storageQuota) * 100))}%`,
                }}
              />
            </div>
          )}
          <div className="flex justify-between items-center text-[11px] text-[var(--text-muted)] pt-1">
            <span>離線快取狀態</span>
            <span>
              {cachedCount} / {totalBooksCount} 本書籍已快取
            </span>
          </div>
        </div>

        {/* Cache All Progress Banner */}
        {isCachingAll && cacheAllProgress && (
          <div className="p-3.5 rounded-xl bg-[var(--accent-color)]/10 border border-[var(--accent-color)]/30 space-y-1.5 animate-pulse">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--accent-color)]">
              <span>正在下載全部小說離線快取...</span>
              <span>
                {cacheAllProgress.current} / {cacheAllProgress.total}
              </span>
            </div>
            <div className="w-full bg-[var(--border-color)] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-[var(--accent-color)] h-full transition-all duration-200"
                style={{
                  width: `${(cacheAllProgress.current / cacheAllProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            onClick={onCacheAll}
            disabled={isCachingAll || totalBooksCount === 0}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center space-x-2"
          >
            <DownloadCloud className="w-4 h-4" />
            <span>
              {isCachingAll
                ? "正在背景快取中..."
                : "一鍵下載快取全書庫（離線完全可用）"}
            </span>
          </button>

          <button
            onClick={onClearAll}
            disabled={isCachingAll}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-medium border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors flex items-center justify-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>清除本機小說文本快取（釋放空間）</span>
          </button>
        </div>
      </div>
    </div>
  );
};
