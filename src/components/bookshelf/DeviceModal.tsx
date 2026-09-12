/**
 * @file DeviceModal.tsx
 * @description 裝置名稱設定與自動接續閱讀彈跳對話框
 */

import React from "react";

interface DeviceModalProps {
  isOpen: boolean;
  tempDeviceName: string;
  autoResume: boolean;
  onTempDeviceNameChange: (val: string) => void;
  onAutoResumeChange: (val: boolean) => void;
  onClose: () => void;
  onSave: () => void;
}

export const DeviceModal: React.FC<DeviceModalProps> = ({
  isOpen,
  tempDeviceName,
  autoResume,
  onTempDeviceNameChange,
  onAutoResumeChange,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
        <h3 className="font-bold text-base">設定此裝置名稱</h3>
        <p className="text-xs text-[var(--text-muted)]">
          多裝置同步時會顯示此標籤（例如：「iPad Pro」、「公司筆電」、「客廳桌機」），方便識別進度來源。
        </p>
        <input
          type="text"
          value={tempDeviceName}
          onChange={(e) => onTempDeviceNameChange(e.target.value)}
          placeholder="例如：iPhone 15 Pro"
          className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
        />

        <div className="pt-2 border-t border-[var(--border-color)]">
          <label className="flex items-center justify-between cursor-pointer py-1 select-none">
            <div className="pr-3">
              <div className="text-xs font-semibold">啟動時自動繼續閱讀</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                開啟應用程式或 PWA 時，預設直接進入上次閱讀的小說
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoResume}
              onChange={(e) => {
                const val = e.target.checked;
                onAutoResumeChange(val);
                localStorage.setItem("novel_reader_auto_resume", val ? "true" : "false");
              }}
              className="w-4 h-4 accent-[var(--accent-color)] rounded cursor-pointer shrink-0"
            />
          </label>
        </div>
        <div className="flex justify-end space-x-2 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-color)]"
          >
            取消
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 transition-opacity"
          >
            儲存設定
          </button>
        </div>
      </div>
    </div>
  );
};
