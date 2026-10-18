import React from "react";
import {
  BookOpen,
  RefreshCw,
  Smartphone,
  Tablet,
  Laptop,
} from "lucide-react";
import { ThemeDropdown } from "./ThemeDropdown";

interface BookshelfHeaderProps {
  deviceName: string;
  currentTheme: string;
  showThemeMenu: boolean;
  themeMenuRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  onOpenDeviceModal: () => void;
  onToggleThemeMenu: () => void;
  onSelectTheme: (themeId: string) => void;
  onRefresh: () => void;
  onOpenSystemInfo: () => void;
}

export const BookshelfHeader: React.FC<BookshelfHeaderProps> = ({
  deviceName,
  currentTheme,
  showThemeMenu,
  themeMenuRef,
  loading,
  onOpenDeviceModal,
  onToggleThemeMenu,
  onSelectTheme,
  onRefresh,
  onOpenSystemInfo,
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
    <header className="sticky top-0 z-30 border-b border-[var(--border-color)] bg-[var(--card-bg)] px-4 sm:px-8 py-3.5 flex items-center justify-between gap-2">
      {/* Brand */}
      <div className="flex items-center space-x-3 min-w-0">
        <button
          type="button"
          onClick={onOpenSystemInfo}
          className="p-2 rounded-xl bg-[var(--accent-color)] text-white shadow-sm shrink-0 hover:opacity-90 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/50"
          title="系統資訊 (點擊查看版本)"
          aria-label="查看系統資訊"
        >
          <BookOpen className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight truncate">小說書架</h1>
          <p className="text-xs text-[var(--text-muted)]">跨裝置同步閱讀</p>
        </div>
      </div>

      {/* Right Tools: Device Name, Theme Toggle, Refresh */}
      <div className="flex items-center space-x-2 shrink-0">
        <button
          onClick={onOpenDeviceModal}
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-muted)] hover:text-[var(--text-color)] hover:border-[var(--accent-color)] transition-colors"
          title="點擊自訂此裝置名稱與啟動偏好"
        >
          {renderDeviceIcon()}
          <span className="font-medium max-w-[110px] truncate">{deviceName}</span>
        </button>

        <ThemeDropdown
          currentTheme={currentTheme}
          showThemeMenu={showThemeMenu}
          themeMenuRef={themeMenuRef}
          onToggle={onToggleThemeMenu}
          onSelectTheme={onSelectTheme}
        />

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
