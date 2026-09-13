/**
 * @file useReaderBookmarks.ts
 * @description 閱讀器書籤管理 Hook，封裝書籤之本機離線儲存、雲端伺服器非同步同步、增刪與跳轉
 */

import { useState, useCallback } from "react";
import { Bookmark as BookmarkType } from "@/lib/db";
import { LocalStore } from "@/lib/idb";
import { Chapter, findCurrentChapter } from "@/lib/parser";
import { getCachedUserId } from "@/lib/clientAuth";

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

  // 載入書籤（離線優先 + 背景非同步同步 + 雙向合併 + 離線刪除追蹤）
  const loadBookmarks = useCallback(async (targetBookId: string) => {
    try {
      const currentUserId = getCachedUserId();
      const localBMs = await LocalStore.getBookmarks(targetBookId, currentUserId);
      const deletedIds = new Set(await LocalStore.getDeletedBookmarkIds());

      const activeLocalBMs = (localBMs || []).filter((b) => !deletedIds.has(b.id));
      if (activeLocalBMs.length > 0) {
        setBookmarks(activeLocalBMs);
      }

      const res = await fetch(`/api/bookmarks?bookId=${targetBookId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.bookmarks)) {
          const mergedMap = new Map<string, BookmarkType>();
          for (const bm of activeLocalBMs) {
            mergedMap.set(bm.id, bm);
          }

          for (const bm of data.bookmarks as BookmarkType[]) {
            // 若該書籤曾在本機離線刪除，向伺服器補發刪除請求，不復原
            if (deletedIds.has(bm.id)) {
              fetch(`/api/bookmarks?id=${bm.id}`, { method: "DELETE" })
                .then(() => LocalStore.clearBookmarkDeleted(bm.id))
                .catch(console.warn);
              continue;
            }
            mergedMap.set(bm.id, { ...mergedMap.get(bm.id), ...bm });
            await LocalStore.saveBookmark(bm);
          }

          // 背景上傳本機新增但伺服器尚未收錄的離線書籤
          const serverIdSet = new Set(data.bookmarks.map((b: BookmarkType) => b.id));
          for (const bm of activeLocalBMs) {
            if (!serverIdSet.has(bm.id)) {
              fetch("/api/bookmarks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bm),
              }).catch(console.warn);
            }
          }

          const merged = Array.from(mergedMap.values()).sort(
            (a, b) => a.char_offset - b.char_offset
          );
          setBookmarks(merged);
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
    const currentUserId = getCachedUserId();

    const bmId = `bm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newBookmark: BookmarkType = {
      id: bmId,
      book_id: bookId,
      user_id: currentUserId,
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
      console.warn("離線狀態，書籤已安全保存在本機：", e);
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
        const res = await fetch(`/api/bookmarks?id=${bmId}`, { method: "DELETE" });
        if (res.ok) {
          await LocalStore.clearBookmarkDeleted(bmId);
        }
      } catch (e) {
        console.warn("離線狀態下刪除書籤，已排入待同步刪除佇列：", e);
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
