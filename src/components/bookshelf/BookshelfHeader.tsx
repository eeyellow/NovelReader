/**
 * @file BookshelfHeader.tsx
 * @description 書架頂部導覽列，包含連線狀態、裝置名稱、主題選單與儲存管理入口
 */

import React from "react";
import { BookOpen, WifiOff, HardDrive, RefreshCw, Smartphone, Tablet, Laptop } from "lucide-react";
import { ThemeDropdown } from "./ThemeDropdown";

interface BookshelfHeaderProps {
  isOffline: boolean;
  deviceName: string;
  currentTheme: string;
  showThemeMenu: boolean;
  themeMenuRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  onOpenDeviceModal: () => void;
  onToggleThemeMenu: () => void;
  onSelectTheme: (themeId: string) => void;
  onOpenStorageModal: () => void;
  onRefresh: () => void;
}

export const BookshelfHeader: React.FC<BookshelfHeaderProps> = ({
  isOffline,
  deviceName,
  currentTheme,
  showThemeMenu,
  themeMenuRef,
  loading,
  onOpenDeviceModal,
  onToggleThemeMenu,
  onSelectTheme,
  onOpenStorageModal,
  onRefresh,
}) => {
  const renderDeviceIcon = () => {
    if (deviceName.includes("iPhone") || deviceName.includes("Android")) {
      return <Smartphone className="w-3.5 h-3.5" />;
    }
    if (deviceName.includes("iPad")) {
      return <Tablet className="w-3.5 h-3.5" />;
    }
    return <Laptop className="w-3.5 h-3.5" />;
  };

  return (
    <header className="sticky top-0 z-30 backdrop-blur-md border-b border-[var(--border-color)] bg-[var(--header-bg)] px-4 sm:px-8 py-3.5 flex items-center justify-between gap-2">
      {/* Brand & Status */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="p-2 rounded-xl bg-[var(--accent-color)] text-white shadow-sm shrink-0">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight truncate">小說書架</h1>
          <p className="text-xs">
            {isOffline ? (
              <span className="inline-flex items-center text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                <WifiOff className="w-3 h-3 mr-1 inline shrink-0" /> 離線模式
              </span>
            ) : (
              <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 inline-block shrink-0 animate-pulse" />
                雲端連線
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Right Tools: Device Name, Theme Toggle, Refresh */}
      <div className="flex items-center space-x-2 shrink-0">
        {/* Device Tag */}
        <button
          onClick={onOpenDeviceModal}
          className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-muted)] hover:text-[var(--text-color)] hover:border-[var(--accent-color)] transition-colors"
          title="點擊自訂此裝置名稱"
        >
          {renderDeviceIcon()}
          <span className="font-medium">{deviceName}</span>
        </button>

        {/* Theme Selector */}
        <ThemeDropdown
          currentTheme={currentTheme}
          showThemeMenu={showThemeMenu}
          themeMenuRef={themeMenuRef}
          onToggle={onToggleThemeMenu}
          onSelectTheme={onSelectTheme}
        />

        {/* Storage & Offline Cache Manager */}
        <button
          onClick={onOpenStorageModal}
          className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-color)] hover:border-[var(--accent-color)] transition-colors"
          title="離線儲存空間與快取管理"
        >
          <HardDrive className="w-4 h-4" />
        </button>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-color)] transition-colors"
          title="重新整理書單"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
    </header>
  );
};
