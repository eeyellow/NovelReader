"use client";

/**
 * @file page.tsx
 * @description 閱讀器核心頁面容器組件，負責整合資料載入、排版設定、分頁導航、語音朗讀與手勢互動
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { LocalStore } from "@/lib/idb";
import { extractChapters, Chapter, findCurrentChapter } from "@/lib/parser";
import { convertToTraditional, convertToSimplified } from "@/lib/chinese";
import { GestureAction, GestureConfig } from "@/lib/gesture/types";
import { DEFAULT_GESTURE_CONFIG, loadGestureConfig } from "@/lib/gesture/defaultGestures";
import { useMouseGesture } from "@/hooks/useMouseGesture";
import { useTouchGesture } from "@/hooks/useTouchGesture";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useTTS } from "@/hooks/useTTS";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { useReaderBookmarks } from "@/hooks/useReaderBookmarks";
import { useReaderSearch } from "@/hooks/useReaderSearch";
import { useReaderPagination } from "@/hooks/useReaderPagination";
import { GestureOverlay } from "@/components/gesture/GestureOverlay";
import { GestureSettingsModal } from "@/components/gesture/GestureSettingsModal";
import { ReaderHeader } from "@/components/reader/ReaderHeader";
import { ReaderFooter } from "@/components/reader/ReaderFooter";
import { PaginatedViewport } from "@/components/reader/PaginatedViewport";
import { ContinuousViewport } from "@/components/reader/ContinuousViewport";
import { TOCDrawer } from "@/components/reader/TOCDrawer";
import { ReaderSettingsDrawer } from "@/components/reader/ReaderSettingsDrawer";
import { TTSPlayerWidget } from "@/components/reader/TTSPlayerWidget";
import { ReaderSearchModal } from "@/components/reader/ReaderSearchModal";
import { ReaderToasts } from "@/components/reader/ReaderToasts";

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = (params?.id as string) || "";

  // 基礎書籍資料狀態
  const [title, setTitle] = useState("載入中...");
  const [fullText, setFullText] = useState("");
  const [totalChars, setTotalChars] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // UI 介面開關狀態
  const [showToolbar, setShowToolbar] = useState(true);
  const [showTOC, setShowTOC] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTTSPlayer, setShowTTSPlayer] = useState(false);
  const [showGestureModal, setShowGestureModal] = useState(false);
  const [gestureConfig, setGestureConfig] = useState<GestureConfig>(DEFAULT_GESTURE_CONFIG);

  const lastTouchActionTime = useRef<number>(0);

  // 螢幕防休眠喚醒鎖
  const { onUserActivity } = useWakeLock({ enabled: !isLoading });

  // 排版偏好管理 Hook
  const settings = useReaderSettings(onUserActivity);

  // 當前章節物件
  const currentChapter = useMemo(() => {
    return chapters[currentChapterIdx] || null;
  }, [chapters, currentChapterIdx]);

  // 當前章節純文字與段落切分
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

  // 動態即時簡繁轉換章節標題與內文段落
  const processedChapterTitle = useMemo(() => {
    if (!currentChapter?.title) return "正文";
    if (settings.chineseVariant === "traditional")
      return convertToTraditional(currentChapter.title);
    if (settings.chineseVariant === "simplified")
      return convertToSimplified(currentChapter.title);
    return currentChapter.title;
  }, [currentChapter?.title, settings.chineseVariant]);

  const processedParagraphs = useMemo(() => {
    if (!currentChapterParagraphs || currentChapterParagraphs.length === 0) return [];
    if (settings.chineseVariant === "traditional") {
      return currentChapterParagraphs.map((p) => convertToTraditional(p));
    }
    if (settings.chineseVariant === "simplified") {
      return currentChapterParagraphs.map((p) => convertToSimplified(p));
    }
    return currentChapterParagraphs;
  }, [currentChapterParagraphs, settings.chineseVariant]);

  // 分頁運算與導航 Hook
  const pagination = useReaderPagination({
    bookId,
    chapters,
    totalChars,
    currentChapterIdx,
    setCurrentChapterIdx,
    currentChapter,
    processedChapterTitle,
    processedParagraphs,
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    fontFamily: settings.fontFamily,
    maxWidthMode: settings.maxWidthMode,
    columnGap: 36,
    onActivity: onUserActivity,
  });

  // 書籤管理 Hook
  const bookmarkHook = useReaderBookmarks({
    bookId,
    chapters,
    currentChapter,
    currentChapterParagraphs,
    currentOffset: pagination.currentOffset,
    currentPage: pagination.currentPage,
    currentChapterIdx,
    onJumpToOffset: pagination.jumpToOffset,
    onActivity: onUserActivity,
  });

  // 書內全文檢索 Hook
  const searchHook = useReaderSearch({
    fullText,
    chapters,
    onJumpToResult: (res) => {
      pagination.jumpToOffset(res.charOffset, res.chapterIndex);
    },
    onActivity: onUserActivity,
  });

  // Web Speech API TTS 語音朗讀 Hook
  const tts = useTTS({
    onParagraphChange: () => {
      onUserActivity();
    },
    onPageEnd: () => {
      if (pagination.currentPage < pagination.totalPages - 1) {
        pagination.goToNextPage();
      } else if (currentChapterIdx < chapters.length - 1) {
        pagination.goToNextChapter();
      } else {
        tts.stop();
      }
    },
  });

  // 載入書籍檔案與本機進度
  useEffect(() => {
    if (!bookId) return;

    // 紀錄最後閱讀書籍 ID 供 PWA 開啟時無縫接軌
    localStorage.setItem("novel_reader_last_book_id", bookId);
    setGestureConfig(loadGestureConfig());

    const loadBookData = async () => {
      setIsLoading(true);
      let bookText = "";
      let bookTitle = "未知小說";
      let bookChars = 0;
      let serverChapters: Chapter[] | null = null;

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

            if (Array.isArray(metaData.chapters) && metaData.chapters.length > 0) {
              serverChapters = metaData.chapters;
            }

            await LocalStore.saveBookContent(bookId, bookTitle, bookText, bookChars);
          } else {
            throw new Error("無法讀取小說資料");
          }
        } catch (err) {
          console.error(err);
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

      // 大長篇優化：優先從本機 IndexedDB 快取讀取章節索引，達成 0ms 瞬間開書
      let parsedChapters: Chapter[] | null = null;
      try {
        parsedChapters = await LocalStore.getChapters(bookId);
      } catch (e) {
        console.warn("讀取本機章節快取失敗:", e);
      }

      if (!parsedChapters && serverChapters && serverChapters.length > 0) {
        parsedChapters = serverChapters;
        LocalStore.saveChapters(bookId, parsedChapters).catch(console.warn);
      }

      if (!parsedChapters || parsedChapters.length === 0) {
        parsedChapters = extractChapters(bookText);
        LocalStore.saveChapters(bookId, parsedChapters).catch(console.warn);
      }

      setChapters(parsedChapters);

      bookmarkHook.loadBookmarks(bookId);

      // 3. 取得本機閱讀進度並立刻完成畫面載入
      let targetOffset = 0;
      let targetChapterIdx = 0;
      let targetPageRatio: number | null = null;
      let targetPageIndex: number | null = null;

      const localProg = await LocalStore.getLocalProgress(bookId);
      if (localProg) {
        targetOffset = localProg.char_offset || 0;
        if (typeof localProg.chapter_index === "number" && localProg.chapter_index >= 0) {
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

      pagination.pendingTargetPageIndex.current = targetPageIndex;
      pagination.pendingTargetPageRatio.current = targetPageRatio;
      pagination.pendingTargetOffset.current = targetOffset;
      pagination.isRestoringProgress.current = true;

      setCurrentChapterIdx(targetChapterIdx);
      pagination.setCurrentOffset(targetOffset);
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
              pagination.setConflictPrompt({
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

    loadBookData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const handleBackToShelf = useCallback(() => {
    router.push("/?from=reader");
  }, [router]);

  // 全螢幕切換
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.warn);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.warn);
      setIsFullscreen(false);
    }
  }, []);

  // 同步全螢幕狀態
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // 鍵盤導航快捷鍵
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showTOC || showSettings || showGestureModal || searchHook.showSearchModal) return;

      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        pagination.goToNextPage();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        pagination.goToPrevPage();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        pagination.goToPrevChapter();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        pagination.goToNextChapter();
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    pagination,
    toggleFullscreen,
    showTOC,
    showSettings,
    showGestureModal,
    searchHook.showSearchModal,
  ]);

  // 滑鼠手勢動作分發
  const handleGestureAction = useCallback(
    (action: GestureAction) => {
      switch (action) {
        case "PREV_PAGE":
          pagination.goToPrevPage();
          break;
        case "NEXT_PAGE":
          pagination.goToNextPage();
          break;
        case "PREV_CHAPTER":
          pagination.goToPrevChapter();
          break;
        case "NEXT_CHAPTER":
          pagination.goToNextChapter();
          break;
        case "SCROLL_TOP":
          pagination.goToFirstPage();
          break;
        case "SCROLL_BOTTOM":
          pagination.goToLastPage();
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
          settings.cycleTheme();
          break;
        case "FONT_INCREASE":
          settings.updateFontSize(1);
          break;
        case "FONT_DECREASE":
          settings.updateFontSize(-1);
          break;
      }
    },
    [pagination, handleBackToShelf, toggleFullscreen, settings]
  );

  // 觸控手勢 Hook
  useTouchGesture({
    elementRef: pagination.readerMainRef,
    onSwipeLeft: () => {
      lastTouchActionTime.current = Date.now();
      onUserActivity();
      settings.clickDirection === "inverted"
        ? pagination.goToPrevPage()
        : pagination.goToNextPage();
    },
    onSwipeRight: () => {
      lastTouchActionTime.current = Date.now();
      onUserActivity();
      settings.clickDirection === "inverted"
        ? pagination.goToNextPage()
        : pagination.goToPrevPage();
    },
    onPinchZoom: (delta) => {
      lastTouchActionTime.current = Date.now();
      onUserActivity();
      settings.updateFontSize(delta);
    },
    onTap: (clientX) => {
      lastTouchActionTime.current = Date.now();
      onUserActivity();
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      const xRatio = clientX / window.innerWidth;
      if (xRatio < 0.28) {
        settings.clickDirection === "inverted"
          ? pagination.goToNextPage()
          : pagination.goToPrevPage();
      } else if (xRatio > 0.72) {
        settings.clickDirection === "inverted"
          ? pagination.goToPrevPage()
          : pagination.goToNextPage();
      } else {
        setShowToolbar((prev) => !prev);
      }
    },
    enabled: !isLoading,
  });

  // 滑鼠手勢監聽 Hook
  const gestureState = useMouseGesture({
    config: gestureConfig,
    onAction: handleGestureAction,
  });

  // 全書百分比計算
  const currentPercentage = useMemo(() => {
    if (!totalChars) return 0;
    return Number(((pagination.currentOffset / totalChars) * 100).toFixed(1));
  }, [pagination.currentOffset, totalChars]);

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col select-text bg-[var(--bg-color)] text-[var(--text-color)]">
      {/* 頂部懸浮工具列 */}
      <ReaderHeader
        showToolbar={showToolbar}
        title={title}
        processedChapterTitle={processedChapterTitle}
        showTTSPlayer={showTTSPlayer}
        showTOC={showTOC}
        showSettings={showSettings}
        isFullscreen={isFullscreen}
        onBackToShelf={handleBackToShelf}
        onOpenSearch={() => searchHook.setShowSearchModal(true)}
        onAddBookmark={bookmarkHook.handleAddBookmark}
        onToggleTTS={() => {
          setShowTTSPlayer((prev) => !prev);
          if (!showTTSPlayer && !tts.isPlaying) {
            tts.startReading(processedParagraphs, 0);
          }
        }}
        onToggleTOC={() => setShowTOC(!showTOC)}
        onToggleSettings={() => setShowSettings(!showSettings)}
        onOpenGestureModal={() => setShowGestureModal(true)}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* 提示與進度衝突對話框 */}
      <ReaderToasts
        bookmarkToast={bookmarkHook.bookmarkToast}
        chapterSwitchToast={pagination.chapterSwitchToast}
        conflictPrompt={pagination.conflictPrompt}
        onDismissConflict={() => pagination.setConflictPrompt(null)}
        onAcceptConflict={(serverOffset) => {
          const newChIdx = findCurrentChapter(chapters, serverOffset);
          setCurrentChapterIdx(newChIdx);
          pagination.pendingTargetOffset.current = serverOffset;
          pagination.setConflictPrompt(null);
        }}
      />

      {/* 閱讀主視圖：水平分頁 vs 垂直滾動 */}
      {settings.readMode === "paginated" ? (
        <PaginatedViewport
          readerMainRef={pagination.readerMainRef}
          viewportRef={pagination.viewportRef}
          contentRef={pagination.contentRef}
          paddingClass={settings.paddingClass}
          maxWidthClass={settings.maxWidthClass}
          currentFontClass={settings.currentFontClass}
          viewportWidth={pagination.viewportWidth}
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          currentChapterIdx={currentChapterIdx}
          totalChapters={chapters.length}
          totalChars={totalChars}
          columnGap={36}
          fontSize={settings.fontSize}
          lineHeight={settings.lineHeight}
          textAlign={settings.textAlign}
          clickDirection={settings.clickDirection}
          processedChapterTitle={processedChapterTitle}
          processedParagraphs={processedParagraphs}
          isLoading={isLoading}
          ttsIsPlaying={tts.isPlaying}
          ttsCurrentParagraphIdx={tts.currentParagraphIdx}
          lastTouchActionTime={lastTouchActionTime}
          onPrevPage={pagination.goToPrevPage}
          onNextPage={pagination.goToNextPage}
          onToggleToolbar={() => setShowToolbar((prev) => !prev)}
          onActivity={onUserActivity}
        />
      ) : (
        <ContinuousViewport
          scrollContainerRef={pagination.scrollContainerRef}
          maxWidthClass={settings.maxWidthClass}
          currentFontClass={settings.currentFontClass}
          fontSize={settings.fontSize}
          lineHeight={settings.lineHeight}
          processedChapterTitle={processedChapterTitle}
          processedParagraphs={processedParagraphs}
          isLoading={isLoading}
          ttsIsPlaying={tts.isPlaying}
          ttsCurrentParagraphIdx={tts.currentParagraphIdx}
          currentChapterIdx={currentChapterIdx}
          totalChapters={chapters.length}
          onScroll={pagination.handleContinuousScroll}
          onToggleToolbar={() => setShowToolbar((prev) => !prev)}
          onPrevChapter={pagination.goToPrevChapter}
          onNextChapter={pagination.goToNextChapter}
        />
      )}

      {/* 底部控制列 */}
      <ReaderFooter
        showToolbar={showToolbar}
        scrubberMode={pagination.scrubberMode}
        isScrubbing={pagination.isScrubbing}
        scrubPage={pagination.scrubPage}
        scrubBookPercentage={pagination.scrubBookPercentage}
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        currentPercentage={currentPercentage}
        currentChapterIdx={currentChapterIdx}
        totalChapters={chapters.length}
        processedChapterTitle={processedChapterTitle}
        currentOffset={pagination.currentOffset}
        totalChars={totalChars}
        scrubTargetInfo={pagination.scrubTargetInfo}
        onToggleScrubberMode={() => {
          pagination.setScrubberMode((m) => (m === "chapter" ? "book" : "chapter"));
          pagination.setIsScrubbing(false);
          onUserActivity();
        }}
        onScrubbingInput={(val) => {
          pagination.setIsScrubbing(true);
          if (pagination.scrubberMode === "chapter") {
            pagination.setScrubPage(val);
          } else {
            pagination.setScrubBookPercentage(val);
          }
          onUserActivity();
        }}
        onScrubbingChange={(val) => {
          if (pagination.scrubberMode === "chapter") {
            pagination.setCurrentPage(val);
          } else if (totalChars > 0) {
            const targetOffset = Math.round((val / 100) * totalChars);
            const chIdx = findCurrentChapter(chapters, targetOffset);
            pagination.jumpToOffset(targetOffset, chIdx);
          }
          pagination.setIsScrubbing(false);
          onUserActivity();
        }}
        onPrevChapter={() => {
          onUserActivity();
          pagination.goToPrevChapter();
        }}
        onPrevPage={() => {
          onUserActivity();
          pagination.goToPrevPage();
        }}
        onNextPage={() => {
          onUserActivity();
          pagination.goToNextPage();
        }}
        onNextChapter={() => {
          onUserActivity();
          pagination.goToNextChapter();
        }}
      />

      {/* 懸浮 TTS 語音朗讀控制小卡 */}
      <TTSPlayerWidget
        isOpen={showTTSPlayer}
        isPlaying={tts.isPlaying}
        isPaused={tts.isPaused}
        currentParagraphIdx={tts.currentParagraphIdx}
        totalParagraphs={processedParagraphs.length}
        rate={tts.rate}
        onClose={() => {
          tts.stop();
          setShowTTSPlayer(false);
        }}
        onPrevParagraph={() => tts.prevParagraph()}
        onTogglePlay={() => {
          if (tts.isPlaying && !tts.isPaused) {
            tts.pause();
          } else if (tts.isPaused) {
            tts.resume();
          } else {
            tts.startReading(processedParagraphs, 0);
          }
        }}
        onNextParagraph={() => tts.nextParagraph()}
        onSetRate={(rate) => tts.setRate(rate)}
      />

      {/* 書內全文檢索對話框 */}
      <ReaderSearchModal
        isOpen={searchHook.showSearchModal}
        searchQuery={searchHook.searchQuery}
        searchResults={searchHook.searchResults}
        isSearching={searchHook.isSearching}
        totalChars={totalChars}
        onSearchChange={(val) => {
          searchHook.setSearchQuery(val);
          searchHook.performSearch(val);
        }}
        onClose={() => searchHook.setShowSearchModal(false)}
        onJumpToResult={searchHook.jumpToSearchResult}
        onClearSearch={searchHook.clearSearch}
      />

      {/* 目錄與書籤抽屜 */}
      <TOCDrawer
        isOpen={showTOC}
        chapters={chapters}
        bookmarks={bookmarkHook.bookmarks}
        currentChapterIdx={currentChapterIdx}
        totalChars={totalChars}
        activeChapterBtnRef={pagination.activeChapterBtnRef}
        onClose={() => setShowTOC(false)}
        onJumpToChapter={(chapter) => {
          pagination.jumpToChapter(chapter);
          setShowTOC(false);
        }}
        onJumpToBookmark={(bm) => {
          bookmarkHook.jumpToBookmark(bm);
          setShowTOC(false);
        }}
        onDeleteBookmark={bookmarkHook.handleDeleteBookmark}
      />

      {/* 排版偏好抽屜 */}
      <ReaderSettingsDrawer
        isOpen={showSettings}
        theme={settings.theme}
        fontSize={settings.fontSize}
        lineHeight={settings.lineHeight}
        fontFamily={settings.fontFamily}
        maxWidthMode={settings.maxWidthMode}
        clickDirection={settings.clickDirection}
        chineseVariant={settings.chineseVariant}
        readMode={settings.readMode}
        textAlign={settings.textAlign}
        paddingMode={settings.paddingMode}
        onClose={() => setShowSettings(false)}
        onUpdateTheme={settings.updateTheme}
        onUpdateFontSize={settings.updateFontSize}
        onUpdateLineHeight={settings.updateLineHeight}
        onUpdateFontFamily={settings.updateFontFamily}
        onUpdateMaxWidth={settings.updateMaxWidth}
        onUpdateClickDirection={settings.updateClickDirection}
        onUpdateReadMode={settings.updateReadMode}
        onUpdateTextAlign={settings.updateTextAlign}
        onUpdatePaddingMode={settings.updatePaddingMode}
        onUpdateChineseVariant={settings.updateChineseVariant}
        onOpenGestureModal={() => {
          setShowSettings(false);
          setShowGestureModal(true);
        }}
      />

      {/* 滑鼠手勢軌跡繪製 */}
      <GestureOverlay
        config={gestureConfig}
        isActive={gestureState.isActive}
        trail={gestureState.trail}
        currentGesture={gestureState.currentGesture}
        actionName={gestureState.actionName}
        currentPos={gestureState.currentPos}
      />

      {/* 滑鼠手勢設定對話框 */}
      <GestureSettingsModal
        isOpen={showGestureModal}
        onClose={() => setShowGestureModal(false)}
        config={gestureConfig}
        onConfigChange={setGestureConfig}
      />
    </div>
  );
}
