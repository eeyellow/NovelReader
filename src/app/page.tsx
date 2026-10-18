"use client";

/**
 * @file page.tsx
 * @description 書架首頁容器組件
 */

import React from "react";
import { BookOpen, Upload } from "lucide-react";
import { useBookshelf } from "@/hooks/useBookshelf";
import { BookshelfHeader } from "@/components/bookshelf/BookshelfHeader";
import { BookUploadBar } from "@/components/bookshelf/BookUploadBar";
import { BookshelfToolbar } from "@/components/bookshelf/BookshelfToolbar";
import { BookCard } from "@/components/bookshelf/BookCard";
import { DeviceModal } from "@/components/bookshelf/DeviceModal";
import { SimplifiedConvertModal } from "@/components/bookshelf/SimplifiedConvertModal";
import { RenameModal } from "@/components/bookshelf/RenameModal";
import { SystemInfoModal } from "@/components/bookshelf/SystemInfoModal";

export default function BookshelfPage() {
  const shelf = useBookshelf();

  if (shelf.isRedirecting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-color)] text-[var(--text-color)] select-none">
        <div className="flex flex-col items-center space-y-4 p-6 text-center">
          <div className="w-10 h-10 border-3 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin" />
          <div className="space-y-1">
            <p className="text-base font-bold">正在返回最後閱讀進度...</p>
            <p className="text-xs text-[var(--text-muted)]">無縫接軌繼續閱讀</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-200">
      <BookshelfHeader
        deviceName={shelf.deviceName}
        currentTheme={shelf.currentTheme}
        showThemeMenu={shelf.showThemeMenu}
        themeMenuRef={shelf.themeMenuRef}
        loading={shelf.loading}
        onOpenDeviceModal={() => shelf.setShowDeviceModal(true)}
        onToggleThemeMenu={() => shelf.setShowThemeMenu((prev) => !prev)}
        onSelectTheme={(themeId) => {
          shelf.changeTheme(themeId);
          shelf.setShowThemeMenu(false);
        }}
        onRefresh={shelf.fetchBooks}
        onOpenSystemInfo={() => shelf.setShowSystemInfoModal(true)}
      />

      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 space-y-6">
        <BookUploadBar
          isUploading={shelf.isUploading}
          isOffline={shelf.isOffline}
          uploadStatus={shelf.uploadStatus}
          searchTerm={shelf.searchTerm}
          fileInputRef={shelf.fileInputRef}
          onSearchChange={shelf.setSearchTerm}
          onFileSelect={shelf.handleFileSelect}
        />

        <div>
          <BookshelfToolbar
            totalCount={shelf.filteredBooks.length}
            sortBy={shelf.sortBy}
            sortOrder={shelf.sortOrder}
            layoutMode={shelf.layoutMode}
            onSortByChange={shelf.handleSetSortBy}
            onToggleSortOrder={shelf.handleToggleSortOrder}
            onLayoutModeChange={shelf.handleSetLayout}
          />

          {shelf.loading ? (
            shelf.layoutMode === "compact" ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded-xl bg-[var(--card-bg)] animate-pulse border border-[var(--border-color)]"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-44 rounded-2xl bg-[var(--card-bg)] animate-pulse border border-[var(--border-color)]"
                  />
                ))}
              </div>
            )
          ) : shelf.filteredBooks.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] space-y-3">
              <BookOpen className="w-12 h-12 mx-auto text-[var(--text-muted)] opacity-50" />
              <h3 className="font-semibold text-base">目前書架空空如也</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                {shelf.searchTerm
                  ? "找不到符合搜尋條件的小說"
                  : shelf.isOffline
                  ? "目前處於離線狀態且尚無已快取的書籍，請連線後開啟。"
                  : "快把電腦或手機裡的 .TXT / .EPUB 小說檔案拖曳進來開始閱讀吧！"}
              </p>
              {!shelf.searchTerm && !shelf.isOffline && (
                <div className="pt-2">
                  <button
                    onClick={() => shelf.fileInputRef.current?.click()}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 transition-opacity"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>點擊上傳小說</span>
                  </button>
                </div>
              )}
            </div>
          ) : shelf.layoutMode === "compact" ? (
            <div className="space-y-2">
              {shelf.filteredBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  layoutMode="compact"
                  isCached={shelf.cachedIds.has(book.id)}
                  isOffline={shelf.isOffline}
                  onDelete={shelf.handleDeleteBook}
                  onOpenRename={shelf.handleOpenRename}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shelf.filteredBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  layoutMode="detailed"
                  isCached={shelf.cachedIds.has(book.id)}
                  isOffline={shelf.isOffline}
                  onDelete={shelf.handleDeleteBook}
                  onOpenRename={shelf.handleOpenRename}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <DeviceModal
        isOpen={shelf.showDeviceModal}
        tempDeviceName={shelf.tempDeviceName}
        autoResume={shelf.autoResume}
        onTempDeviceNameChange={shelf.setTempDeviceName}
        onAutoResumeChange={shelf.setAutoResume}
        onClose={() => shelf.setShowDeviceModal(false)}
        onSave={shelf.handleSaveDeviceName}
      />

      <SimplifiedConvertModal
        pendingFile={shelf.pendingSimplifiedFile}
        rememberConversionChoice={shelf.rememberConversionChoice}
        onRememberChoiceChange={shelf.setRememberConversionChoice}
        onCancel={() => shelf.setPendingSimplifiedFile(null)}
        onConfirmChoice={shelf.handleConfirmSimplifiedChoice}
      />

      <RenameModal
        editingBook={shelf.editingBook}
        editTitleInput={shelf.editTitleInput}
        isSavingTitle={shelf.isSavingTitle}
        onTitleInputChange={shelf.setEditTitleInput}
        onClose={() => shelf.setEditingBook(null)}
        onSave={shelf.handleSaveTitle}
      />

      <SystemInfoModal
        isOpen={shelf.showSystemInfoModal}
        onClose={() => shelf.setShowSystemInfoModal(false)}
        deviceName={shelf.deviceName}
        totalBooksCount={shelf.books.length}
      />
    </div>
  );
}
