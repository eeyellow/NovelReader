/**
 * @file BookUploadBar.tsx
 * @description 書架上傳檔案拖曳區塊與關鍵字搜尋列組件
 */

import React from "react";
import { Upload, Search, X } from "lucide-react";

interface BookUploadBarProps {
  isUploading: boolean;
  uploadStatus: string | null;
  searchTerm: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onSearchChange: (value: string) => void;
  onFileSelect: (files: FileList | null) => void;
}

export const BookUploadBar: React.FC<BookUploadBarProps> = ({
  isUploading,
  uploadStatus,
  searchTerm,
  fileInputRef,
  onSearchChange,
  onFileSelect,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Upload Dropzone / Button */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFileSelect(e.dataTransfer.files);
        }}
        className="md:col-span-2 group cursor-pointer border-2 border-dashed border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:bg-opacity-80 rounded-2xl p-5 flex items-center justify-between transition-all duration-200 shadow-sm"
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".txt,.epub,text/plain,application/epub+zip"
          className="hidden"
          onChange={(e) => onFileSelect(e.target.files)}
        />
        <div className="flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)] group-hover:scale-105 transition-transform">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <p className="font-semibold text-sm sm:text-base">
              {isUploading ? uploadStatus : "點擊或拖曳 .TXT / .EPUB 小說上傳"}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              自動識別 UTF-8、Big5、GBK 及 EPUB 結構並同步至私有雲
            </p>
          </div>
        </div>
        <span className="hidden sm:inline-block text-xs px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] group-hover:border-[var(--accent-color)] group-hover:text-[var(--accent-color)] font-medium">
          選擇檔案
        </span>
      </div>

      {/* Search Box */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 absolute left-3.5 text-[var(--text-muted)] pointer-events-none" />
        <input
          type="text"
          placeholder="搜尋書名..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 text-[var(--text-muted)] hover:text-[var(--text-color)]"
            aria-label="清除搜尋關鍵字"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
