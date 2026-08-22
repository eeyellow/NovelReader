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
} from "lucide-react";
import { LocalStore } from "@/lib/idb";
import { extractChapters, Chapter, findCurrentChapter } from "@/lib/parser";
import { syncProgress } from "@/lib/sync";
import { GestureAction, GestureConfig } from "@/lib/gesture/types";
import {
  DEFAULT_GESTURE_CONFIG,
  loadGestureConfig,
} from "@/lib/gesture/defaultGestures";
import { useMouseGesture } from "@/hooks/useMouseGesture";
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

  // UI state
  const [showToolbar, setShowToolbar] = useState(true);
  const [showTOC, setShowTOC] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const [viewportWidth, setViewportWidth] = useState(0);
  const pendingPageRef = useRef<"first" | "last" | null>(null);
  const pendingTargetOffset = useRef<number | null>(null);
  const isRestoringProgress = useRef<boolean>(true);

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

    setTheme(savedTheme);
    setFontSize(savedFontSize);
    setLineHeight(savedLineHeight);
    setFontFamily(savedFontFamily);
    setMaxWidthMode(savedMaxWidth);
    setClickDirection(savedClickDirection);
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
      if (cached && cached.content) {
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
          bookText = await contentRes.text();
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

    // 3. 取得本機閱讀進度並立刻完成畫面載入
    let targetOffset = 0;
    const localProg = await LocalStore.getLocalProgress(bookId);
    if (localProg && localProg.char_offset) {
      targetOffset = localProg.char_offset;
    }

    const chIdx = findCurrentChapter(parsedChapters, targetOffset);
    setCurrentChapterIdx(chIdx);
    setCurrentOffset(targetOffset);
    pendingTargetOffset.current = targetOffset;
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

  // Get current chapter text and paragraphs
  const currentChapter = useMemo(() => {
    return chapters[currentChapterIdx] || null;
  }, [chapters, currentChapterIdx]);

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
    } else if (pendingTargetOffset.current !== null && currentChapter) {
      const relOffset = Math.max(
        0,
        pendingTargetOffset.current - currentChapter.charOffset
      );
      const chLen = currentChapter.length || 1;

      let targetP = 0;
      // 精準段落 DOM 偏移量對齊
      if (
        contentRef.current &&
        vWidth > 0 &&
        currentChapterParagraphs.length > 0
      ) {
        let charAcc = 0;
        let targetParaIdx = 0;
        for (let i = 0; i < currentChapterParagraphs.length; i++) {
          const pLen = currentChapterParagraphs[i].length;
          if (charAcc + pLen >= relOffset) {
            targetParaIdx = i;
            break;
          }
          charAcc += pLen;
        }

        const pElements = contentRef.current.querySelectorAll(
          "p.novel-content-paragraph"
        );
        if (pElements && pElements[targetParaIdx]) {
          const pEl = pElements[targetParaIdx] as HTMLElement;
          const colW = vWidth + columnGap;
          targetP = Math.min(
            totalCols - 1,
            Math.max(0, Math.floor((pEl.offsetLeft + 8) / colW))
          );
        } else {
          targetP = Math.min(
            totalCols - 1,
            Math.max(0, Math.floor((relOffset / chLen) * totalCols))
          );
        }
      } else {
        targetP = Math.min(
          totalCols - 1,
          Math.max(0, Math.floor((relOffset / chLen) * totalCols))
        );
      }

      setCurrentPage(targetP);
      pendingTargetOffset.current = null;
      setTimeout(() => {
        isRestoringProgress.current = false;
      }, 150);
    } else {
      setCurrentPage((prev) => Math.min(prev, totalCols - 1));
    }
  }, [currentChapter, currentChapterParagraphs, columnGap]);

  // Measure after layout or chapter/style change
  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      measurePagination();
    }, 50);
    return () => clearTimeout(timer);
  }, [
    currentChapterIdx,
    currentChapterParagraphs,
    fontSize,
    lineHeight,
    fontFamily,
    maxWidthMode,
    measurePagination,
  ]);

  // Resize observer to handle window resizing
  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver(() => {
      measurePagination();
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [measurePagination]);

  // Update current character offset & sync progress on page change
  useEffect(() => {
    if (isRestoringProgress.current || pendingTargetOffset.current !== null) {
      return;
    }
    if (!currentChapter || !totalChars) return;

    const chStart = currentChapter.charOffset;
    const chLen = currentChapter.length || 0;
    const pageRatio = totalPages > 1 ? currentPage / (totalPages - 1) : 0;
    const calculatedOffset = Math.min(
      totalChars,
      Math.round(chStart + pageRatio * chLen)
    );

    setCurrentOffset(calculatedOffset);
    const percentage = Number(
      ((calculatedOffset / totalChars) * 100).toFixed(2)
    );
    syncProgress(bookId, calculatedOffset, percentage, false);
  }, [bookId, currentChapter, currentPage, totalPages, totalChars]);

  // Page Navigation Methods
  const goToNextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((p) => p + 1);
    } else if (currentChapterIdx < chapters.length - 1) {
      pendingPageRef.current = "first";
      setCurrentChapterIdx((idx) => idx + 1);
    }
  }, [currentPage, totalPages, currentChapterIdx, chapters.length]);

  const goToPrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage((p) => p - 1);
    } else if (currentChapterIdx > 0) {
      pendingPageRef.current = "last";
      setCurrentChapterIdx((idx) => idx - 1);
    }
  }, [currentPage, currentChapterIdx]);

  const goToNextChapter = useCallback(() => {
    if (currentChapterIdx < chapters.length - 1) {
      pendingPageRef.current = "first";
      setCurrentChapterIdx((idx) => idx + 1);
    }
  }, [currentChapterIdx, chapters.length]);

  const goToPrevChapter = useCallback(() => {
    if (currentChapterIdx > 0) {
      pendingPageRef.current = "first";
      setCurrentChapterIdx((idx) => idx - 1);
    }
  }, [currentChapterIdx]);

  const goToFirstPage = useCallback(() => {
    pendingPageRef.current = "first";
    setCurrentChapterIdx(0);
  }, []);

  const goToLastPage = useCallback(() => {
    if (chapters.length > 0) {
      pendingPageRef.current = "last";
      setCurrentChapterIdx(chapters.length - 1);
    }
  }, [chapters.length]);

  // Jump to specific chapter from TOC
  const jumpToChapter = (chapter: Chapter) => {
    pendingPageRef.current = "first";
    setCurrentChapterIdx(chapter.index);
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
        className={`fixed top-0 inset-x-0 z-40 transition-transform duration-300 backdrop-blur-md bg-[var(--header-bg)] border-b border-[var(--border-color)] px-4 py-2.5 flex items-center justify-between shadow-sm ${
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
              {currentChapter?.title || "閱讀中"}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          <button
            onClick={() => setShowTOC(!showTOC)}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
            title="目錄章節"
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

      {/* Main Multi-Column Paginated Reading Viewport */}
      <main
        onClick={(e) => {
          // 若有反白選取文字則不觸發點擊翻頁
          const selection = window.getSelection();
          if (selection && selection.toString().length > 0) {
            return;
          }
          // Screen click zones:
          // Left 28% | Middle 44% (Toggle Toolbar) | Right 28%
          const xRatio = e.clientX / window.innerWidth;
          if (xRatio < 0.28) {
            clickDirection === "inverted" ? goToNextPage() : goToPrevPage();
          } else if (xRatio > 0.72) {
            clickDirection === "inverted" ? goToPrevPage() : goToNextPage();
          } else {
            setShowToolbar((prev) => !prev);
          }
        }}
        className="flex-1 overflow-hidden relative flex flex-col justify-center px-4 sm:px-8 py-14"
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
                    {currentChapter?.title || "正文"}
                  </h2>

                  {/* Paragraphs */}
                  {currentChapterParagraphs.map((para, i) => (
                    <p
                      key={i}
                      className="novel-content-paragraph leading-relaxed mb-4 text-justify"
                      style={{ textIndent: "2em" }}
                    >
                      {para}
                    </p>
                  ))}

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

      {/* Bottom Floating Status Bar & Page Navigation */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-40 transition-transform duration-300 backdrop-blur-md bg-[var(--header-bg)] border-t border-[var(--border-color)] px-4 py-2.5 shadow-lg ${
          showToolbar ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="max-w-2xl mx-auto space-y-2">
          {/* Page & Chapter Turn Buttons */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-1">
              <button
                onClick={goToPrevChapter}
                disabled={currentChapterIdx <= 0}
                className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
                title="上一章 (手勢: ⬆️)"
              >
                <ChevronFirst className="w-4 h-4" />
                <span className="hidden sm:inline ml-1 text-[11px]">上一章</span>
              </button>
              <button
                onClick={goToPrevPage}
                disabled={currentChapterIdx === 0 && currentPage === 0}
                className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
                title="上一頁 (手勢: ⬅️)"
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
                onClick={goToNextPage}
                disabled={
                  currentChapterIdx >= chapters.length - 1 && currentPage >= totalPages - 1
                }
                className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
                title="下一頁 (手勢: ➡️)"
              >
                <span className="hidden sm:inline mr-1 text-[11px]">下一頁</span>
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={goToNextChapter}
                disabled={currentChapterIdx >= chapters.length - 1}
                className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
                title="下一章 (手勢: ⬇️)"
              >
                <span className="hidden sm:inline mr-1 text-[11px]">下一章</span>
                <ChevronLast className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Info */}
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5">
            <span className="truncate max-w-[200px]">
              {currentChapter?.title || "正文"}
            </span>
            <span>
              {currentOffset.toLocaleString()} / {totalChars.toLocaleString()} 字
            </span>
          </div>
        </div>
      </footer>

      {/* Table of Contents Drawer */}
      {showTOC && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-start animate-fade-in">
          <div className="bg-[var(--card-bg)] border-r border-[var(--border-color)] w-full max-w-sm h-full flex flex-col shadow-2xl">
            <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">目錄章節</h3>
                <p className="text-xs text-[var(--text-muted)]">共 {chapters.length} 個章節錨點</p>
              </div>
              <button
                onClick={() => setShowTOC(false)}
                className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {chapters.map((chapter) => {
                const isCurrent = chapter.index === currentChapterIdx;
                return (
                  <button
                    key={chapter.index}
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
              })}
            </div>
          </div>
          <div className="flex-1" onClick={() => setShowTOC(false)} />
        </div>
      )}

      {/* Reading Preferences Settings Drawer */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end animate-fade-in">
          <div className="flex-1" onClick={() => setShowSettings(false)} />
          <div className="bg-[var(--card-bg)] border-l border-[var(--border-color)] w-full max-w-sm h-full flex flex-col shadow-2xl p-6 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-color)]">
              <h3 className="font-bold text-base">排版與閱讀偏好</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-color)]"
              >
                <X className="w-5 h-5" />
              </button>
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
