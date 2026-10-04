/**
 * @file ReaderHeader.tsx
 * @description 閱讀器頂部懸浮資訊列，展示返回書架、書名、章節與離線狀態
 */

import React from "react";
import { ArrowLeft, Maximize, Minimize, WifiOff } from "lucide-react";

interface ReaderHeaderProps {
  showToolbar: boolean;
  title: string;
  processedChapterTitle: string;
  isOffline?: boolean;
  onBackToShelf: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const ReaderHeader: React.FC<ReaderHeaderProps> = ({
  showToolbar,
  title,
  processedChapterTitle,
  isOffline,
  onBackToShelf,
  isFullscreen,
  onToggleFullscreen,
}) => {
  return (
    <header
      style={{ backdropFilter: "none", WebkitBackdropFilter: "none" }}
      className={`fixed top-0 inset-x-0 z-40 bg-[var(--card-bg)] border-b border-[var(--border-color)] px-4 py-2 safe-area-top items-center justify-between shadow-sm transition-opacity duration-200 ${
        showToolbar ? "flex" : "hidden"
      }`}
    >
      <div className="flex items-center space-x-2 truncate pr-2">
        <button
          onClick={onBackToShelf}
          className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--bg-color)] transition-colors"
          title="返回書架"
          aria-label="返回書架"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="truncate">
          <div className="flex items-center gap-1.5 truncate">
            <h1 className="text-sm font-bold truncate">{title}</h1>
            {isOffline && (
              <span
                className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium shrink-0"
                title="離線閱讀中，進度與書籤安全保存於本機"
              >
                <WifiOff className="w-2.5 h-2.5 mr-0.5" /> 離線
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] truncate">
            {processedChapterTitle}
          </p>
        </div>
      </div>

      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--bg-color)] transition-colors hidden sm:block shrink-0"
          title={isFullscreen ? "退出全螢幕" : "全螢幕沉浸閱讀"}
          aria-label={isFullscreen ? "退出全螢幕" : "全螢幕沉浸閱讀"}
        >
          {isFullscreen ? (
            <Minimize className="w-5 h-5" />
          ) : (
            <Maximize className="w-5 h-5" />
          )}
        </button>
      )}
    </header>
  );
};

