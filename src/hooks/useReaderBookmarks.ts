/**
 * @file useReaderBookmarks.ts
 * @description 閱讀器書籤管理 Hook，封裝書籤之本機離線儲存、雲端伺服器非同步同步、增刪與跳轉
 */

import { useState, useCallback } from "react";
import { Bookmark as BookmarkType } from "@/lib/db";
import { LocalStore } from "@/lib/idb";
import { Chapter, findCurrentChapter } from "@/lib/parser";

interface UseReaderBookmarksOptions {
  bookId: string;
  chapters: Chapter[];
  currentChapter: Chapter | null;
  currentChapterParagraphs: string[];
  currentOffset: number;
  currentPage: number;
  currentChapterIdx: number;
  onJumpToOffset: (offset: number, chapterIdx: number) => void;
  onActivity?: () => void;
}

export function useReaderBookmarks({
  bookId,
  chapters,
  currentChapter,
  currentChapterParagraphs,
  currentOffset,
  currentPage,
  currentChapterIdx,
  onJumpToOffset,
  onActivity,
}: UseReaderBookmarksOptions) {
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);

  // 載入書籤（離線優先 + 背景非同步同步）
  const loadBookmarks = useCallback(async (targetBookId: string) => {
    try {
      const localBMs = await LocalStore.getBookmarks(targetBookId);
      if (localBMs && localBMs.length > 0) {
        setBookmarks(localBMs);
      }
      const res = await fetch(`/api/bookmarks?bookId=${targetBookId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.bookmarks)) {
          setBookmarks(data.bookmarks);
          for (const bm of data.bookmarks) {
            await LocalStore.saveBookmark(bm);
          }
        }
      }
    } catch (e) {
      console.warn("Error loading bookmarks:", e);
    }
  }, []);

  // 新增書籤
  const handleAddBookmark = useCallback(async () => {
    onActivity?.();
    if (!bookId || !currentChapter) return;
    const preview = currentChapterParagraphs[0]?.slice(0, 60) || currentChapter.title;
    const bmTitle = `${currentChapter.title} (第 ${currentPage + 1} 頁)`;

    const bmId = `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newBookmark: BookmarkType = {
      id: bmId,
      book_id: bookId,
      char_offset: currentOffset,
      title: bmTitle,
      preview_text: preview,
      created_at: new Date().toISOString(),
    };

    await LocalStore.saveBookmark(newBookmark);
    setBookmarks((prev) => [newBookmark, ...prev]);
    setBookmarkToast("已成功加入書籤！");
    setTimeout(() => setBookmarkToast(null), 2200);

    try {
      await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBookmark),
      });
    } catch (e) {
      console.warn("Failed to sync bookmark to server:", e);
    }
  }, [bookId, currentChapter, currentChapterParagraphs, currentPage, currentOffset, onActivity]);

  // 刪除書籤
  const handleDeleteBookmark = useCallback(
    async (e: React.MouseEvent, bmId: string) => {
      e.stopPropagation();
      onActivity?.();
      await LocalStore.deleteBookmark(bmId);
      setBookmarks((prev) => prev.filter((b) => b.id !== bmId));
      try {
        await fetch(`/api/bookmarks?id=${bmId}`, { method: "DELETE" });
      } catch (e) {
        console.warn("Failed to delete bookmark on server:", e);
      }
    },
    [onActivity]
  );

  // 跳轉至書籤位置
  const jumpToBookmark = useCallback(
    (bm: BookmarkType) => {
      onActivity?.();
      const chIdx = findCurrentChapter(chapters, bm.char_offset);
      onJumpToOffset(bm.char_offset, chIdx);
    },
    [chapters, onJumpToOffset, onActivity]
  );

  return {
    bookmarks,
    bookmarkToast,
    loadBookmarks,
    handleAddBookmark,
    handleDeleteBookmark,
    jumpToBookmark,
  };
}
