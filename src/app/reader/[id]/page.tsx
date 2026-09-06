"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  List,
  Sliders,
  Sun,
  Moon,
  Sparkles,
  BookMarked,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  MousePointerClick,
  ChevronFirst,
  ChevronLast,
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  BookmarkPlus,
  Bookmark,
  Search,
  Check,
  Trash2,
} from "lucide-react";
import { LocalStore } from "@/lib/idb";
import { Bookmark as BookmarkType } from "@/lib/db";
import { extractChapters, Chapter, findCurrentChapter } from "@/lib/parser";
import { syncProgress } from "@/lib/sync";
import { convertToTraditional, convertToSimplified } from "@/lib/chinese";
import { GestureAction, GestureConfig } from "@/lib/gesture/types";
import { DEFAULT_GESTURE_CONFIG, loadGestureConfig } from "@/lib/gesture/defaultGestures";
import { useMouseGesture } from "@/hooks/useMouseGesture";
import { useTouchGesture } from "@/hooks/useTouchGesture";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useTTS } from "@/hooks/useTTS";
import { GestureOverlay } from "@/components/gesture/GestureOverlay";
import { GestureSettingsModal } from "@/components/gesture/GestureSettingsModal";

const THEMES = [
  { id: "parchment", name: "羊皮紙", bg: "#fbf6ec", text: "#2c241d" },
  { id: "dark", name: "深色", bg: "#141416", text: "#d6d6dc" },
  { id: "oled", name: "純黑", bg: "#000000", text: "#c8c8cf" },
  { id: "eyecare", name: "護眼綠", bg: "#dcebd9", text: "#1e3321" },
  { id: "light", name: "極簡白", bg: "#fafafa", text: "#18181b" },
];

