"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  WifiOff,
  Cloud,
  Check,
  RefreshCw,
  X,
  Type,
  AlignLeft,
} from "lucide-react";
import { LocalStore } from "@/lib/idb";
import { extractChapters, Chapter, findCurrentChapter } from "@/lib/parser";
import { syncProgress, sendProgressToServer } from "@/lib/sync";
import { getDeviceName } from "@/lib/device";

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
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);

  // Settings state
  const [theme, setTheme] = useState("parchment");
  const [fontSize, setFontSize] = useState(19);
  const [lineHeight, setLineHeight] = useState(1.85);
  const [fontFamily, setFontFamily] = useState("serif");
  const [maxWidthMode, setMaxWidthMode] = useState<"narrow" | "normal" | "wide">("normal");

  // UI state
  const [showToolbar, setShowToolbar] = useState(true);
  const [showTOC, setShowTOC] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Conflict state
  const [conflictPrompt, setConflictPrompt] = useState<{
    serverOffset: number;
    serverPercentage: number;
    deviceName: string;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef(false);
  const lastReportedOffset = useRef(0);

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

  // Load book content and settings
  useEffect(() => {
    if (!bookId) return;

    // Load reader preferences
    const savedTheme = localStorage.getItem("novel_reader_theme") || "parchment";
    const savedFontSize = Number(localStorage.getItem("novel_reader_font_size")) || 19;
    const savedLineHeight = Number(localStorage.getItem("novel_reader_line_height")) || 1.85;
    const savedFontFamily = localStorage.getItem("novel_reader_font_family") || "serif";
    const savedMaxWidth = (localStorage.getItem("novel_reader_max_width") as any) || "normal";

    setTheme(savedTheme);
    setFontSize(savedFontSize);
    setLineHeight(savedLineHeight);
    setFontFamily(savedFontFamily);
    setMaxWidthMode(savedMaxWidth);
    document.documentElement.setAttribute("data-theme", savedTheme);

    // Load book data
    loadBookData();
  }, [bookId]);

  const loadBookData = async () => {
    setIsLoading(true);
    let bookText = "";
    let bookTitle = "未知小說";
    let bookChars = 0;

    // 1. Try local IndexedDB first
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

    // 2. If not cached, fetch from server
    if (!bookText) {
      try {
        const [metaRes, contentRes] = await Promise.all([
          fetch(`/api/books/${bookId}`),
          fetch(`/api/books/${bookId}/content`),
        ]);

        if (metaRes.ok && contentRes.ok) {
          const metaData = await metaRes.json();
          bookText = await contentRes.text();
          bookTitle = metaData.book?.title || "未命名小說";
          bookChars = bookText.length;

          // Save to IndexedDB
          await LocalStore.saveBookContent(bookId, bookTitle, bookText, bookChars);
        } else {
          throw new Error("無法讀取小說資料");
        }
      } catch (err) {
        console.error(err);
        setIsOffline(true);
        if (!bookText) {
          alert("無法載入小說，請確認網路連線或該書籍已快取至本機。");
          router.push("/");
          return;
        }
      }
    }

    setTitle(bookTitle);
    setFullText(bookText);
    setTotalChars(bookChars);

    // Extract chapters
    const parsedChapters = extractChapters(bookText);
    setChapters(parsedChapters);

    // 3. Determine starting offset
    let targetOffset = 0;
    const localProg = await LocalStore.getLocalProgress(bookId);
    if (localProg && localProg.char_offset) {
      targetOffset = localProg.char_offset;
    }

    // Check cloud progress for conflicts
    try {
      const progRes = await fetch(`/api/progress?bookId=${bookId}`);
      if (progRes.ok) {
        const progData = await progRes.json();
        if (progData.success && progData.progress) {
          const sProg = progData.progress;
          const sTime = new Date(sProg.updated_at).getTime();
          const lTime = localProg ? new Date(localProg.updated_at).getTime() : 0;

          // If server progress is newer by > 3s and offset differs by > 300 characters
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
      // Offline
    }

    setCurrentOffset(targetOffset);
    lastReportedOffset.current = targetOffset;
    const chIdx = findCurrentChapter(parsedChapters, targetOffset);
    setCurrentChapterIdx(chIdx);

    setIsLoading(false);

    // Scroll to offset after DOM renders
    setTimeout(() => {
      scrollToOffset(targetOffset, false);
    }, 100);
  };

  // Scroll to a specific character offset in the window
  const scrollToOffset = (offset: number, smooth: boolean = true) => {
    if (!containerRef.current || !fullText) return;
    const ratio = Math.min(1, Math.max(0, offset / (totalChars || 1)));
    const maxScroll = containerRef.current.scrollHeight - containerRef.current.clientHeight;
    const targetScrollTop = ratio * maxScroll;

    isScrollingProgrammatically.current = true;
    containerRef.current.scrollTo({
      top: targetScrollTop,
      behavior: smooth ? "smooth" : "instant",
    });

    setTimeout(() => {
      isScrollingProgrammatically.current = false;
    }, 400);
  };

  // Scroll event handler with throttling
  const handleScroll = useCallback(() => {
    if (isScrollingProgrammatically.current || !containerRef.current || !totalChars) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const maxScroll = scrollHeight - clientHeight;
    if (maxScroll <= 0) return;

    const ratio = Math.min(1, Math.max(0, scrollTop / maxScroll));
    const calculatedOffset = Math.round(ratio * totalChars);

    setCurrentOffset(calculatedOffset);

    // Update current chapter index
    if (chapters.length > 0) {
      const idx = findCurrentChapter(chapters, calculatedOffset);
      if (idx !== currentChapterIdx) {
        setCurrentChapterIdx(idx);
      }
    }

    // Sync progress
    const percentage = Number(((calculatedOffset / totalChars) * 100).toFixed(2));
    syncProgress(bookId, calculatedOffset, percentage, false);
  }, [bookId, totalChars, chapters, currentChapterIdx]);

  // Page Visibility API & Pagehide listeners for reliable sync
  useEffect(() => {
    if (!bookId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && totalChars > 0) {
        const percentage = Number(((currentOffset / totalChars) * 100).toFixed(2));
        syncProgress(bookId, currentOffset, percentage, true);
      }
    };

    const handlePageHide = () => {
      if (totalChars > 0) {
        const percentage = Number(((currentOffset / totalChars) * 100).toFixed(2));
        syncProgress(bookId, currentOffset, percentage, true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [bookId, currentOffset, totalChars]);

  // Jump to chapter
  const jumpToChapter = (chapter: Chapter) => {
    setCurrentOffset(chapter.charOffset);
    setCurrentChapterIdx(chapter.index);
    setShowTOC(false);
    scrollToOffset(chapter.charOffset, true);
    const percentage = Number(((chapter.charOffset / (totalChars || 1)) * 100).toFixed(2));
    syncProgress(bookId, chapter.charOffset, percentage, false);
  };

  // Previous / Next Chapter
  const handlePrevChapter = () => {
    if (currentChapterIdx > 0) {
      jumpToChapter(chapters[currentChapterIdx - 1]);
    }
  };

  const handleNextChapter = () => {
    if (currentChapterIdx < chapters.length - 1) {
      jumpToChapter(chapters[currentChapterIdx + 1]);
    }
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.warn);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.warn);
      setIsFullscreen(false);
    }
  };

  // Preference updates
  const updateTheme = (newTheme: string) => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("novel_reader_theme", newTheme);
  };

  const updateFontSize = (delta: number) => {
    setFontSize((prev) => {
      const next = Math.max(14, Math.min(32, prev + delta));
      localStorage.setItem("novel_reader_font_size", next.toString());
      return next;
    });
  };

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

  // Current progress percentage
  const currentPercentage = useMemo(() => {
    if (!totalChars) return 0;
    return Number(((currentOffset / totalChars) * 100).toFixed(1));
  }, [currentOffset, totalChars]);

  // Current font class
  const currentFontClass = useMemo(() => {
    return FONT_FAMILIES.find((f) => f.id === fontFamily)?.className || "font-serif-novel";
  }, [fontFamily]);

  // Split text into paragraphs
  const paragraphs = useMemo(() => {
    if (!fullText) return [];
    return fullText.split(/\r?\n/).filter((p) => p.trim().length > 0);
  }, [fullText]);

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col select-text bg-[var(--bg-color)] text-[var(--text-color)]">
      {/* Top Floating Navigation Toolbar */}
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-transform duration-300 backdrop-blur-md bg-[var(--header-bg)] border-b border-[var(--border-color)] px-4 py-2.5 flex items-center justify-between shadow-sm ${
          showToolbar ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className="flex items-center space-x-2 truncate pr-2">
          <Link
            href="/"
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
            title="返回書架"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="truncate">
            <h1 className="text-sm font-bold truncate">{title}</h1>
            <p className="text-[11px] text-[var(--text-muted)] truncate">
              {chapters[currentChapterIdx]?.title || "閱讀中"}
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
                scrollToOffset(conflictPrompt.serverOffset, true);
                setCurrentOffset(conflictPrompt.serverOffset);
                setConflictPrompt(null);
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90"
            >
              立刻跳轉同步
            </button>
          </div>
        </div>
      )}

      {/* Main Text Content Container */}
      <main
        ref={containerRef}
        onScroll={handleScroll}
        onClick={(e) => {
          // Clicking center 40% toggles toolbar
          const yRatio = e.clientY / window.innerHeight;
          const xRatio = e.clientX / window.innerWidth;
          if (yRatio > 0.25 && yRatio < 0.75 && xRatio > 0.25 && xRatio < 0.75) {
            setShowToolbar((prev) => !prev);
          }
        }}
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-8 pt-16 pb-24 scroll-smooth"
      >
        <div
          className={`mx-auto ${maxWidthClass} transition-all duration-200`}
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: lineHeight,
            letterSpacing: "0.03em",
          }}
        >
          {isLoading ? (
            <div className="space-y-4 py-20 text-center text-[var(--text-muted)]">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin" />
              <p className="text-sm">正在載入小說文本並初始化排版...</p>
            </div>
          ) : (
            <article className={`space-y-4 select-text ${currentFontClass}`}>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-center mb-8 pb-4 border-b border-[var(--border-color)]">
                {title}
              </h1>

              {paragraphs.map((para, i) => (
                <p key={i} className="novel-content-paragraph leading-relaxed">
                  {para}
                </p>
              ))}

              <div className="py-16 text-center text-xs text-[var(--text-muted)] space-y-2 border-t border-[var(--border-color)] mt-12">
                <p>—— 全文結束 ——</p>
                <p>總字數：{totalChars.toLocaleString()} 字</p>
              </div>
            </article>
          )}
        </div>
      </main>

      {/* Bottom Floating Status Bar & Fast Navigation */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-40 transition-transform duration-300 backdrop-blur-md bg-[var(--header-bg)] border-t border-[var(--border-color)] px-4 py-2.5 shadow-lg ${
          showToolbar ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="max-w-2xl mx-auto space-y-2">
          {/* Slider & Chapter Jump */}
          <div className="flex items-center justify-between gap-3 text-xs">
            <button
              onClick={handlePrevChapter}
              disabled={currentChapterIdx <= 0}
              className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
              title="上一章"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline ml-1 text-[11px]">上一章</span>
            </button>

            {/* Reading progress slider */}
            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min="0"
                max={totalChars || 100}
                value={currentOffset}
                onChange={(e) => {
                  const newOffset = Number(e.target.value);
                  setCurrentOffset(newOffset);
                  scrollToOffset(newOffset, false);
                }}
                className="w-full h-1.5 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
              />
              <span className="text-[11px] font-semibold min-w-[48px] text-right text-[var(--accent-color)]">
                {currentPercentage}%
              </span>
            </div>

            <button
              onClick={handleNextChapter}
              disabled={currentChapterIdx >= chapters.length - 1}
              className="p-1.5 rounded-lg border border-[var(--border-color)] disabled:opacity-30 hover:bg-[var(--card-bg)] transition-all flex items-center"
              title="下一章"
            >
              <span className="hidden sm:inline mr-1 text-[11px]">下一章</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Info */}
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
            <span className="truncate max-w-[200px]">
              {chapters[currentChapterIdx]?.title || "正文"}
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
          </div>
        </div>
      )}
    </div>
  );
}
