/**
 * @file useReaderPagination.ts
 * @description 閱讀器分頁演算法、視窗尺寸響應、跨裝置進度同步與導航管理 Hook
 */

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { Chapter, findCurrentChapter } from "@/lib/parser";
import { syncProgress } from "@/lib/sync";
import { ScrubberMode, ConflictPromptData } from "@/types/reader";

interface UseReaderPaginationOptions {
  bookId: string;
  chapters: Chapter[];
  totalChars: number;
  currentChapterIdx: number;
  setCurrentChapterIdx: (idx: number | ((prev: number) => number)) => void;
  currentChapter: Chapter | null;
  processedChapterTitle: string;
  processedParagraphs: string[];
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  maxWidthMode: string;
  columnGap?: number;
  onActivity?: () => void;
}

export function useReaderPagination({
  bookId,
  chapters,
  totalChars,
  currentChapterIdx,
  setCurrentChapterIdx,
  currentChapter,
  processedChapterTitle,
  processedParagraphs,
  fontSize,
  lineHeight,
  fontFamily,
  maxWidthMode,
  columnGap = 36,
  onActivity,
}: UseReaderPaginationOptions) {
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [chapterSwitchToast, setChapterSwitchToast] = useState<string | null>(null);
  const [scrubberMode, setScrubberMode] = useState<ScrubberMode>("chapter");
  const [scrubBookPercentage, setScrubBookPercentage] = useState<number>(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPage, setScrubPage] = useState(0);

  // 跨裝置雲端進度衝突提示
  const [conflictPrompt, setConflictPrompt] = useState<ConflictPromptData | null>(null);

  // 視圖與量測 DOM 參照
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const readerMainRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeChapterBtnRef = useRef<HTMLButtonElement | null>(null);

  // 分頁導航目標暫存指標
  const pendingPageRef = useRef<"first" | "last" | null>(null);
  const pendingTargetOffset = useRef<number | null>(null);
  const pendingTargetPageRatio = useRef<number | null>(null);
  const pendingTargetPageIndex = useRef<number | null>(null);
  const pendingTargetTotalPages = useRef<number | null>(null);
  const isRestoringProgress = useRef<boolean>(true);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;
  const lastDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const currentChapterRef = useRef(currentChapter);
  currentChapterRef.current = currentChapter;
  const currentChapterIdxRef = useRef(currentChapterIdx);
  currentChapterIdxRef.current = currentChapterIdx;
  const currentOffsetRef = useRef(currentOffset);
  currentOffsetRef.current = currentOffset;

  // 章節切換 Toast 提示
  const notifyChapterSwitch = useCallback(
    (targetIdx: number) => {
      if (chapters[targetIdx]) {
        const nextTitle = chapters[targetIdx].title;
        setChapterSwitchToast(`切換至：${nextTitle}`);
        setTimeout(() => setChapterSwitchToast(null), 2400);
      }
    },
    [chapters]
  );

  // 多欄分頁核心重算演算法
  const measurePagination = useCallback(() => {
    if (!viewportRef.current || !contentRef.current) return;

    const vWidth = viewportRef.current.clientWidth;
    if (vWidth <= 0) return;
    setViewportWidth(vWidth);

    // 強制將當前視窗寬度同步至 contentRef DOM 樣式，避免 React 狀態更新延遲導致第一次計算 columnWidth 為 auto
    contentRef.current.style.width = `${vWidth}px`;
    contentRef.current.style.columnWidth = `${vWidth}px`;
    contentRef.current.style.columnGap = `${columnGap}px`;
    contentRef.current.style.columnFill = "auto";

    // 由 CSS columns 計算的整體內容滾動寬度
    const scrollW = contentRef.current.scrollWidth;
    const totalCols = Math.max(1, Math.round((scrollW + columnGap) / (vWidth + columnGap)));
    setTotalPages(totalCols);

    // 處理連續滾動容器的滾動位置重置與定位
    if (scrollContainerRef.current) {
      if (pendingPageRef.current === "last") {
        scrollContainerRef.current.scrollTop =
          scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight;
      } else if (pendingPageRef.current === "first") {
        scrollContainerRef.current.scrollTop = 0;
      } else if (pendingTargetOffset.current !== null && currentChapter) {
        const relOffset = Math.max(0, pendingTargetOffset.current - currentChapter.charOffset);
        const chLen = currentChapter.length || 1;
        const ratio = Math.min(1, Math.max(0, relOffset / chLen));
        scrollContainerRef.current.scrollTop = Math.round(
          ratio * (scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight)
        );
      }
    }

    // 判斷章節是否具有多頁內容特徵
    const chapterHasMultiplePagesLikely =
      (currentChapter?.length || 0) > 350 || processedParagraphs.length > 2;

    // 處理目標翻頁定位指示
    if (pendingPageRef.current === "last") {
      if (totalCols <= 1 && chapterHasMultiplePagesLikely) {
        requestAnimationFrame(() => measurePagination());
        return;
      }
      setCurrentPage(totalCols - 1);
      pendingPageRef.current = null;
      isRestoringProgress.current = false;
    } else if (pendingPageRef.current === "first") {
      setCurrentPage(0);
      pendingPageRef.current = null;
      isRestoringProgress.current = false;
    } else if (
      pendingTargetPageRatio.current !== null ||
      pendingTargetPageIndex.current !== null ||
      pendingTargetOffset.current !== null
    ) {
      const isTargetNonZero =
        (pendingTargetPageIndex.current !== null && pendingTargetPageIndex.current > 0) ||
        (pendingTargetPageRatio.current !== null && pendingTargetPageRatio.current > 0.05) ||
        (pendingTargetOffset.current !== null &&
          currentChapter &&
          pendingTargetOffset.current > currentChapter.charOffset + 300);

      // 若有非首頁的目標指示，但多欄排版尚未生效（總欄數仍為 1），保留目標並排入下一幀重新測量
      if (totalCols <= 1 && chapterHasMultiplePagesLikely && isTargetNonZero) {
        requestAnimationFrame(() => {
          measurePagination();
        });
        return;
      }

      let targetP = 0;
      const relOffset =
        pendingTargetOffset.current !== null && currentChapter
          ? Math.max(0, pendingTargetOffset.current - currentChapter.charOffset)
          : 0;
      const chLen = currentChapter?.length || 1;

      // 若 pendingTargetPageIndex > 0，優先還原精確頁碼
      if (
        pendingTargetPageIndex.current !== null &&
        pendingTargetPageIndex.current > 0
      ) {
        if (
          pendingTargetTotalPages.current &&
          pendingTargetTotalPages.current > 0 &&
          pendingTargetTotalPages.current !== totalCols
        ) {
          // 版面尺寸已變更（例如旋轉螢幕或縮放視窗），依原總頁數比例對應新總頁數
          const ratio = pendingTargetPageIndex.current / pendingTargetTotalPages.current;
          targetP = Math.min(totalCols - 1, Math.max(0, Math.floor(ratio * totalCols)));
        } else {
          targetP = Math.min(totalCols - 1, Math.max(0, pendingTargetPageIndex.current));
        }
      } else if (pendingTargetOffset.current !== null && currentChapter && relOffset > 300) {
        // 若 pendingTargetPageIndex 為 0（可能曾被舊版本誤設為 0），但 offset 明顯已深入本章，以字元偏移量比例計算真實頁碼
        const ratio = Math.min(1, Math.max(0, relOffset / chLen));
        targetP = Math.min(totalCols - 1, Math.max(0, Math.floor(ratio * totalCols + 1e-4)));
      } else if (pendingTargetPageIndex.current !== null && pendingTargetPageIndex.current >= 0) {
        targetP = Math.min(totalCols - 1, Math.max(0, pendingTargetPageIndex.current));
      } else if (pendingTargetPageRatio.current !== null && pendingTargetPageRatio.current >= 0) {
        targetP = Math.min(
          totalCols - 1,
          Math.max(0, Math.floor(pendingTargetPageRatio.current * totalCols))
        );
      } else if (pendingTargetOffset.current !== null && currentChapter) {
        const ratio = Math.min(1, Math.max(0, relOffset / chLen));
        targetP = Math.min(totalCols - 1, Math.max(0, Math.floor(ratio * totalCols + 1e-4)));
      }

      setCurrentPage(targetP);
      if (vWidth > 0 && contentRef.current) {
        contentRef.current.style.transition = "none";
        contentRef.current.style.transform = `translateX(-${targetP * (vWidth + columnGap)}px)`;
        void contentRef.current.offsetWidth;
      }

      pendingTargetPageRatio.current = null;
      pendingTargetPageIndex.current = null;
      pendingTargetOffset.current = null;
      pendingTargetTotalPages.current = null;
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.style.transition = "";
        }
        isRestoringProgress.current = false;
      }, 300);
    } else {
      setCurrentPage((prev) => Math.min(prev, totalCols - 1));
    }
  }, [currentChapter, columnGap, processedParagraphs.length]);

  // 排版或章節變更後重新計算分頁
  useLayoutEffect(() => {
    measurePagination();
    const timer = setTimeout(() => {
      measurePagination();
    }, 60);
    return () => clearTimeout(timer);
  }, [
    currentChapterIdx,
    processedParagraphs,
    fontSize,
    lineHeight,
    fontFamily,
    maxWidthMode,
    measurePagination,
  ]);

  // ResizeObserver 監聽視窗或旋轉螢幕，按閱讀比例保留位置
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const entry = entries[0];
      const newWidth = Math.round(entry.contentRect.width);
      const newHeight = Math.round(entry.contentRect.height);
      if (newWidth <= 0 || newHeight <= 0) return;

      const prev = lastDimensionsRef.current;
      if (prev.width === newWidth && prev.height === newHeight) {
        return;
      }
      lastDimensionsRef.current = { width: newWidth, height: newHeight };

      if (currentChapterRef.current && totalPagesRef.current > 1 && !isRestoringProgress.current) {
        const curP = currentPageRef.current;
        const totP = totalPagesRef.current;
        pendingTargetPageRatio.current = curP / totP;
      }
      measurePagination();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [measurePagination]);

  // 當翻頁時計算當前 offset 並回傳進度
  useEffect(() => {
    if (
      isRestoringProgress.current ||
      pendingTargetOffset.current !== null ||
      pendingTargetPageIndex.current !== null ||
      pendingTargetPageRatio.current !== null
    ) {
      return;
    }
    if (!currentChapter || !totalChars || totalPages <= 0) return;

    const chStart = currentChapter.charOffset;
    const chLen = currentChapter.length || 0;
    const pageRatio = totalPages > 0 ? currentPage / totalPages : 0;
    const calculatedOffset = Math.min(totalChars, Math.round(chStart + pageRatio * chLen));

    setCurrentOffset(calculatedOffset);
    const percentage = Number(((calculatedOffset / totalChars) * 100).toFixed(2));
    syncProgress(bookId, calculatedOffset, percentage, false, {
      chapter_index: currentChapterIdx,
      page_index: currentPage,
      page_ratio: pageRatio,
      total_pages: totalPages,
    });
  }, [bookId, currentChapter, currentChapterIdx, currentPage, totalPages, totalChars]);

  // Page Visibility API、Pagehide 與 Beforeunload 進度儲存監聽
  useEffect(() => {
    if (!bookId) return;

    const handleSyncOnClose = () => {
      // 正在復原進度時不覆蓋已有進度
      if (isRestoringProgress.current) return;

      if (totalChars > 0 && currentChapterRef.current) {
        const curOffset = currentOffsetRef.current;
        const curPage = currentPageRef.current;
        const totPages = totalPagesRef.current;
        const curChIdx = currentChapterIdxRef.current;
        const pageRatio = totPages > 0 ? curPage / totPages : 0;
        const percentage = Number(((curOffset / totalChars) * 100).toFixed(2));
        syncProgress(bookId, curOffset, percentage, true, {
          chapter_index: curChIdx,
          page_index: curPage,
          page_ratio: pageRatio,
          total_pages: totPages,
        });
      }
    };

    document.addEventListener("visibilitychange", handleSyncOnClose);
    window.addEventListener("pagehide", handleSyncOnClose);
    window.addEventListener("beforeunload", handleSyncOnClose);

    return () => {
      document.removeEventListener("visibilitychange", handleSyncOnClose);
      window.removeEventListener("pagehide", handleSyncOnClose);
      window.removeEventListener("beforeunload", handleSyncOnClose);
    };
  }, [bookId, totalChars]);

  // 翻頁導航方法
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((p) => p + 1);
    } else if (currentChapterIdx < chapters.length - 1) {
      pendingPageRef.current = "first";
      isRestoringProgress.current = false;
      const nextIdx = currentChapterIdx + 1;
      setCurrentChapterIdx(nextIdx);
      notifyChapterSwitch(nextIdx);
    }
  }, [currentPage, totalPages, currentChapterIdx, chapters.length, notifyChapterSwitch, setCurrentChapterIdx]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
    } else if (currentChapterIdx > 0) {
      pendingPageRef.current = "last";
      isRestoringProgress.current = false;
      const prevIdx = currentChapterIdx - 1;
      setCurrentChapterIdx(prevIdx);
      notifyChapterSwitch(prevIdx);
    }
  }, [currentPage, currentChapterIdx, notifyChapterSwitch, setCurrentChapterIdx]);

  const goToNextChapter = useCallback(() => {
    if (currentChapterIdx < chapters.length - 1) {
      pendingPageRef.current = "first";
      isRestoringProgress.current = false;
      const nextIdx = currentChapterIdx + 1;
      setCurrentChapterIdx(nextIdx);
      notifyChapterSwitch(nextIdx);
    }
  }, [currentChapterIdx, chapters.length, notifyChapterSwitch, setCurrentChapterIdx]);

  const goToPrevChapter = useCallback(() => {
    if (currentChapterIdx > 0) {
      pendingPageRef.current = "first";
      isRestoringProgress.current = false;
      const prevIdx = currentChapterIdx - 1;
      setCurrentChapterIdx(prevIdx);
      notifyChapterSwitch(prevIdx);
    }
  }, [currentChapterIdx, notifyChapterSwitch, setCurrentChapterIdx]);

  const goToFirstPage = useCallback(() => {
    pendingPageRef.current = "first";
    isRestoringProgress.current = false;
    setCurrentChapterIdx(0);
    notifyChapterSwitch(0);
  }, [notifyChapterSwitch, setCurrentChapterIdx]);

  const goToLastPage = useCallback(() => {
    if (chapters.length > 0) {
      const lastIdx = chapters.length - 1;
      pendingPageRef.current = "last";
      isRestoringProgress.current = false;
      setCurrentChapterIdx(lastIdx);
      notifyChapterSwitch(lastIdx);
    }
  }, [chapters.length, notifyChapterSwitch, setCurrentChapterIdx]);

  const jumpToChapter = useCallback(
    (chapter: Chapter) => {
      if (chapter.index === currentChapterIdx) {
        setCurrentPage(0);
      } else {
        pendingPageRef.current = "first";
        isRestoringProgress.current = false;
        setCurrentChapterIdx(chapter.index);
      }
    },
    [currentChapterIdx, setCurrentChapterIdx]
  );

  // 連續滾動事件處理
  const handleContinuousScroll = useCallback(() => {
    onActivity?.();
    if (!scrollContainerRef.current || !currentChapter) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    if (scrollHeight <= clientHeight) return;
    const ratio = scrollTop / (scrollHeight - clientHeight);
    const chStart = currentChapter.charOffset;
    const chLen = currentChapter.length || 0;
    const offset = Math.round(chStart + ratio * chLen);
    setCurrentOffset(offset);

    syncProgress(
      bookId,
      offset,
      Number(((offset / (totalChars || 1)) * 100).toFixed(1)),
      false,
      {
        chapter_index: currentChapterIdx,
      }
    );
  }, [bookId, currentChapter, currentChapterIdx, totalChars, onActivity]);

  // 跳轉至指定 offset 與章節
  const jumpToOffset = useCallback(
    (targetOffset: number, targetChapterIdx: number) => {
      pendingTargetOffset.current = targetOffset;
      if (targetChapterIdx === currentChapterIdx) {
        measurePagination();
      } else {
        setCurrentChapterIdx(targetChapterIdx);
      }
    },
    [currentChapterIdx, measurePagination, setCurrentChapterIdx]
  );

  // 滑桿拖曳時的目標預覽資訊
  const scrubTargetInfo = useMemo(() => {
    if (!isScrubbing || !totalChars) return null;
    if (scrubberMode === "chapter") {
      return {
        title: processedChapterTitle,
        subtitle: `第 ${scrubPage + 1} / ${totalPages} 頁`,
      };
    }
    const targetOffset = Math.round((scrubBookPercentage / 100) * totalChars);
    const chIdx = findCurrentChapter(chapters, targetOffset);
    const chTitle = chapters[chIdx]?.title || "正文";
    return {
      title: chTitle,
      subtitle: `${scrubBookPercentage.toFixed(1)}% (${targetOffset.toLocaleString()} 字)`,
    };
  }, [
    isScrubbing,
    scrubberMode,
    scrubPage,
    totalPages,
    processedChapterTitle,
    scrubBookPercentage,
    totalChars,
    chapters,
  ]);

  return {
    currentPage,
    setCurrentPage,
    totalPages,
    setTotalPages,
    currentOffset,
    setCurrentOffset,
    viewportWidth,
    chapterSwitchToast,
    scrubberMode,
    setScrubberMode,
    scrubBookPercentage,
    setScrubBookPercentage,
    isScrubbing,
    setIsScrubbing,
    scrubPage,
    setScrubPage,
    conflictPrompt,
    setConflictPrompt,
    viewportRef,
    contentRef,
    readerMainRef,
    scrollContainerRef,
    activeChapterBtnRef,
    pendingPageRef,
    pendingTargetOffset,
    pendingTargetPageRatio,
    pendingTargetPageIndex,
    pendingTargetTotalPages,
    isRestoringProgress,
    measurePagination,
    goToNextPage,
    goToPrevPage,
    goToNextChapter,
    goToPrevChapter,
    goToFirstPage,
    goToLastPage,
    jumpToChapter,
    handleContinuousScroll,
    jumpToOffset,
    scrubTargetInfo,
  };
}
