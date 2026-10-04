/**
 * @file useReaderPagination.ts
 * @description 閱讀器分頁演算法、視窗尺寸響應、跨裝置進度同步與導航管理 Hook
 *
 * 進度回報原則：
 * - 只有「使用者真的移動位置」（翻頁、切章、跳轉、捲動）才呼叫 syncProgress 產生新時間戳
 * - 開書還原、套用雲端進度、旋轉/縮放/字級/全螢幕等版面重算，只更新「基準位置」，不產生新時間戳，
 *   否則閒置裝置一回前景就會用舊位置蓋掉其他裝置較新的進度
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
  /** 內容 DOM 是否已掛載（載入中為 false）；切換時需重新量測並重新掛 ResizeObserver */
  isContentReady?: boolean;
  /** 閱讀模式；切換時以目前 offset 還原位置 */
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
  /** 量測完成後強制觸發一次位置回報（即使 page/totalPages 數值沒變） */
  const [layoutTick, setLayoutTick] = useState(0);

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
  /** true 代表目前 pending 目標是「還原」（開書/套用雲端/切模式），結果只當基準、不上傳 */
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
  const isContentReadyRef = useRef(isContentReady);
  isContentReadyRef.current = isContentReady;

  /** 開書還原完成前絕不回報（避免以第 0 章第 0 頁蓋掉進度） */
  const hasRestoredRef = useRef(false);
  /** 最後一次「已回報或視為基準」的位置 key，相同就不重複產生時間戳 */
  const lastReportedKeyRef = useRef<string | null>(null);
  const lastReportedChapterRef = useRef<number | null>(null);
  const continuousRetryRef = useRef(0);
  const programmaticScrollRef = useRef<{ top: number; until: number } | null>(null);
  const scrollReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevLayoutChapterIdxRef = useRef(currentChapterIdx);
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

  // 換書時重置回報狀態
  useEffect(() => {
    hasRestoredRef.current = false;
    lastReportedKeyRef.current = null;
    lastReportedChapterRef.current = null;
  }, [bookId]);

  /** 由目前 DOM / state ref 計算位置（連續捲動用 scroll 比例，分頁用頁碼比例） */
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

  /** 回報目前位置：只有與上次基準不同、且開書還原已完成時才產生新時間戳 */
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

  // 連續滾動容器的位置還原與重新定位
  const applyContinuousScrollTarget = useCallback(() => {
    const scrollEl = scrollContainerRef.current;
    const chapter = currentChapterRef.current;
    if (!scrollEl || !chapter) return false;
    const range = scrollEl.scrollHeight - scrollEl.clientHeight;
    if (range <= 0) return false;

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

  // 多欄分頁核心重算演算法
  const measurePagination = useCallback(() => {
    // 連續滾動模式
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

  // 排版、章節、字體或內容載入完成時重新計算分頁
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

  // 閱讀模式或章節切換的追蹤
  useEffect(() => {
    if (prevLayoutChapterIdxRef.current !== currentChapterIdx) {
      prevLayoutChapterIdxRef.current = currentChapterIdx;
    }
    if (prevReadModeRef.current !== readMode) {
      prevReadModeRef.current = readMode;
      // 切換閱讀模式時保留當前 offset 重新定位
      if (currentOffsetRef.current > 0) {
        pendingTargetOffset.current = currentOffsetRef.current;
        isRestoringProgress.current = true;
        measurePagination();
      }
    }
  }, [currentChapterIdx, readMode, measurePagination]);

  // ResizeObserver 監聽視窗或旋轉螢幕，按閱讀比例保留位置
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

  // 翻頁或佈局完成後的位置計算與回報
  useEffect(() => {
    reportPosition();
  }, [currentPage, totalPages, currentChapterIdx, layoutTick, reportPosition]);

  // 註冊退到背景前的同步鉤子：強制確認最新進度已排入待發佇列
  useEffect(() => {
    return onBeforeBackgroundSync(() => {
      // 若連續滾動有節流中的回報，立刻結清
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

  // 組件卸載時，確保待同步佇列立即送出
  useEffect(() => {
    return () => {
      if (scrollReportTimerRef.current) {
        clearTimeout(scrollReportTimerRef.current);
      }
      beaconPendingProgress();
      flushPendingProgress().catch(() => {});
    };
  }, []);

  // 專門用於「開書初始化」或「接收雲端進度衝突」的還原函式
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

  // 主動觸發進度雲端同步（用於返回書架、跳轉等重要節點，不重新產生時間戳）
  const syncCurrentProgressToServer = useCallback(() => {
    flushPendingProgress().catch(console.warn);
  }, []);

  // 翻頁導航方法（使用者操作，主動設定 isRestoringProgress = false）
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

  // 連續滾動事件處理（節流回報，避免高頻觸發）
  const handleContinuousScroll = useCallback(() => {
    onActivity?.();
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl || !currentChapterRef.current) return;

    // 略過程式碼定位觸發的 scroll
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

  // 跳轉至指定 offset 與章節
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
    restoreProgress,
    goToNextPage,
    goToPrevPage,
    goToNextChapter,
    goToPrevChapter,
    goToFirstPage,
    goToLastPage,
    jumpToChapter,
    handleContinuousScroll,
    jumpToOffset,
    syncCurrentProgressToServer,
    scrubTargetInfo,
  };
}
