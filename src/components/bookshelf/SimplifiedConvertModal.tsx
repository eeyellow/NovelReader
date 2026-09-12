/**
 * @file SimplifiedConvertModal.tsx
 * @description 偵測到簡體中文小說時的轉碼確認對話框組件
 */

import React from "react";
import { Sparkles, X, Check } from "lucide-react";

interface SimplifiedConvertModalProps {
  pendingFile: File | null;
  rememberConversionChoice: boolean;
  onRememberChoiceChange: (val: boolean) => void;
  onCancel: () => void;
  onConfirmChoice: (convertToTraditional: boolean) => void;
}

export const SimplifiedConvertModal: React.FC<SimplifiedConvertModalProps> = ({
  pendingFile,
  rememberConversionChoice,
  onRememberChoiceChange,
  onCancel,
  onConfirmChoice,
}) => {
  if (!pendingFile) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-[var(--accent-color)] bg-opacity-15 text-[var(--accent-color)]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">偵測到簡體中文小說</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate max-w-[260px]">
                《{pendingFile.name}》
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1"
            aria-label="關閉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
          此檔案內容檢測為簡體中文。請問是否要自動轉換為
          <strong className="text-[var(--text-color)]">繁體（正體）中文</strong>並同步至 NAS？
        </p>

        {/* Remember Choice Checkbox */}
        <label className="flex items-center space-x-2 text-xs text-[var(--text-muted)] cursor-pointer select-none pt-1">
          <input
            type="checkbox"
            checked={rememberConversionChoice}
            onChange={(e) => onRememberChoiceChange(e.target.checked)}
            className="rounded border-[var(--border-color)] accent-[var(--accent-color)] w-4 h-4"
          />
          <span>記住此選擇（之後簡體小說一律自動轉換為繁體）</span>
        </label>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--border-color)]">
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-color)]"
          >
            取消上傳
          </button>
          <button
            onClick={() => onConfirmChoice(false)}
            className="px-3.5 py-2 rounded-xl text-xs border border-[var(--border-color)] hover:bg-[var(--bg-color)] font-medium transition-colors"
          >
            保留原檔簡體
          </button>
          <button
            onClick={() => onConfirmChoice(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 transition-opacity flex items-center space-x-1"
          >
            <Check className="w-3.5 h-3.5 mr-1" />
            <span>轉換為繁體中文</span>
          </button>
        </div>
      </div>
    </div>
  );
};
