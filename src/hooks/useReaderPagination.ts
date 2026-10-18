/**
 * @file useReaderPagination.ts
 * @description 閱讀器分頁演算法、視窗尺寸響應、進度同步與導航管理 Hook
 */

import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { Chapter, findCurrentChapter } from "@/lib/parser";
import {
  syncProgress,
  flushPendingProgress,
  beaconPendingProgress,
  onBeforeBackgroundSync,
  type ProgressExtra,
} from "@/lib/sync";
import { ScrubberMode } from "@/types/reader";

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
  isContentReady?: boolean;
  readMode?: string;
}

export interface RestoreTarget {
  offset: number;
  chapterIndex?: number;
  pageIndex?: number;
  pageRatio?: number;
  totalPages?: number;
}

interface PositionSnapshot {
  key: string;
  chIdx: number;
  offset: number;
  extra: ProgressExtra;
}

const CONTINUOUS_MAX_RETRY_FRAMES = 120;
const SCROLL_REPORT_THROTTLE_MS = 250;

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
  isContentReady = true,
  readMode = "paginated",
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
  const [layoutTick, setLayoutTick] = useState(0);

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
  const bookIdRef = useRef(bookId);
  bookIdRef.current = bookId;
  const totalCharsRef = useRef(totalChars);
  totalCharsRef.current = totalChars;

  const hasRestoredRef = useRef(false);
  const lastReportedKeyRef = useRef<string | null>(null);
  const lastReportedChapterRef = useRef<number | null>(null);
  const continuousRetryRef = useRef(0);
  const programmaticScrollRef = useRef<{ top: number; until: number } | null>(null);
  const scrollReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevReadModeRef = useRef(readMode);

  const hasPendingNavigation = () =>
    pendingPageRef.current !== null ||
    pendingTargetOffset.current !== null ||
    pendingTargetPageIndex.current !== null ||
    pendingTargetPageRatio.current !== null;

  const clearPendingTargets = () => {
    pendingPageRef.current = null;
    pendingTargetOffset.current = null;
    pendingTargetPageIndex.current = null;
    pendingTargetPageRatio.current = null;
    pendingTargetTotalPages.current = null;
  };

  const markBaseline = (key: string, chIdx: number) => {
    lastReportedKeyRef.current = key;
    lastReportedChapterRef.current = chIdx;
  };

  useEffect(() => {
    hasRestoredRef.current = false;
    lastReportedKeyRef.current = null;
    lastReportedChapterRef.current = null;
  }, [bookId]);

  const computePosition = useCallback((): PositionSnapshot | null => {
    const chapter = currentChapterRef.current;
    const total = totalCharsRef.current;
    if (!chapter || !total) return null;
    const chIdx = currentChapterIdxRef.current;
    const chStart = chapter.charOffset;
    const chLen = chapter.length || 0;
    const scrollEl = scrollContainerRef.current;

    if (!viewportRef.current && scrollEl) {
      const range = scrollEl.scrollHeight - scrollEl.clientHeight;
      const ratio = range > 0 ? Math.min(1, Math.max(0, scrollEl.scrollTop / range)) : 0;
      const offset = Math.min(total, Math.round(chStart + ratio * chLen));
      return { key: `${chIdx}:s${offset}`, chIdx, offset, extra: { chapter_index: chIdx } };
    }

    const page = currentPageRef.current;
    const pages = totalPagesRef.current;
    if (pages <= 0) return null;
    const pageRatio = page / pages;
    const offset = Math.min(total, Math.round(chStart + pageRatio * chLen));
    return {
      key: `${chIdx}:${page}/${pages}`,
      chIdx,
      offset,
      extra: { chapter_index: chIdx, page_index: page, page_ratio: pageRatio, total_pages: pages },
    };
  }, []);

  const reportPosition = useCallback(() => {
    const pos = computePosition();
    if (!pos) return;
    setCurrentOffset(pos.offset);
    if (!hasRestoredRef.current || hasPendingNavigation()) return;
    if (pos.key === lastReportedKeyRef.current) return;

    const chapterChanged =
      lastReportedChapterRef.current !== null && lastReportedChapterRef.current !== pos.chIdx;
    markBaseline(pos.key, pos.chIdx);
    const percentage = Number(((pos.offset / totalCharsRef.current) * 100).toFixed(2));
    syncProgress(bookIdRef.current, pos.offset, percentage, chapterChanged, pos.extra);
  }, [computePosition]);

  const notifyChapterSwitch = useCallback(
    (targetIdx: number) => {
      if (chapters[targetIdx]) {
        const nextTitle = chapters[targetIdx].title;
        setChapterSwitchToast(`切換至：${nextTitle}`);
        setTimeout(() => setChapterSwitchToast(null), 2200);
      }
    },
    [chapters]
  );

  const applyContinuousScrollTarget = useCallback(() => {
    const scrollEl = scrollContainerRef.current;
    const chapter = currentChapterRef.current;
    if (!scrollEl || !chapter) return false;
    const range = scrollEl.scrollHeight - scrollEl.clientHeight;
    if (range <= 0) {
      // 若章節極短無須捲動，直接完成還原
      if (scrollEl.clientHeight > 0) {
        const wasRestoring = isRestoringProgress.current;
        clearPendingTargets();
        isRestoringProgress.current = false;
        const pos = computePosition();
        if (pos) {
          setCurrentOffset(pos.offset);
          markBaseline(pos.key, pos.chIdx);
        }
        if (wasRestoring) {
          hasRestoredRef.current = true;
        }
        return true;
      }
      return false;
    }

    let targetTop: number | null = null;
    if (pendingPageRef.current === "last") {
      targetTop = range;
    } else if (pendingPageRef.current === "first") {
      targetTop = 0;
    } else if (pendingTargetOffset.current !== null) {
      const relOffset = Math.max(0, pendingTargetOffset.current - chapter.charOffset);
      const chLen = chapter.length || 1;
      const ratio = Math.min(1, Math.max(0, relOffset / chLen));
      targetTop = Math.round(ratio * range);
    } else if (pendingTargetPageRatio.current !== null) {
      targetTop = Math.round(pendingTargetPageRatio.current * range);
    }

    if (targetTop !== null) {
      programmaticScrollRef.current = { top: targetTop, until: Date.now() + 350 };
      scrollEl.scrollTop = targetTop;
      const wasRestoring = isRestoringProgress.current;
      clearPendingTargets();
      isRestoringProgress.current = false;
      const pos = computePosition();
      if (pos) {
        setCurrentOffset(pos.offset);
        markBaseline(pos.key, pos.chIdx);
      }
      if (wasRestoring) {
        hasRestoredRef.current = true;
      }
      return true;
    }
    return false;
  }, [computePosition]);

  const measurePagination = useCallback(() => {
    if (!viewportRef.current && scrollContainerRef.current) {
      if (hasPendingNavigation()) {
        const applied = applyContinuousScrollTarget();
        if (!applied && continuousRetryRef.current < CONTINUOUS_MAX_RETRY_FRAMES) {
          continuousRetryRef.current++;
          requestAnimationFrame(() => measurePagination());
        } else {
          continuousRetryRef.current = 0;
        }
      }
      return;
    }

    if (!viewportRef.current || !contentRef.current) return;

    const vWidth = viewportRef.current.clientWidth;
    if (vWidth <= 0) return;
    setViewportWidth(vWidth);

    contentRef.current.style.width = `${vWidth}px`;
    contentRef.current.style.columnWidth = `${vWidth}px`;
    contentRef.current.style.columnGap = `${columnGap}px`;
    contentRef.current.style.columnFill = "auto";

    const scrollW = contentRef.current.scrollWidth;
    const totalCols = Math.max(1, Math.round((scrollW + columnGap) / (vWidth + columnGap)));
    setTotalPages(totalCols);

    const chapter = currentChapterRef.current;
    const chapterHasMultiplePagesLikely =
      (chapter?.length || 0) > 350 || processedParagraphs.length > 2;

    if (pendingPageRef.current === "last") {
      if (totalCols <= 1 && chapterHasMultiplePagesLikely) {
        requestAnimationFrame(() => measurePagination());
        return;
      }
      setCurrentPage(totalCols - 1);
      clearPendingTargets();
      isRestoringProgress.current = false;
      setLayoutTick((t) => t + 1);
      return;
    }

    if (pendingPageRef.current === "first") {
      setCurrentPage(0);
      clearPendingTargets();
      isRestoringProgress.current = false;
      setLayoutTick((t) => t + 1);
      return;
    }

    if (
      pendingTargetPageRatio.current !== null ||
      pendingTargetPageIndex.current !== null ||
      pendingTargetOffset.current !== null
    ) {
      const isTargetNonZero =
        (pendingTargetPageIndex.current !== null && pendingTargetPageIndex.current > 0) ||
        (pendingTargetPageRatio.current !== null && pendingTargetPageRatio.current > 0.05) ||
        (pendingTargetOffset.current !== null &&
          chapter &&
          pendingTargetOffset.current > chapter.charOffset + 300);

      if (totalCols <= 1 && chapterHasMultiplePagesLikely && isTargetNonZero) {
        requestAnimationFrame(() => measurePagination());
        return;
      }

      let targetP = 0;
      const relOffset =
        pendingTargetOffset.current !== null && chapter
          ? Math.max(0, pendingTargetOffset.current - chapter.charOffset)
          : 0;
      const chLen = chapter?.length || 1;

      if (
        pendingTargetPageIndex.current !== null &&
        pendingTargetPageIndex.current > 0
      ) {
        if (
          pendingTargetTotalPages.current &&
          pendingTargetTotalPages.current > 0 &&
          pendingTargetTotalPages.current !== totalCols
        ) {
          const ratio = pendingTargetPageIndex.current / pendingTargetTotalPages.current;
          targetP = Math.min(totalCols - 1, Math.max(0, Math.floor(ratio * totalCols)));
        } else {
          targetP = Math.min(totalCols - 1, Math.max(0, pendingTargetPageIndex.current));
        }
      } else if (pendingTargetOffset.current !== null && chapter && relOffset > 300) {
        const ratio = Math.min(1, Math.max(0, relOffset / chLen));
        targetP = Math.min(totalCols - 1, Math.max(0, Math.floor(ratio * totalCols + 1e-4)));
      } else if (pendingTargetPageIndex.current !== null && pendingTargetPageIndex.current >= 0) {
        targetP = Math.min(totalCols - 1, Math.max(0, pendingTargetPageIndex.current));
      } else if (pendingTargetPageRatio.current !== null && pendingTargetPageRatio.current >= 0) {
        targetP = Math.min(
          totalCols - 1,
          Math.max(0, Math.floor(pendingTargetPageRatio.current * totalCols))
        );
      } else if (pendingTargetOffset.current !== null && chapter) {
        const ratio = Math.min(1, Math.max(0, relOffset / chLen));
        targetP = Math.min(totalCols - 1, Math.max(0, Math.floor(ratio * totalCols + 1e-4)));
      }

      setCurrentPage(targetP);
      if (vWidth > 0 && contentRef.current) {
        contentRef.current.style.transition = "none";
        contentRef.current.style.transform = `translateX(-${targetP * (vWidth + columnGap)}px)`;
        void contentRef.current.offsetWidth;
      }

      const wasRestoring = isRestoringProgress.current;
      clearPendingTargets();
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.style.transition = "";
        }
        isRestoringProgress.current = false;
      }, 300);

      const chIdx = currentChapterIdxRef.current;
      const baseKey = `${chIdx}:${targetP}/${totalCols}`;
      markBaseline(baseKey, chIdx);
      if (wasRestoring) {
        hasRestoredRef.current = true;
      }
      setLayoutTick((t) => t + 1);
    } else {
      setCurrentPage((prev) => Math.min(prev, totalCols - 1));
      setLayoutTick((t) => t + 1);
    }
  }, [columnGap, processedParagraphs.length, applyContinuousScrollTarget]);

  useLayoutEffect(() => {
    continuousRetryRef.current = 0;
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
    isContentReady,
    readMode,
    measurePagination,
  ]);

  useEffect(() => {
    if (prevReadModeRef.current !== readMode) {
      prevReadModeRef.current = readMode;
      if (currentOffsetRef.current > 0) {
        pendingTargetOffset.current = currentOffsetRef.current;
        isRestoringProgress.current = true;
        measurePagination();
      }
    }
  }, [readMode, measurePagination]);

  useEffect(() => {
    const el = viewportRef.current || scrollContainerRef.current;
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
  }, [measurePagination, isContentReady, readMode]);

  useEffect(() => {
    reportPosition();
  }, [currentPage, totalPages, currentChapterIdx, layoutTick, reportPosition]);

  useEffect(() => {
    return onBeforeBackgroundSync(() => {
      if (scrollReportTimerRef.current) {
        clearTimeout(scrollReportTimerRef.current);
        scrollReportTimerRef.current = null;
      }
      const pos = computePosition();
      if (!pos || !hasRestoredRef.current) return;
      if (pos.key !== lastReportedKeyRef.current) {
        markBaseline(pos.key, pos.chIdx);
        const percentage = Number(((pos.offset / totalCharsRef.current) * 100).toFixed(2));
        syncProgress(bookIdRef.current, pos.offset, percentage, false, pos.extra);
      }
    });
  }, [computePosition]);

  useEffect(() => {
    return () => {
      if (scrollReportTimerRef.current) {
        clearTimeout(scrollReportTimerRef.current);
      }
      beaconPendingProgress();
      flushPendingProgress().catch(() => {});
    };
  }, []);

  const restoreProgress = useCallback(
    (target: RestoreTarget) => {
      isRestoringProgress.current = true;
      hasRestoredRef.current = false;
      pendingTargetOffset.current = target.offset;
      pendingTargetPageIndex.current = target.pageIndex ?? null;
      pendingTargetPageRatio.current = target.pageRatio ?? null;
      pendingTargetTotalPages.current = target.totalPages ?? null;

      const targetChIdx =
        typeof target.chapterIndex === "number" && target.chapterIndex >= 0
          ? target.chapterIndex
          : findCurrentChapter(chapters, target.offset);

      setCurrentChapterIdx(targetChIdx);
      setCurrentOffset(target.offset);
      measurePagination();
    },
    [chapters, measurePagination, setCurrentChapterIdx]
  );

  const syncCurrentProgressToServer = useCallback(() => {
    flushPendingProgress().catch(console.warn);
  }, []);

  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      isRestoringProgress.current = false;
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
      isRestoringProgress.current = false;
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

  const jumpToChapter = useCallback(
    (chapter: Chapter) => {
      if (chapter.index === currentChapterIdx) {
        isRestoringProgress.current = false;
        setCurrentPage(0);
      } else {
        pendingPageRef.current = "first";
        isRestoringProgress.current = false;
        setCurrentChapterIdx(chapter.index);
      }
    },
    [currentChapterIdx, setCurrentChapterIdx]
  );

  const handleContinuousScroll = useCallback(() => {
    onActivity?.();
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl || !currentChapterRef.current) return;

    if (programmaticScrollRef.current) {
      if (Date.now() < programmaticScrollRef.current.until) {
        return;
      }
      programmaticScrollRef.current = null;
    }

    if (scrollReportTimerRef.current) return;
    scrollReportTimerRef.current = setTimeout(() => {
      scrollReportTimerRef.current = null;
      reportPosition();
    }, SCROLL_REPORT_THROTTLE_MS);
  }, [onActivity, reportPosition]);

  const jumpToOffset = useCallback(
    (targetOffset: number, targetChapterIdx: number) => {
      isRestoringProgress.current = false;
      pendingTargetOffset.current = targetOffset;
      if (targetChapterIdx === currentChapterIdx) {
        measurePagination();
      } else {
        setCurrentChapterIdx(targetChapterIdx);
      }
    },
    [currentChapterIdx, measurePagination, setCurrentChapterIdx]
  );

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
    viewportRef,
    contentRef,
    readerMainRef,
    scrollContainerRef,
    activeChapterBtnRef,
    restoreProgress,
    goToNextPage,
    goToPrevPage,
    goToNextChapter,
    goToPrevChapter,
    jumpToChapter,
    handleContinuousScroll,
    jumpToOffset,
    syncCurrentProgressToServer,
    scrubTargetInfo,
  };
}
