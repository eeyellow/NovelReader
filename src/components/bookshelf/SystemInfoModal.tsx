/**
 * @file SystemInfoModal.tsx
 * @description 系統資訊與版本對話框組件，顯示 Git commit SHA-1 版本、建置時間、PWA 狀態與本機資料庫資訊
 */

import React, { useState, useEffect } from "react";
import {
  Info,
  GitCommit,
  Calendar,
  Wifi,
  WifiOff,
  HardDrive,
  BookOpen,
  Smartphone,
  User,
  Copy,
  Check,
  RefreshCw,
  X,
  Layers,
} from "lucide-react";
import { APP_VERSION, BUILD_TIME } from "@/constants/version";
import { formatSize } from "@/lib/format";
import { UserSession } from "@/lib/auth";

interface SystemInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOffline: boolean;
  deviceName: string;
  currentUser: UserSession | null;
  totalBooksCount: number;
  cachedCount: number;
  storageUsage: number;
  storageQuota: number;
}

export const SystemInfoModal: React.FC<SystemInfoModalProps> = ({
  isOpen,
  onClose,
  isOffline,
  deviceName,
  currentUser,
  totalBooksCount,
  cachedCount,
  storageUsage,
  storageQuota,
}) => {
  const [copied, setCopied] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [swActive, setSwActive] = useState<boolean | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // 檢測是否為 PWA 獨立視窗模式 (Standalone / Display-mode)
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(Boolean(standalone));

    // 檢測 Service Worker 是否已啟用
    if ("serviceWorker" in navigator) {
      setSwActive(Boolean(navigator.serviceWorker.controller));
    } else {
      setSwActive(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyVersion = async () => {
    try {
      await navigator.clipboard.writeText(APP_VERSION);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 忽略複製失敗
    }
  };

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateMsg(null);
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) {
            setUpdateMsg("發現新版本！重整頁面即可更新。");
          } else {
            setUpdateMsg("目前已是最新版本。");
          }
        } else {
          setUpdateMsg("目前環境未註冊 Service Worker。");
        }
      } else {
        setUpdateMsg("此瀏覽器不支援 Service Worker。");
      }
    } catch {
      setUpdateMsg("檢查更新失敗，請檢查網路連線。");
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const formattedBuildTime = BUILD_TIME
    ? new Date(BUILD_TIME).toLocaleString("zh-TW", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "本機開發環境";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent-color)]/15 text-[var(--accent-color)]">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">系統資訊</h3>
              <p className="text-xs text-[var(--text-muted)]">NovelReader 應用程式版本與狀態</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1.5 rounded-lg transition-colors"
            aria-label="關閉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Version Card */}
        <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)] font-medium flex items-center gap-1.5">
              <GitCommit className="w-3.5 h-3.5 text-[var(--accent-color)]" />
              目前系統版本 (Git SHA-1)
            </span>
            <button
              onClick={handleCopyVersion}
              className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[11px] font-medium border border-[var(--border-color)] hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-colors"
              title="複製版本號"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-500">已複製</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>複製</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-baseline space-x-2">
            <code className="text-lg font-mono font-bold text-[var(--accent-color)] tracking-wider">
              {APP_VERSION}
            </code>
            <span className="text-[11px] text-[var(--text-muted)]">
              {APP_VERSION === "dev" ? "(開發模式)" : "(穩定版本)"}
            </span>
          </div>

          <div className="flex items-center text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-color)]">
            <Calendar className="w-3 h-3 mr-1 shrink-0" />
            <span>打包時間：{formattedBuildTime}</span>
          </div>
        </div>

        {/* Runtime & Environment Details */}
        <div className="space-y-2 text-xs">
          {/* PWA & Network */}
          <div className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                運行環境
              </span>
              <span className="font-semibold">
                {isStandalone ? "PWA 獨立應用程式" : "瀏覽器網頁視窗"}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                {isOffline ? (
                  <WifiOff className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                )}
                網路連線
              </span>
              <span
                className={`font-semibold ${
                  isOffline ? "text-amber-500" : "text-emerald-500"
                }`}
              >
                {isOffline ? "離線模式" : "在線連線中"}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">Service Worker 離線引擎</span>
              <span className="font-semibold">
                {swActive === null
                  ? "檢查中..."
                  : swActive
                  ? "已啟動（支援完全離線）"
                  : "未啟動"}
              </span>
            </div>
          </div>

          {/* Storage & Books Data */}
          <div className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                書庫小說總數
              </span>
              <span className="font-semibold">{totalBooksCount} 本</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                本機離線快取
              </span>
              <span className="font-semibold">
                {cachedCount} / {totalBooksCount} 本
                {totalBooksCount > 0 &&
                  ` (${Math.round((cachedCount / totalBooksCount) * 100)}%)`}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)]">IndexedDB 儲存用量</span>
              <span className="font-semibold">
                {formatSize(storageUsage)}
                {storageQuota > 0 && ` / ${formatSize(storageQuota)}`}
              </span>
            </div>
          </div>

          {/* Account & Device */}
          <div className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                目前身分
              </span>
              <span className="font-semibold truncate max-w-[180px]">
                {currentUser ? `${currentUser.name}` : "訪客（未登入）"}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                本機裝置識別
              </span>
              <span className="font-semibold truncate max-w-[180px]">
                {deviceName || "未命名裝置"}
              </span>
            </div>
          </div>
        </div>

        {/* Update feedback msg */}
        {updateMsg && (
          <div className="p-2.5 rounded-xl text-xs bg-[var(--accent-color)]/10 text-[var(--accent-color)] font-medium text-center animate-fade-in">
            {updateMsg}
          </div>
        )}

        {/* Actions Footer */}
        <div className="flex items-center justify-between pt-1 gap-2">
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
            className="flex-1 inline-flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-[var(--border-color)] hover:border-[var(--accent-color)] text-[var(--text-color)] transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isCheckingUpdate ? "animate-spin" : ""}`}
            />
            <span>{isCheckingUpdate ? "正在檢查..." : "檢查更新"}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white hover:opacity-90 transition-opacity"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
};