const FONT_FAMILIES = [
  { id: "serif", name: "宋體 / 明體", className: "font-serif-novel" },
  { id: "sans", name: "黑體", className: "font-sans-novel" },
  { id: "kaiti", name: "楷體", className: "font-kaiti-novel" },
];

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = (params?.id as string) || "";

  // Content state
  const [title, setTitle] = useState("載入中...");
  const [fullText, setFullText] = useState("");
  const [totalChars, setTotalChars] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Settings state
  const [theme, setTheme] = useState("parchment");
  const [fontSize, setFontSize] = useState(19);
  const [lineHeight, setLineHeight] = useState(1.85);
  const [fontFamily, setFontFamily] = useState("serif");
  const [maxWidthMode, setMaxWidthMode] = useState<"narrow" | "normal" | "wide">("normal");
  const [clickDirection, setClickDirection] = useState<"standard" | "inverted">("standard");
  const [chineseVariant, setChineseVariant] = useState<"original" | "traditional" | "simplified">("original");
  const [readMode, setReadMode] = useState<"paginated" | "continuous">("paginated");

  // UI state
  const [showToolbar, setShowToolbar] = useState(true);
  const [showTOC, setShowTOC] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeDrawerTab, setActiveDrawerTab] = useState<"chapters" | "bookmarks">("chapters");
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{
      chapterIndex: number;
      chapterTitle: string;
      charOffset: number;
      snippetBefore: string;
      matchText: string;
      snippetAfter: string;
    }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showTTSPlayer, setShowTTSPlayer] = useState(false);
  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);

  // Gesture state
  const [gestureConfig, setGestureConfig] = useState<GestureConfig>(DEFAULT_GESTURE_CONFIG);
  const [showGestureModal, setShowGestureModal] = useState(false);

  // Conflict state
  const [conflictPrompt, setConflictPrompt] = useState<{
    serverOffset: number;
    serverPercentage: number;
    deviceName: string;
  } | null>(null);

  // Viewport & column measurement refs
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const readerMainRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const pendingPageRef = useRef<"first" | "last" | null>(null);
  const pendingTargetOffset = useRef<number | null>(null);
  const pendingTargetPageRatio = useRef<number | null>(null);
  const pendingTargetPageIndex = useRef<number | null>(null);
  const isRestoringProgress = useRef<boolean>(true);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;
  const lastDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const measurePaginationRef = useRef<() => void>(() => {});
  const activeChapterBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastTouchActionTime = useRef<number>(0);

  // Scrubber state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPage, setScrubPage] = useState(0);

  const updateReadMode = (mode: "paginated" | "continuous") => {
    setReadMode(mode);
    localStorage.setItem("novel_reader_read_mode", mode);
    onUserActivity();
  };

  const handleContinuousScroll = () => {
    onUserActivity();
    if (!scrollContainerRef.current || !currentChapter) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    if (scrollHeight <= clientHeight) return;
    const ratio = scrollTop / (scrollHeight - clientHeight);
    const chStart = currentChapter.charOffset;
    const chLen = currentChapter.length || 0;
    const offset = Math.round(chStart + ratio * chLen);
    setCurrentOffset(offset);

    // Debounced sync
    syncProgress(
      bookId,
      offset,
      Number(((offset / (totalChars || 1)) * 100).toFixed(1)),
      false,
      {
        chapter_index: currentChapterIdx,
      }
    );
  };

  // Smart Screen Wake Lock for mobile power efficiency
  const { onUserActivity } = useWakeLock({ enabled: !isLoading });

  // Web Speech API Text-to-Speech Hook
  const tts = useTTS({
    onParagraphChange: () => {
      onUserActivity();
    },
    onPageEnd: () => {
      if (currentPage < totalPages - 1) {
        goToNextPage();
      } else if (currentChapterIdx < chapters.length - 1) {
        goToNextChapter();
      } else {
        tts.stop();
      }
    },
  });

  const columnGap = 36; // px

  // Calculate reader layout max width class
  const maxWidthClass = useMemo(() => {
    switch (maxWidthMode) {
      case "narrow":
        return "max-w-xl";
      case "wide":
        return "max-w-4xl";
      default:
        return "max-w-2xl";
    }
  }, [maxWidthMode]);

  // Load preferences and book content
  useEffect(() => {
    if (!bookId) return;

    // Load reader preferences
    const savedTheme = localStorage.getItem("novel_reader_theme") || "parchment";
    const savedFontSize = Number(localStorage.getItem("novel_reader_font_size")) || 19;
    const savedLineHeight = Number(localStorage.getItem("novel_reader_line_height")) || 1.85;
    const savedFontFamily = localStorage.getItem("novel_reader_font_family") || "serif";
    const savedMaxWidth = (localStorage.getItem("novel_reader_max_width") as any) || "normal";
    const savedClickDirection =
      (localStorage.getItem("novel_reader_click_direction") as "standard" | "inverted") || "standard";
    const savedReadMode =
      (localStorage.getItem("novel_reader_read_mode") as "paginated" | "continuous") || "paginated";

    setTheme(savedTheme);
    setFontSize(savedFontSize);
    setLineHeight(savedLineHeight);
    setFontFamily(savedFontFamily);
    setMaxWidthMode(savedMaxWidth);
    setClickDirection(savedClickDirection);
    setReadMode(savedReadMode);
    document.documentElement.setAttribute("data-theme", savedTheme);
    setGestureConfig(loadGestureConfig());

    // 紀錄最後閱讀書籍 ID 供 PWA 開啟時無縫接軌
    localStorage.setItem("novel_reader_last_book_id", bookId);

    // Load book data
    loadBookData();
  }, [bookId]);

  const handleBackToShelf = () => {
    router.push("/?from=reader");
  };

  const loadBookData = async () => {
    setIsLoading(true);
    let bookText = "";
    let bookTitle = "未知小說";
    let bookChars = 0;

    // 1. 優先從本機 IndexedDB 快取讀取
    try {
      const cached = await LocalStore.getBookContent(bookId);
      if (
        cached &&
        cached.content &&
        (!cached.content.startsWith('{"') || !cached.content.includes('"success":false'))
      ) {
        bookText = cached.content;
        bookTitle = cached.title;
        bookChars = cached.total_chars;
      }
    } catch (e) {
      console.warn("IndexedDB read error:", e);
    }

    // 2. 若快取不存在，才發送網路請求向伺服器取得
    if (!bookText) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const [metaRes, contentRes] = await Promise.all([
          fetch(`/api/books/${bookId}`, { signal: controller.signal }),
          fetch(`/api/books/${bookId}/content`, { signal: controller.signal }),
        ]);
        clearTimeout(timeoutId);

        if (metaRes.ok && contentRes.ok) {
          const metaData = await metaRes.json();
          const rawContent = await contentRes.text();

          if (
            !rawContent ||
            (rawContent.startsWith('{"') && rawContent.includes('"success":false'))
          ) {
            throw new Error("取得小說內文格式異常");
          }

          bookText = rawContent;
          bookTitle = metaData.book?.title || "未命名小說";
          bookChars = bookText.length;

          // 寫入本機快取
          await LocalStore.saveBookContent(bookId, bookTitle, bookText, bookChars);
        } else {
          throw new Error("無法讀取小說資料");
        }
      } catch (err) {
        console.error(err);
        setIsOffline(true);
        if (typeof window !== "undefined") {
          localStorage.removeItem("novel_reader_last_book_id");
        }
        alert("無法載入小說，請確認網路連線或該書籍已快取至本機。");
        router.push("/?from=reader");
        return;
      }
    }

    setTitle(bookTitle);
    setFullText(bookText);
    setTotalChars(bookChars);

    // 解析章節
    const parsedChapters = extractChapters(bookText);
    setChapters(parsedChapters);

    // 載入書籤
    loadBookmarks(bookId);

    // 3. 取得本機閱讀進度並立刻完成畫面載入
    let targetOffset = 0;
    let targetChapterIdx = 0;
    let targetPageRatio: number | null = null;
    let targetPageIndex: number | null = null;

    const localProg = await LocalStore.getLocalProgress(bookId);
    if (localProg) {
      targetOffset = localProg.char_offset || 0;
      if (
        typeof localProg.chapter_index === "number" &&
        localProg.chapter_index >= 0
      ) {
        targetChapterIdx = localProg.chapter_index;
      } else {
        targetChapterIdx = findCurrentChapter(parsedChapters, targetOffset);
      }
      if (typeof localProg.page_ratio === "number") {
        targetPageRatio = localProg.page_ratio;
      }
      if (typeof localProg.page_index === "number") {
        targetPageIndex = localProg.page_index;
      }
    }

    pendingTargetPageIndex.current = targetPageIndex;
    pendingTargetPageRatio.current = targetPageRatio;
    pendingTargetOffset.current = targetOffset;
    isRestoringProgress.current = true;

    setCurrentChapterIdx(targetChapterIdx);
    setCurrentOffset(targetOffset);
    setIsLoading(false);

    // 4. 背景非阻塞檢查雲端進度衝突（不卡頓閱讀畫面）
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const progRes = await fetch(`/api/progress?bookId=${bookId}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (progRes.ok) {
        const progData = await progRes.json();
        if (progData.success && progData.progress) {
          const sProg = progData.progress;
          const sTime = new Date(sProg.updated_at).getTime();
          const lTime = localProg ? new Date(localProg.updated_at).getTime() : 0;

          if (sTime > lTime + 3000 && Math.abs(sProg.char_offset - targetOffset) > 300) {
            setConflictPrompt({
              serverOffset: sProg.char_offset,
              serverPercentage: sProg.percentage,
              deviceName: sProg.device_name || "其他裝置",
            });
          }
        }
      }
    } catch (e) {
      // 離線模式或超時忽略
    }
  };

  // Load bookmarks
  const loadBookmarks = async (targetBookId: string) => {
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
  };

  // Add bookmark
  const handleAddBookmark = async () => {
    onUserActivity();
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
  };

  // Delete bookmark
  const handleDeleteBookmark = async (e: React.MouseEvent, bmId: string) => {
    e.stopPropagation();
    onUserActivity();
    await LocalStore.deleteBookmark(bmId);
    setBookmarks((prev) => prev.filter((b) => b.id !== bmId));
    try {
      await fetch(`/api/bookmarks?id=${bmId}`, { method: "DELETE" });
    } catch (e) {
      console.warn("Failed to delete bookmark on server:", e);
    }
  };

  // Jump to bookmark
  const jumpToBookmark = (bm: BookmarkType) => {
    onUserActivity();
    const chIdx = findCurrentChapter(chapters, bm.char_offset);
    pendingTargetOffset.current = bm.char_offset;
    if (chIdx === currentChapterIdx) {
      measurePaginationRef.current();
    } else {
      setCurrentChapterIdx(chIdx);
    }
    setShowTOC(false);
  };

  // In-Book Full-Text Search
  const performSearch = (query: string) => {
    if (!query.trim() || !fullText) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const q = query.trim();
    const results: Array<{
      chapterIndex: number;
      chapterTitle: string;
      charOffset: number;
      snippetBefore: string;
      matchText: string;
      snippetAfter: string;
    }> = [];
    let pos = 0;
    const lowerFull = fullText.toLowerCase();
    const lowerQ = q.toLowerCase();

    while (results.length < 80) {
      const matchIdx = lowerFull.indexOf(lowerQ, pos);
      if (matchIdx === -1) break;

      const chIdx = findCurrentChapter(chapters, matchIdx);
      const chTitle = chapters[chIdx]?.title || "正文";
      const snippetStart = Math.max(0, matchIdx - 22);
      const snippetEnd = Math.min(fullText.length, matchIdx + q.length + 30);

      results.push({
        chapterIndex: chIdx,
        chapterTitle: chTitle,
        charOffset: matchIdx,
        snippetBefore: fullText.slice(snippetStart, matchIdx),
        matchText: fullText.slice(matchIdx, matchIdx + q.length),
        snippetAfter: fullText.slice(matchIdx + q.length, snippetEnd),
      });

      pos = matchIdx + Math.max(1, q.length);
    }
    setSearchResults(results);
    setIsSearching(false);
  };

  // Jump from search result
  const jumpToSearchResult = (result: { chapterIndex: number; charOffset: number }) => {
    onUserActivity();
    pendingTargetOffset.current = result.charOffset;
    if (result.chapterIndex === currentChapterIdx) {
      measurePaginationRef.current();
    } else {
      setCurrentChapterIdx(result.chapterIndex);
    }
    setShowSearchModal(false);
  };

  // Get current chapter text and paragraphs
  const currentChapter = useMemo(() => {
    return chapters[currentChapterIdx] || null;
  }, [chapters, currentChapterIdx]);

  const currentChapterRef = useRef(currentChapter);
  currentChapterRef.current = currentChapter;

  const currentChapterText = useMemo(() => {
    if (!fullText || !currentChapter) return "";
    const start = currentChapter.charOffset;
    const length = currentChapter.length || fullText.length - start;
    return fullText.slice(start, start + length);
  }, [fullText, currentChapter]);

  const currentChapterParagraphs = useMemo(() => {
    if (!currentChapterText) return [];
    return currentChapterText.split(/\r?\n/).filter((p) => p.trim().length > 0);
  }, [currentChapterText]);

  // On-the-fly Dynamic Traditional/Simplified Conversion
  const processedChapterTitle = useMemo(() => {
    if (!currentChapter?.title) return "正文";
    if (chineseVariant === "traditional") return convertToTraditional(currentChapter.title);
    if (chineseVariant === "simplified") return convertToSimplified(currentChapter.title);
    return currentChapter.title;
  }, [currentChapter?.title, chineseVariant]);

  const processedParagraphs = useMemo(() => {
    if (!currentChapterParagraphs || currentChapterParagraphs.length === 0) return [];
    if (chineseVariant === "traditional") {
      return currentChapterParagraphs.map((p) => convertToTraditional(p));
    }
    if (chineseVariant === "simplified") {
      return currentChapterParagraphs.map((p) => convertToSimplified(p));
    }
    return currentChapterParagraphs;
  }, [currentChapterParagraphs, chineseVariant]);

  // Recalculate multi-column pagination pages
  const measurePagination = useCallback(() => {
    if (!viewportRef.current || !contentRef.current) return;

    const vWidth = viewportRef.current.clientWidth;
    if (vWidth <= 0) return;
    setViewportWidth(vWidth);

    // Total content width computed by CSS columns
    const scrollW = contentRef.current.scrollWidth;
    const totalCols = Math.max(1, Math.round((scrollW + columnGap) / (vWidth + columnGap)));
    setTotalPages(totalCols);

    // Handle pending page navigation targets
    if (pendingPageRef.current === "last") {
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
      let targetP = 0;
      if (
        pendingTargetPageIndex.current !== null &&
        pendingTargetPageIndex.current >= 0
      ) {
        targetP = Math.min(
          totalCols - 1,
          Math.max(0, pendingTargetPageIndex.current)
        );
      } else if (
        pendingTargetPageRatio.current !== null &&
        pendingTargetPageRatio.current >= 0
      ) {
        targetP = Math.min(
          totalCols - 1,
          Math.max(0, Math.round(pendingTargetPageRatio.current * (totalCols - 1)))
        );
      } else if (pendingTargetOffset.current !== null && currentChapter) {
        const relOffset = Math.max(
          0,
          pendingTargetOffset.current - currentChapter.charOffset
        );
        const chLen = currentChapter.length || 1;
        const ratio = Math.min(1, Math.max(0, relOffset / chLen));
        targetP = Math.min(
          totalCols - 1,
          Math.max(0, Math.floor(ratio * totalCols + 1e-4))
        );
      }

      setCurrentPage(targetP);
      pendingTargetPageRatio.current = null;
      pendingTargetPageIndex.current = null;
      pendingTargetOffset.current = null;
      setTimeout(() => {
        isRestoringProgress.current = false;
      }, 200);
    } else {
      setCurrentPage((prev) => Math.min(prev, totalCols - 1));
    }
  }, [currentChapter, columnGap]);

  measurePaginationRef.current = measurePagination;

  // Measure after layout or chapter/style change
  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      measurePagination();
    }, 50);
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

  // Resize observer to handle window resizing & orientation change without drifting
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
      // 尺寸完全沒變時直接忽略，避免一般翻頁或非尺寸變更重新渲染時打亂頁數
      if (prev.width === newWidth && prev.height === newHeight) {
        return;
      }
      lastDimensionsRef.current = { width: newWidth, height: newHeight };

      // 視窗尺寸實際變更時（例如螢幕旋轉或視窗拉伸），按當前頁比例保留閱讀位置
      if (
        currentChapterRef.current &&
        totalPagesRef.current > 1 &&
        !isRestoringProgress.current
      ) {
        const curP = currentPageRef.current;
        const totP = totalPagesRef.current;
        pendingTargetPageRatio.current = curP / (totP - 1);
      }
      measurePagination();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [measurePagination]);

  // Update current character offset & sync progress on page change
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
    const calculatedOffset = Math.min(
      totalChars,
      Math.round(chStart + pageRatio * chLen)
    );

    setCurrentOffset(calculatedOffset);
    const percentage = Number(
      ((calculatedOffset / totalChars) * 100).toFixed(2)
    );
    syncProgress(bookId, calculatedOffset, percentage, false, {
      chapter_index: currentChapterIdx,
      page_index: currentPage,
      page_ratio: pageRatio,
      total_pages: totalPages,
    });
  }, [
    bookId,
    currentChapter,
    currentChapterIdx,
    currentPage,
    totalPages,
    totalChars,
  ]);

  // Page Navigation Methods
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((p) => p + 1);
    } else if (currentChapterIdx < chapters.length - 1) {
      pendingPageRef.current = "first";
      isRestoringProgress.current = false;
      setCurrentChapterIdx((idx) => idx + 1);
    }
  }, [currentPage, totalPages, currentChapterIdx, chapters.length]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
    } else if (currentChapterIdx > 0) {
      pendingPageRef.current = "last";
      isRestoringProgress.current = false;
      setCurrentChapterIdx((idx) => idx - 1);
    }
  }, [currentPage, currentChapterIdx]);

  const goToNextChapter = useCallback(() => {
    if (currentChapterIdx < chapters.length - 1) {
      pendingPageRef.current = "first";
      isRestoringProgress.current = false;
      setCurrentChapterIdx((idx) => idx + 1);
    }
  }, [currentChapterIdx, chapters.length]);

  const goToPrevChapter = useCallback(() => {
    if (currentChapterIdx > 0) {
      pendingPageRef.current = "first";
      isRestoringProgress.current = false;
      setCurrentChapterIdx((idx) => idx - 1);
    }
  }, [currentChapterIdx]);

  const goToFirstPage = useCallback(() => {
    pendingPageRef.current = "first";
    isRestoringProgress.current = false;
    setCurrentChapterIdx(0);
  }, []);

  const goToLastPage = useCallback(() => {
    if (chapters.length > 0) {
      pendingPageRef.current = "last";
      isRestoringProgress.current = false;
      setCurrentChapterIdx(chapters.length - 1);
    }
  }, [chapters.length]);

  // Jump to specific chapter from TOC
  const jumpToChapter = (chapter: Chapter) => {
    if (chapter.index === currentChapterIdx) {
      setCurrentPage(0);
    } else {
      pendingPageRef.current = "first";
      isRestoringProgress.current = false;
      setCurrentChapterIdx(chapter.index);
    }
    setShowTOC(false);
  };

  // Toggle Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.warn);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.warn);
      setIsFullscreen(false);
    }
  }, []);

  // Synchronize fullscreen state with browser Esc key or system exit
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Auto scroll TOC to active chapter when drawer opens
  useEffect(() => {
    if (showTOC && activeDrawerTab === "chapters") {
      const timer = setTimeout(() => {
        activeChapterBtnRef.current?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [showTOC, activeDrawerTab, currentChapterIdx]);

  // Preference updates
  const updateTheme = (newTheme: string) => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("novel_reader_theme", newTheme);
  };

  const cycleTheme = useCallback(() => {
    const themeOrder = ["parchment", "dark", "oled", "eyecare", "light"];
    setTheme((prevTheme) => {
      const nextIdx = (themeOrder.indexOf(prevTheme) + 1) % themeOrder.length;
      const nextTheme = themeOrder[nextIdx];
      document.documentElement.setAttribute("data-theme", nextTheme);
      localStorage.setItem("novel_reader_theme", nextTheme);
      return nextTheme;
    });
  }, []);

  const updateFontSize = useCallback((delta: number) => {
    setFontSize((prev) => {
      const next = Math.max(14, Math.min(32, prev + delta));
      localStorage.setItem("novel_reader_font_size", next.toString());
      return next;
    });
  }, []);

  const updateLineHeight = (val: number) => {
    setLineHeight(val);
    localStorage.setItem("novel_reader_line_height", val.toString());
  };

  const updateFontFamily = (val: string) => {
    setFontFamily(val);
    localStorage.setItem("novel_reader_font_family", val);
  };

  const updateMaxWidth = (val: "narrow" | "normal" | "wide") => {
    setMaxWidthMode(val);
    localStorage.setItem("novel_reader_max_width", val);
  };

  const updateClickDirection = (val: "standard" | "inverted") => {
    setClickDirection(val);
    localStorage.setItem("novel_reader_click_direction", val);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showTOC || showSettings || showGestureModal) return;

      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        goToNextPage();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPrevPage();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        goToPrevChapter();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        goToNextChapter();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    goToNextPage,
    goToPrevPage,
    goToNextChapter,
    goToPrevChapter,
    toggleFullscreen,
    showTOC,
    showSettings,
    showGestureModal,
  ]);

  // Page Visibility API & Pagehide listeners for reliable progress sync
  useEffect(() => {
    if (!bookId) return;

    const handleSyncOnClose = () => {
      if (totalChars > 0) {
        const percentage = Number(((currentOffset / totalChars) * 100).toFixed(2));
        syncProgress(bookId, currentOffset, percentage, true);
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
  }, [bookId, currentOffset, totalChars]);

  // Mouse Gestures Action Handler (Paginated Mode)
  const handleGestureAction = useCallback(
    (action: GestureAction) => {
      switch (action) {
        case "PREV_PAGE":
          goToPrevPage();
          break;
        case "NEXT_PAGE":
          goToNextPage();
          break;
        case "PREV_CHAPTER":
          goToPrevChapter();
          break;
        case "NEXT_CHAPTER":
          goToNextChapter();
          break;
        case "SCROLL_TOP":
          goToFirstPage();
          break;
        case "SCROLL_BOTTOM":
          goToLastPage();
          break;
        case "TOGGLE_TOC":
          setShowTOC((prev) => !prev);
          break;
        case "TOGGLE_SETTINGS":
          setShowSettings((prev) => !prev);
          break;
        case "BACK_TO_SHELF":
          handleBackToShelf();
          break;
        case "TOGGLE_FULLSCREEN":
          toggleFullscreen();
          break;
        case "TOGGLE_THEME":
          cycleTheme();
          break;
        case "FONT_INCREASE":
          updateFontSize(1);
          break;
        case "FONT_DECREASE":
          updateFontSize(-1);
          break;
      }
    },
    [
      goToPrevPage,
      goToNextPage,
      goToPrevChapter,
      goToNextChapter,
      goToFirstPage,
      goToLastPage,
      handleBackToShelf,
      toggleFullscreen,
      cycleTheme,
      updateFontSize,
    ]
  );

  // Mobile Touch Gestures (Swipe to turn page, Pinch to zoom font, Tap zones with haptic)
  useTouchGesture({
    elementRef: readerMainRef,
    onSwipeLeft: () => {
      lastTouchActionTime.current = Date.now();
      onUserActivity();
      clickDirection === "inverted" ? goToPrevPage() : goToNextPage();
    },
    onSwipeRight: () => {
      lastTouchActionTime.current = Date.now();
      onUserActivity();
      clickDirection === "inverted" ? goToNextPage() : goToPrevPage();
    },
    onPinchZoom: (delta) => {
      lastTouchActionTime.current = Date.now();
      onUserActivity();
      updateFontSize(delta);
    },
    onTap: (clientX) => {
      lastTouchActionTime.current = Date.now();
      onUserActivity();
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      const xRatio = clientX / window.innerWidth;
      if (xRatio < 0.28) {
        clickDirection === "inverted" ? goToNextPage() : goToPrevPage();
      } else if (xRatio > 0.72) {
        clickDirection === "inverted" ? goToPrevPage() : goToNextPage();
      } else {
        setShowToolbar((prev) => !prev);
      }
    },
    enabled: !isLoading,
  });

  const gestureState = useMouseGesture({
    config: gestureConfig,
    onAction: handleGestureAction,
  });

  // Current progress percentage
  const currentPercentage = useMemo(() => {
    if (!totalChars) return 0;
    return Number(((currentOffset / totalChars) * 100).toFixed(1));
  }, [currentOffset, totalChars]);

  // Current font class
  const currentFontClass = useMemo(() => {
    return FONT_FAMILIES.find((f) => f.id === fontFamily)?.className || "font-serif-novel";
  }, [fontFamily]);

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col select-text bg-[var(--bg-color)] text-[var(--text-color)]">
      {/* Top Floating Navigation Toolbar */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-transform duration-300 backdrop-blur-md bg-[var(--header-bg)] border-b border-[var(--border-color)] px-4 py-2.5 safe-area-top flex items-center justify-between shadow-sm ${
          showToolbar ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="flex items-center space-x-2 truncate pr-2">
          <button
            onClick={handleBackToShelf}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
            title="返回書架"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="truncate">
            <h1 className="text-sm font-bold truncate">{title}</h1>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {processedChapterTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={() => setShowSearchModal(true)}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
            title="書內全文檢索"
            aria-label="搜尋內文"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            onClick={handleAddBookmark}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
            title="加入書籤"
            aria-label="加入書籤"
          >
            <BookmarkPlus className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              setShowTTSPlayer((prev) => !prev);
              if (!showTTSPlayer && !tts.isPlaying) {
                tts.startReading(processedParagraphs, 0);
              }
            }}
            className={`p-2 rounded-xl transition-colors ${
              showTTSPlayer
                ? "bg-[var(--accent-color)] text-white shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)]"
            }`}
            title="語音朗讀 (TTS)"
            aria-label="語音朗讀"
          >
            <Volume2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowTOC(!showTOC)}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
            title="目錄與書籤"
          >
            <List className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
            title="閱讀偏好排版"
          >
            <Sliders className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowGestureModal(true)}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors hidden sm:block"
            title="滑鼠手勢設定"
          >
            <MousePointerClick className="w-5 h-5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors hidden sm:block"
            title="全螢幕閱讀"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Bookmark Added Toast */}
      {bookmarkToast && (
        <div className="fixed top-16 inset-x-0 mx-auto w-fit z-50 bg-[var(--accent-color)] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center space-x-1.5 animate-bounce-short">
          <Check className="w-4 h-4" />
          <span>{bookmarkToast}</span>
        </div>
      )}

      {/* Cloud Conflict Prompt Toast */}
      {conflictPrompt && (
        <div className="fixed top-16 inset-x-4 sm:inset-x-auto sm:right-6 z-50 max-w-md bg-[var(--card-bg)] border-2 border-[var(--accent-color)] rounded-2xl p-4 shadow-2xl animate-bounce-short">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-bold text-sm text-[var(--accent-color)] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> 偵測到來自「{conflictPrompt.deviceName}」的較新進度
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                雲端進度已讀至 {conflictPrompt.serverPercentage}%，是否立即跳轉同步？
              </p>
            </div>
            <button
              onClick={() => setConflictPrompt(null)}
              className="text-[var(--text-muted)] hover:text-[var(--text-color)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex justify-end space-x-2 mt-3 pt-2 border-t border-[var(--border-color)]">
            <button
              onClick={() => setConflictPrompt(null)}
              className="px-3 py-1.5 rounded-lg text-xs text-[var(--text-muted)] hover:bg-[var(--bg-color)]"
            >
              保留目前位置
            </button>
            <button
              onClick={() => {
                const sOffset = conflictPrompt.serverOffset;
                const newChIdx = findCurrentChapter(chapters, sOffset);
                setCurrentChapterIdx(newChIdx);
                pendingTargetOffset.current = sOffset;
                setConflictPrompt(null);
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90"
            >
              立刻跳轉同步
            </button>
          </div>
        </div>
      )}

      {/* Main Reading Viewport (Paginated vs Continuous Scroll) */}
      {readMode === "paginated" ? (
        <main
          ref={readerMainRef}
          onClick={(e) => {
            if (Date.now() - lastTouchActionTime.current < 450) return;
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0) return;
            const x = e.clientX;
            const w = window.innerWidth;
            const ratio = x / w;
            if (ratio < 0.28) {
              clickDirection === "inverted" ? goToNextPage() : goToPrevPage();
              onUserActivity();
            } else if (ratio > 0.72) {
              clickDirection === "inverted" ? goToPrevPage() : goToNextPage();
              onUserActivity();
            } else {
              setShowToolbar((prev) => !prev);
              onUserActivity();
            }
          }}
          className="flex-1 overflow-hidden relative flex flex-col justify-center px-4 sm:px-8 py-14 select-text cursor-default"
        >
          <div className={`mx-auto w-full h-full ${maxWidthClass} relative overflow-hidden`}>
            {isLoading ? (
              <div className="h-full flex flex-col items-center justify-center space-y-4 text-[var(--text-muted)]">
                <RefreshCw className="w-8 h-8 animate-spin" />
                <p className="text-sm">正在載入小說文本並初始化分頁排版...</p>
              </div>
            ) : (
              <div ref={viewportRef} className="w-full h-full relative overflow-hidden">
                <div
                  ref={contentRef}
                  className="h-full transition-transform duration-200 ease-out"
                  style={{
                    width: viewportWidth > 0 ? `${viewportWidth}px` : "100%",
                    columnWidth: viewportWidth > 0 ? `${viewportWidth}px` : "auto",
                    columnGap: `${columnGap}px`,
                    columnFill: "auto",
                    transform:
                      viewportWidth > 0
                        ? `translateX(-${currentPage * (viewportWidth + columnGap)}px)`
                        : "none",
                    fontSize: `${fontSize}px`,
                    lineHeight: lineHeight,
                    letterSpacing: "0.03em",
                  }}
                >
                  <article className={`select-text ${currentFontClass}`}>
                    {/* Chapter Header */}
                    <h2 className="text-xl sm:text-2xl font-bold mb-6 pb-3 border-b border-[var(--border-color)] text-[var(--text-color)]">
                      {processedChapterTitle}
                    </h2>

                    {/* Paragraphs */}
                    {processedParagraphs.map((para, i) => {
                      const isSpeakingThis = tts.isPlaying && tts.currentParagraphIdx === i;
                      return (
                        <p
                          key={i}
                          className={`novel-content-paragraph leading-relaxed mb-4 text-justify transition-all duration-200 rounded-lg ${
                            isSpeakingThis
                              ? "bg-[var(--accent-color)]/20 px-2 py-1 shadow-sm font-medium"
                              : ""
                          }`}
                          style={{ textIndent: isSpeakingThis ? "0" : "2em" }}
                        >
                          {isSpeakingThis && (
                            <Volume2 className="w-4 h-4 inline-block mr-1.5 text-[var(--accent-color)] animate-pulse align-middle" />
                          )}
                          {para}
                        </p>
                      );
                    })}

                    {/* End of book marker if on last chapter */}
                    {currentChapterIdx === chapters.length - 1 && (
                      <div className="py-12 text-center text-xs text-[var(--text-muted)] space-y-2 border-t border-[var(--border-color)] mt-8">
                        <p>—— 全文完 ——</p>
                        <p>總字數：{totalChars.toLocaleString()} 字</p>
                      </div>
                    )}
                  </article>
                </div>
              </div>
            )}
          </div>
        </main>
      ) : (
        /* Continuous Vertical Scroll Reading Viewport */
        <main
          ref={scrollContainerRef}
          onScroll={handleContinuousScroll}
          onClick={(e) => {
            const y = e.clientY;
            const h = window.innerHeight;
            if (y > h * 0.25 && y < h * 0.75) {
              setShowToolbar((prev) => !prev);
            }
          }}
          className="flex-1 overflow-y-auto px-4 sm:px-8 pt-16 pb-24 select-text"
        >
          <div className={`mx-auto w-full ${maxWidthClass}`}>
            {isLoading ? (
              <div className="py-32 flex flex-col items-center justify-center space-y-4 text-[var(--text-muted)]">
                <RefreshCw className="w-8 h-8 animate-spin" />
                <p className="text-sm">正在載入小說內容...</p>
              </div>
            ) : (
              <article
                className={`select-text ${currentFontClass}`}
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: lineHeight,
                  letterSpacing: "0.03em",
                }}
              >
                <h2 className="text-xl sm:text-2xl font-bold mb-6 pb-3 border-b border-[var(--border-color)] text-[var(--text-color)]">
                  {processedChapterTitle}
                </h2>

                {processedParagraphs.map((para, i) => {
                  const isSpeakingThis = tts.isPlaying && tts.currentParagraphIdx === i;
                  return (
                    <p
                      key={i}
                      className={`novel-content-paragraph leading-relaxed mb-4 text-justify transition-all duration-200 rounded-lg ${
                        isSpeakingThis
                          ? "bg-[var(--accent-color)]/20 px-2 py-1 shadow-sm font-medium"
                          : ""
                      }`}
                      style={{ textIndent: isSpeakingThis ? "0" : "2em" }}
                    >
                      {isSpeakingThis && (
                        <Volume2 className="w-4 h-4 inline-block mr-1.5 text-[var(--accent-color)] animate-pulse align-middle" />
                      )}
                      {para}
                    </p>
                  );
                })}

                {/* Chapter Navigation Buttons in Continuous Mode */}
                <div className="pt-8 pb-12 flex items-center justify-between border-t border-[var(--border-color)] mt-8 gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      goToPrevChapter();
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = 0;
                      }
                    }}
                    disabled={currentChapterIdx <= 0}
                    className="flex-1 py-3 rounded-xl border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] text-xs font-semibold flex items-center justify-center space-x-1 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>上一章</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      goToNextChapter();
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = 0;
                      }
                    }}
                    disabled={currentChapterIdx >= chapters.length - 1}
                    className="flex-1 py-3 rounded-xl border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] text-xs font-semibold flex items-center justify-center space-x-1 transition-all"
                  >
                    <span>下一章</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </article>
            )}
          </div>
        </main>
      )}

      {/* Bottom Floating Status Bar & Page Navigation */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-40 transition-transform duration-300 backdrop-blur-md bg-[var(--header-bg)] border-t border-[var(--border-color)] px-4 py-2.5 safe-area-bottom shadow-lg ${
          showToolbar ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="max-w-2xl mx-auto space-y-2">
          {/* Quick Progress Scrubber Slider */}
          <div className="flex items-center space-x-3 px-1">
            <span className="text-[11px] text-[var(--text-muted)] font-mono shrink-0">1</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, totalPages - 1)}
              value={isScrubbing ? scrubPage : currentPage}
              onInput={(e) => {
                setIsScrubbing(true);
                setScrubPage(Number((e.target as HTMLInputElement).value));
                onUserActivity();
              }}
              onChange={(e) => {
                const targetP = Number(e.target.value);
                setCurrentPage(targetP);
                setIsScrubbing(false);
                onUserActivity();
              }}
              className="w-full h-1.5 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
              aria-label="章節進度滑桿"
            />
            <span className="text-[11px] text-[var(--text-muted)] font-mono shrink-0">
              {totalPages}
            </span>
          </div>

          {/* Page & Chapter Turn Buttons */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => {
                  onUserActivity();
                  goToPrevChapter();
                }}
                disabled={currentChapterIdx <= 0}
                className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
                title="上一章"
              >
                <ChevronFirst className="w-4 h-4" />
                <span className="hidden sm:inline ml-1 text-[11px]">上一章</span>
              </button>
              <button
                onClick={() => {
                  onUserActivity();
                  goToPrevPage();
                }}
                disabled={currentChapterIdx === 0 && currentPage === 0}
                className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
                title="上一頁"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline ml-1 text-[11px]">上一頁</span>
              </button>
            </div>

            {/* Current Chapter Page Indicator */}
            <div className="flex flex-col items-center justify-center">
              <span className="text-xs font-bold text-[var(--accent-color)]">
                第 {currentPage + 1} / {totalPages} 頁
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                全書 {currentPercentage}%
              </span>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={() => {
                  onUserActivity();
                  goToNextPage();
                }}
                disabled={
                  currentChapterIdx >= chapters.length - 1 && currentPage >= totalPages - 1
                }
                className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
                title="下一頁"
              >
                <span className="hidden sm:inline mr-1 text-[11px]">下一頁</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  onUserActivity();
                  goToNextChapter();
                }}
                disabled={currentChapterIdx >= chapters.length - 1}
                className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
                title="下一章"
              >
                <span className="hidden sm:inline mr-1 text-[11px]">下一章</span>
                <ChevronLast className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Info */}
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5">
            <span className="truncate max-w-[200px]">
              {processedChapterTitle}
            </span>
            <span>
              {currentOffset.toLocaleString()} / {totalChars.toLocaleString()} 字
            </span>
          </div>
        </div>
      </footer>

      {/* Floating TTS Player Widget */}
      {showTTSPlayer && (
        <div className="fixed bottom-20 inset-x-4 sm:inset-x-auto sm:right-6 z-40 max-w-sm bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-3.5 shadow-2xl backdrop-blur-md animate-fade-in space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-[var(--accent-color)]/15 text-[var(--accent-color)]">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold">語音朗讀中</p>
                <p className="text-[10px] text-[var(--text-muted)]">
                  {tts.currentParagraphIdx >= 0
                    ? `第 ${tts.currentParagraphIdx + 1} / ${processedParagraphs.length} 段`
                    : "就緒"}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                tts.stop();
                setShowTTSPlayer(false);
              }}
              className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1 rounded-lg"
              title="關閉朗讀"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)]/60 gap-1">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => tts.prevParagraph()}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-color)] text-[var(--text-color)]"
                title="上一段"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (tts.isPlaying && !tts.isPaused) {
                    tts.pause();
                  } else if (tts.isPaused) {
                    tts.resume();
                  } else {
                    tts.startReading(processedParagraphs, 0);
                  }
                }}
                className="p-2 rounded-xl bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 transition-opacity"
                title={tts.isPlaying && !tts.isPaused ? "暫停" : "播放"}
              >
                {tts.isPlaying && !tts.isPaused ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => tts.nextParagraph()}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-color)] text-[var(--text-color)]"
                title="下一段"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Rate speed buttons */}
            <div className="flex items-center space-x-1">
              {[1.0, 1.25, 1.5, 1.8].map((s) => (
                <button
                  key={s}
                  onClick={() => tts.setRate(s)}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                    tts.rate === s
                      ? "bg-[var(--accent-color)] text-white"
                      : "bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-color)]"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* In-Book Full-Text Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-center items-start pt-14 p-4 animate-fade-in">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            {/* Header & Search Input */}
            <div className="p-4 border-b border-[var(--border-color)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-[var(--accent-color)]" />
                  書內全文檢索
                </h3>
                <button
                  onClick={() => setShowSearchModal(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    performSearch(e.target.value);
                  }}
                  placeholder="輸入關鍵字或角色名稱搜尋..."
                  autoFocus
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                    }}
                    className="absolute right-3 top-3 text-[var(--text-muted)] hover:text-[var(--text-color)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Search Results List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {searchQuery && searchResults.length === 0 && !isSearching && (
                <div className="py-12 text-center text-xs text-[var(--text-muted)]">
                  找不到包含「{searchQuery}」的內文結果
                </div>
              )}

              {searchResults.map((res, i) => (
                <div
                  key={i}
                  onClick={() => jumpToSearchResult(res)}
                  className="p-3 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--bg-color)] hover:bg-opacity-80 cursor-pointer transition-all space-y-1 group"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[var(--accent-color)] truncate max-w-[240px]">
                      {res.chapterTitle}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {((res.charOffset / (totalChars || 1)) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    ...{res.snippetBefore}
                    <mark className="bg-[var(--accent-color)]/25 text-[var(--text-color)] font-bold px-1 rounded">
                      {res.matchText}
                    </mark>
                    {res.snippetAfter}...
                  </p>
                </div>
              ))}

              {!searchQuery && (
                <div className="py-10 text-center text-xs text-[var(--text-muted)] space-y-1">
                  <p>輸入小說內文關鍵字以快速搜尋章節與段落</p>
                  <p className="text-[11px] opacity-70">支援即時命中預覽與點擊跳轉定位</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table of Contents & Bookmarks Drawer */}
      {showTOC && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-start animate-fade-in">
          <div className="bg-[var(--card-bg)] border-r border-[var(--border-color)] w-full max-w-sm h-full flex flex-col shadow-2xl">
            {/* Drawer Header */}
            <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">目錄與書籤</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {activeDrawerTab === "chapters"
                    ? `共 ${chapters.length} 個章節錨點`
                    : `共 ${bookmarks.length} 個已存書籤`}
                </p>
              </div>
              <button
                onClick={() => setShowTOC(false)}
                className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Switcher */}
            <div className="grid grid-cols-2 p-2 gap-1 border-b border-[var(--border-color)] bg-[var(--bg-color)]/50">
              <button
                onClick={() => setActiveDrawerTab("chapters")}
                className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeDrawerTab === "chapters"
                    ? "bg-[var(--accent-color)] text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-color)]"
                }`}
              >
                章節目錄 ({chapters.length})
              </button>
              <button
                onClick={() => setActiveDrawerTab("bookmarks")}
                className={`py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeDrawerTab === "bookmarks"
                    ? "bg-[var(--accent-color)] text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-color)]"
                }`}
              >
                書籤清單 ({bookmarks.length})
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {activeDrawerTab === "chapters" ? (
                /* Chapters List */
                chapters.map((chapter) => {
                  const isCurrent = chapter.index === currentChapterIdx;
                  return (
                    <button
                      key={chapter.index}
                      ref={isCurrent ? activeChapterBtnRef : undefined}
                      onClick={() => jumpToChapter(chapter)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                        isCurrent
                          ? "bg-[var(--accent-color)] text-white font-bold shadow-sm"
                          : "text-[var(--text-color)] hover:bg-[var(--bg-color)]"
                      }`}
                    >
                      <span className="truncate pr-2">{chapter.title}</span>
                      <span className="text-[10px] opacity-70 shrink-0">
                        {((chapter.charOffset / (totalChars || 1)) * 100).toFixed(0)}%
                      </span>
                    </button>
                  );
                })
              ) : (
                /* Bookmarks List */
                bookmarks.length === 0 ? (
                  <div className="py-16 text-center text-xs text-[var(--text-muted)] space-y-2">
                    <Bookmark className="w-8 h-8 mx-auto opacity-40" />
                    <p>目前尚無書籤</p>
                    <p className="text-[11px] opacity-70">
                      點擊上方工具列的「加入書籤」圖示即可收藏精彩段落
                    </p>
                  </div>
                ) : (
                  bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      onClick={() => jumpToBookmark(bm)}
                      className="p-3 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:bg-[var(--bg-color)] cursor-pointer transition-all space-y-1.5 group relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[var(--text-color)] group-hover:text-[var(--accent-color)] truncate max-w-[200px]">
                          {bm.title}
                        </span>
                        <div className="flex items-center space-x-1 shrink-0">
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {((bm.char_offset / (totalChars || 1)) * 100).toFixed(0)}%
                          </span>
                          <button
                            onClick={(e) => handleDeleteBookmark(e, bm.id)}
                            className="p-1 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                            title="刪除此書籤"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                        {bm.preview_text}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)]/70">
                        {new Date(bm.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
          <div className="flex-1" onClick={() => setShowTOC(false)} />
        </div>
      )}

      {/* Reading Preferences Settings Drawer */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="flex-1" onClick={() => setShowSettings(false)} />
          <div className="bg-[var(--card-bg)] border-l border-[var(--border-color)] w-full max-w-sm h-full flex flex-col shadow-2xl p-6 space-y-5 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <h3 className="font-bold text-base">排版與閱讀偏好</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-color)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chinese Variant dynamic conversion */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-muted)]">簡繁中文轉換</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "original", name: "原文" },
                  { id: "traditional", name: "正體(繁體)" },
                  { id: "simplified", name: "簡體中文" },
                ].map((cv) => (
                  <button
                    key={cv.id}
                    onClick={() => {
                      setChineseVariant(cv.id as any);
                      onUserActivity();
                    }}
                    className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                      chineseVariant === cv.id
                        ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm font-semibold"
                        : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                    }`}
                  >
                    {cv.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Reading Mode Selector (Paginated vs Continuous Scroll) */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-muted)]">閱讀翻頁模式</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateReadMode("paginated")}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                    readMode === "paginated"
                      ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm font-semibold"
                      : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                  }`}
                >
                  左右分頁模式
                </button>
                <button
                  onClick={() => updateReadMode("continuous")}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                    readMode === "continuous"
                      ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm font-semibold"
                      : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                  }`}
                >
                  垂直連續滾動
                </button>
              </div>
            </div>

            {/* Theme selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-muted)]">閱讀主題</label>
              <div className="grid grid-cols-5 gap-2">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => updateTheme(t.id)}
                    style={{ backgroundColor: t.bg, color: t.text }}
                    className={`h-11 rounded-xl border flex flex-col items-center justify-center text-[10px] font-medium transition-all ${
                      theme === t.id
                        ? "ring-2 ring-[var(--accent-color)] border-transparent shadow-md scale-105"
                        : "border-[var(--border-color)]"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-[var(--text-muted)]">字體大小</label>
                <span className="font-bold">{fontSize} px</span>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => updateFontSize(-1)}
                  className="flex-1 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold hover:border-[var(--accent-color)]"
                >
                  A- 縮小
                </button>
                <button
                  onClick={() => updateFontSize(1)}
                  className="flex-1 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-xs font-semibold hover:border-[var(--accent-color)]"
                >
                  A+ 放大
                </button>
              </div>
            </div>

            {/* Line Height */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label className="font-semibold text-[var(--text-muted)]">行距間距</label>
                <span className="font-bold">{lineHeight} 倍</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1.6, 1.85, 2.2].map((lh) => (
                  <button
                    key={lh}
                    onClick={() => updateLineHeight(lh)}
                    className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                      lineHeight === lh
                        ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                        : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                    }`}
                  >
                    {lh === 1.6 ? "緊湊" : lh === 1.85 ? "標準" : "寬鬆"}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-muted)]">字體樣式</label>
              <div className="grid grid-cols-3 gap-2">
                {FONT_FAMILIES.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => updateFontFamily(f.id)}
                    className={`py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      fontFamily === f.id
                        ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                        : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Page Width */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-muted)]">版面寬度</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "narrow", name: "窄版" },
                  { id: "normal", name: "標準" },
                  { id: "wide", name: "寬版" },
                ].map((w) => (
                  <button
                    key={w.id}
                    onClick={() => updateMaxWidth(w.id as any)}
                    className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                      maxWidthMode === w.id
                        ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                        : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                    }`}
                  >
                    {w.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Click Turn Direction */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--text-muted)]">點擊翻頁方向</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => updateClickDirection("standard")}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                    clickDirection === "standard"
                      ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                      : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                  }`}
                >
                  左：上一頁 ｜ 右：下一頁
                </button>
                <button
                  onClick={() => updateClickDirection("inverted")}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all ${
                    clickDirection === "inverted"
                      ? "bg-[var(--accent-color)] text-white border-transparent shadow-sm"
                      : "border-[var(--border-color)] bg-[var(--bg-color)] text-[var(--text-color)]"
                  }`}
                >
                  左：下一頁 ｜ 右：上一頁
                </button>
              </div>
            </div>

            {/* Mouse Gesture Quick Settings */}
            <div className="pt-2 border-t border-[var(--border-color)] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-color)]">滑鼠手勢</label>
                  <p className="text-[10px] text-[var(--text-muted)]">按住滑鼠右鍵拖曳快速控制</p>
                </div>
                <button
                  onClick={() => {
                    setShowSettings(false);
                    setShowGestureModal(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-color)] text-[11px] font-semibold text-[var(--accent-color)] hover:border-[var(--accent-color)] flex items-center gap-1"
                >
                  <MousePointerClick className="w-3.5 h-3.5" />
                  自訂與試畫
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mouse Gesture Overlay (Trail + Floating HUD) */}
      <GestureOverlay
        config={gestureConfig}
        isActive={gestureState.isActive}
        trail={gestureState.trail}
        currentGesture={gestureState.currentGesture}
        actionName={gestureState.actionName}
        currentPos={gestureState.currentPos}
      />

      {/* Mouse Gesture Settings Modal */}
      <GestureSettingsModal
        isOpen={showGestureModal}
        onClose={() => setShowGestureModal(false)}
        config={gestureConfig}
        onConfigChange={setGestureConfig}
      />
    </div>
  );
}

