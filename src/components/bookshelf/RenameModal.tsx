/**
 * @file RenameModal.tsx
 * @description 書籍名稱編輯對話框組件
 */

import React from "react";
import { X } from "lucide-react";
import { EditingBookState } from "@/types/bookshelf";

interface RenameModalProps {
  editingBook: EditingBookState | null;
  editTitleInput: string;
  isSavingTitle: boolean;
  onTitleInputChange: (val: string) => void;
  onClose: () => void;
  onSave: (e?: React.FormEvent) => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  editingBook,
  editTitleInput,
  isSavingTitle,
  onTitleInputChange,
  onClose,
  onSave,
}) => {
  if (!editingBook) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">修改書籍名稱</h3>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1 rounded-lg"
            aria-label="關閉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          自訂書架上顯示的書籍名稱，不會影響原始檔案內容。
        </p>
        <form onSubmit={onSave} className="space-y-4">
          <input
            type="text"
            value={editTitleInput}
            onChange={(e) => onTitleInputChange(e.target.value)}
            placeholder="請輸入新書名"
            autoFocus
            className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
          />
          <div className="flex justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-color)]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSavingTitle || !editTitleInput.trim()}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isSavingTitle ? "儲存中..." : "儲存名稱"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
