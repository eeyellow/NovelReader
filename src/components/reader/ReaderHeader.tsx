/**
 * @file ReaderHeader.tsx
 * @description 閱讀器頂部懸浮工具列，整合返回書架、目錄、搜尋、書籤、TTS、排版設定與全螢幕控制
 */

import React from "react";
import {
  ArrowLeft,
  Search,
  BookmarkPlus,
  Volume2,
  List,
  Sliders,
  MousePointerClick,
  Maximize,
  Minimize,
  WifiOff,
} from "lucide-react";

interface ReaderHeaderProps {
  showToolbar: boolean;
  title: string;
  processedChapterTitle: string;
  showTTSPlayer: boolean;
  showTOC: boolean;
  showSettings: boolean;
  isFullscreen: boolean;
  isOffline?: boolean;
  onBackToShelf: () => void;
  onOpenSearch: () => void;
  onAddBookmark: () => void;
  onToggleTTS: () => void;
  onToggleTOC: () => void;
  onToggleSettings: () => void;
  onOpenGestureModal: () => void;
  onToggleFullscreen: () => void;
}

export const ReaderHeader: React.FC<ReaderHeaderProps> = ({
  showToolbar,
  title,
  processedChapterTitle,
  showTTSPlayer,
  showTOC,
  showSettings,
  isFullscreen,
  isOffline,
  onBackToShelf,
  onOpenSearch,
  onAddBookmark,
  onToggleTTS,
  onToggleTOC,
  onToggleSettings,
  onOpenGestureModal,
  onToggleFullscreen,
}) => {
  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 transition-transform duration-300 backdrop-blur-md bg-[var(--header-bg)] border-b border-[var(--border-color)] px-4 py-2.5 safe-area-top flex items-center justify-between shadow-sm ${
        showToolbar ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="flex items-center space-x-2 truncate pr-2">
        <button
          onClick={onBackToShelf}
          className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
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

      <div className="flex items-center space-x-1 shrink-0">
        <button
          onClick={onOpenSearch}
          className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
          title="書內全文檢索"
          aria-label="搜尋內文"
        >
          <Search className="w-5 h-5" />
        </button>
        <button
          onClick={onAddBookmark}
          className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
          title="加入書籤"
          aria-label="加入書籤"
        >
          <BookmarkPlus className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleTTS}
          className={`p-2 rounded-xl transition-colors ${
            showTTSPlayer
              ? "bg-[var(--accent-color)] text-white shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)]"
          }`}
          title="語音朗讀 (TTS)"
          aria-label="語音朗讀"
        >
          <Volume2 className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleTOC}
          className={`p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors ${
            showTOC ? "text-[var(--accent-color)]" : ""
          }`}
          title="目錄與書籤"
          aria-label="目錄與書籤"
        >
          <List className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleSettings}
          className={`p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors ${
            showSettings ? "text-[var(--accent-color)]" : ""
          }`}
          title="閱讀偏好排版"
          aria-label="閱讀偏好排版"
        >
          <Sliders className="w-5 h-5" />
        </button>
        <button
          onClick={onOpenGestureModal}
          className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors hidden sm:block"
          title="滑鼠手勢設定"
          aria-label="滑鼠手勢設定"
        >
          <MousePointerClick className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleFullscreen}
          className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors hidden sm:block"
          title="全螢幕閱讀"
          aria-label="全螢幕閱讀"
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
};
