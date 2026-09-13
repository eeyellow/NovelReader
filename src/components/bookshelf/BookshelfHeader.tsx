import React, { useState, useRef, useEffect } from "react";
import {
  BookOpen,
  WifiOff,
  HardDrive,
  RefreshCw,
  Smartphone,
  Tablet,
  Laptop,
  User,
  LogIn,
  LogOut,
} from "lucide-react";
import { ThemeDropdown } from "./ThemeDropdown";
import { UserSession } from "@/lib/auth";

interface BookshelfHeaderProps {
  isOffline: boolean;
  deviceName: string;
  currentTheme: string;
  showThemeMenu: boolean;
  themeMenuRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  currentUser: UserSession | null;
  onOpenDeviceModal: () => void;
  onToggleThemeMenu: () => void;
  onSelectTheme: (themeId: string) => void;
  onOpenStorageModal: () => void;
  onRefresh: () => void;
  onOpenAuthModal: () => void;
  onLogout: () => void;
}

export const BookshelfHeader: React.FC<BookshelfHeaderProps> = ({
  isOffline,
  deviceName,
  currentTheme,
  showThemeMenu,
  themeMenuRef,
  loading,
  currentUser,
  onOpenDeviceModal,
  onToggleThemeMenu,
  onSelectTheme,
  onOpenStorageModal,
  onRefresh,
  onOpenAuthModal,
  onLogout,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showUserMenu]);

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
                雲端共用
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Right Tools: Device Name, User Profile, Theme Toggle, Refresh */}
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

        {/* User Account Button & Dropdown */}
        {currentUser ? (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-1.5 p-1 sm:px-2 sm:py-1 rounded-lg border border-[var(--border-color)] hover:border-[var(--accent-color)] text-xs text-[var(--text-color)] transition-colors"
              title="帳號與共用身分"
            >
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="w-5 h-5 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[var(--accent-color)] text-white flex items-center justify-center text-[10px] font-bold">
                  {currentUser.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="hidden md:inline font-medium max-w-[80px] truncate">
                {currentUser.name}
              </span>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 p-2 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-xl z-50 text-xs animate-fade-in">
                <div className="px-3 py-2 border-b border-[var(--border-color)] mb-1">
                  <p className="font-bold truncate text-[var(--text-color)]">{currentUser.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{currentUser.email}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-[var(--accent-color)]/10 text-[var(--accent-color)] text-[10px] font-medium">
                      {currentUser.role === "admin" ? "管理員" : "共用書庫讀者"}
                    </span>
                    {currentUser.id.startsWith("cf_") && (
                      <span className="inline-block px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-medium">
                        Cloudflare 驗證
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onOpenAuthModal();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--border-color)]/50 text-[var(--text-color)] flex items-center gap-2 transition-colors"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>切換帳號 / 登入</span>
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onLogout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-600 dark:text-red-400 flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>登出此裝置</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-[var(--accent-color)] text-white text-xs font-medium hover:opacity-90 transition-opacity shadow-sm"
            title="登入帳號同步個人進度"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">登入</span>
          </button>
        )}

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
