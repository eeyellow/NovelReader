import React, { useState } from "react";
import {
  Info,
  GitCommit,
  Calendar,
  BookOpen,
  Smartphone,
  Copy,
  Check,
  X,
} from "lucide-react";
import { APP_VERSION, BUILD_TIME } from "@/constants/version";

interface SystemInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceName: string;
  totalBooksCount: number;
}

export const SystemInfoModal: React.FC<SystemInfoModalProps> = ({
  isOpen,
  onClose,
  deviceName,
  totalBooksCount,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyVersion = async () => {
    try {
      await navigator.clipboard.writeText(APP_VERSION);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
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
        className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[var(--accent-color)]/15 text-[var(--accent-color)]">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">系統資訊</h3>
              <p className="text-xs text-[var(--text-muted)]">NovelReader 版本與狀態</p>
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

        <div className="p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-muted)] font-medium flex items-center gap-1.5">
              <GitCommit className="w-3.5 h-3.5 text-[var(--accent-color)]" />
              目前系統版本
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
          </div>

          <div className="flex items-center text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-color)]">
            <Calendar className="w-3 h-3 mr-1 shrink-0" />
            <span>建置時間：{formattedBuildTime}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] space-y-2.5 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-[var(--text-muted)] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[var(--accent-color)]" />
              書庫小說總數
            </span>
            <span className="font-semibold">{totalBooksCount} 本</span>
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

        <div className="pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white hover:opacity-90 transition-opacity"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};
