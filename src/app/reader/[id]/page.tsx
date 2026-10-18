"use client";

/**
 * @file page.tsx
 * @description 閱讀器核心頁面容器組件，整合資料載入、排版設定、分頁與連續滾動導航
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { LocalStore } from "@/lib/idb";
import { extractChapters, Chapter, findCurrentChapter } from "@/lib/parser";
import { convertToTraditional, convertToSimplified } from "@/lib/chinese";
import { useTouchGesture } from "@/hooks/useTouchGesture";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useReaderSettings } from "@/hooks/useReaderSettings";
import { useReaderPagination } from "@/hooks/useReaderPagination";
import { parseSafeTime } from "@/lib/format";
import { ReaderHeader } from "@/components/reader/ReaderHeader";
import { ReaderFooter } from "@/components/reader/ReaderFooter";
import { PaginatedViewport } from "@/components/reader/PaginatedViewport";
import { ContinuousViewport } from "@/components/reader/ContinuousViewport";
import { TOCDrawer } from "@/components/reader/TOCDrawer";
import { ReaderSettingsDrawer } from "@/components/reader/ReaderSettingsDrawer";
import { ReaderToasts } from "@/components/reader/ReaderToasts";

function resolveBookIdFromLocation(paramId: string): string {
  if (typeof window !== "undefined") {
    const match = window.location.pathname.match(/^\/reader\/([^/?#]+)/);
    if (match && match[1] && match[1] !== "__shell__") {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return paramId && paramId !== "__shell__" ? paramId : "";
}

export default function ReaderPage() {
  const params = useParams();
  const router = useRouter();
  const rawParamId = (params?.id as string) || "";
  const [bookId, setBookId] = useState<string>(() =>
    resolveBookIdFromLocation(rawParamId)
  );

  useEffect(() => {
    const resolved = resolveBookIdFromLocation(rawParamId);
    if (resolved && resolved !== bookId) {
      setBookId(resolved);
    }
  }, [rawParamId, bookId]);

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
    if (!currentChapterParagraphs || currentChapterParagraphs.length === 0)
      return [];
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
    isContentReady: !isLoading,
    readMode: settings.readMode,
  });

  useEffect(() => {
    if (!bookId || bookId === "__shell__") return;

    localStorage.setItem("novel_reader_last_book_id", bookId);

    const loadBookData = async () => {
      setIsLoading(true);
      let bookText = "";
      let bookTitle = "未知小說";
      let bookChars = 0;
      let serverChapters: Chapter[] | null = null;
      let serverProgress: any = null;

      // 1. 嘗試向伺服器取得最新書本資訊與進度，並檢查本機快取是否已有內文
      const cached = await LocalStore.getBookContent(bookId);
      if (cached && cached.content) {
        bookText = cached.content;
        bookTitle = cached.title;
        bookChars = cached.total_chars;
      }

      const metaController = new AbortController();
      const metaTimeout = setTimeout(
        () => metaController.abort(),
        cached?.content ? 2500 : 8000
      );

      try {
        const metaRes = await fetch(`/api/books/${encodeURIComponent(bookId)}`, {
          cache: "no-store",
          signal: metaController.signal,
        });

        if (metaRes.ok) {
          const metaData = await metaRes.json();
          if (metaData.book) {
            bookTitle = metaData.book.title || bookTitle;
            if (typeof metaData.book.char_offset === "number") {
              serverProgress = {
                char_offset: metaData.book.char_offset,
                percentage: metaData.book.percentage || 0,
                device_name: metaData.book.last_device || "雲端同步",
                updated_at: metaData.book.progress_updated_at,
                chapter_index: metaData.book.chapter_index,
                page_index: metaData.book.page_index,
                page_ratio: metaData.book.page_ratio,
                total_pages: metaData.book.total_pages,
              };
            }
          }
          if (Array.isArray(metaData.chapters) && metaData.chapters.length > 0) {
            serverChapters = metaData.chapters;
          }
        } else if (metaRes.status === 404) {
          localStorage.removeItem("novel_reader_last_book_id");
          await LocalStore.deleteBookContent(bookId);
          alert("找不到該小說（可能已被刪除）。");
          router.push("/?from=reader");
          return;
        }
      } catch (err) {
        console.warn("取得書籍元資料失敗，嘗試使用本機快取:", err);
      } finally {
        clearTimeout(metaTimeout);
      }

      // 2. 若本機尚未快取內文，從伺服器下載內文並存入輕量快取
      if (!bookText) {
        try {
          const contentRes = await fetch(
            `/api/books/${encodeURIComponent(bookId)}/content`
          );
          if (!contentRes.ok) {
            throw new Error("無法讀取小說內容");
          }
          const rawContent = await contentRes.text();
          if (
            !rawContent ||
            (rawContent.startsWith('{"') && rawContent.includes('"success":false'))
          ) {
            throw new Error("取得小說內文格式異常");
          }
          bookText = rawContent;
          bookChars = bookText.length;
          await LocalStore.saveBookContent(bookId, bookTitle, bookText, bookChars);
        } catch (err) {
          console.error(err);
          alert(
            typeof navigator !== "undefined" && !navigator.onLine
              ? "目前離線，且此書尚未下載到本機。請連線後開啟一次。"
              : "無法載入小說，請稍後再試。"
          );
          router.push("/?from=reader");
          return;
        }
      }

      setTitle(bookTitle);
      setFullText(bookText);
      setTotalChars(bookChars);

      // 3. 取得或解析章節清單
      let parsedChapters: Chapter[] | null = serverChapters;
      if (!parsedChapters || parsedChapters.length === 0) {
        parsedChapters = await LocalStore.getChapters(bookId);
      }
      if (!parsedChapters || parsedChapters.length === 0) {
        parsedChapters = extractChapters(bookText);
      }
      LocalStore.saveChapters(bookId, parsedChapters).catch(() => {});
      setChapters(parsedChapters);

      // 4. 比對伺服器進度與本機進度，選取最新者直接還原（無煩人的衝突彈窗）
      const localProg = await LocalStore.getLocalProgress(bookId);
      const serverTime = serverProgress ? parseSafeTime(serverProgress.updated_at) : 0;
      const localTime = localProg ? parseSafeTime(localProg.updated_at) : 0;

      const activeProg = serverTime >= localTime && serverProgress ? serverProgress : localProg;

      if (serverTime > localTime && serverProgress) {
        LocalStore.saveLocalProgress(
          bookId,
          serverProgress.char_offset,
          serverProgress.percentage,
          serverProgress.device_name || "雲端同步",
          serverProgress.updated_at,
          {
            chapter_index: serverProgress.chapter_index,
            page_index: serverProgress.page_index,
            page_ratio: serverProgress.page_ratio,
            total_pages: serverProgress.total_pages,
          }
        ).catch(() => {});
      } else if (localTime > serverTime + 1000 && localProg && localProg.char_offset > 0) {
        fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            book_id: bookId,
            char_offset: localProg.char_offset,
            percentage: localProg.percentage,
            device_name: localProg.device_name,
            updated_at: localProg.updated_at,
            chapter_index: localProg.chapter_index,
            page_index: localProg.page_index,
            page_ratio: localProg.page_ratio,
            total_pages: localProg.total_pages,
          }),
        }).catch(() => {});
      }

      let targetOffset = 0;
      let targetChapterIdx = 0;
      let targetPageRatio: number | undefined;
      let targetPageIndex: number | undefined;
      let targetTotalPages: number | undefined;

      if (activeProg) {
        targetOffset = activeProg.char_offset || 0;
        if (
          typeof activeProg.chapter_index === "number" &&
          activeProg.chapter_index >= 0 &&
          activeProg.chapter_index < parsedChapters.length
        ) {
          targetChapterIdx = activeProg.chapter_index;
        } else {
          targetChapterIdx = findCurrentChapter(parsedChapters, targetOffset);
        }
        if (typeof activeProg.page_ratio === "number") {
          targetPageRatio = activeProg.page_ratio;
        }
        if (typeof activeProg.page_index === "number") {
          targetPageIndex = activeProg.page_index;
        }
        if (typeof activeProg.total_pages === "number") {
          targetTotalPages = activeProg.total_pages;
        }
      }

      setIsLoading(false);
      pagination.restoreProgress({
        offset: targetOffset,
        chapterIndex: targetChapterIdx,
        pageIndex: targetPageIndex,
        pageRatio: targetPageRatio,
        totalPages: targetTotalPages,
      });
    };

    loadBookData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const handleBackToShelf = useCallback(() => {
    pagination.syncCurrentProgressToServer();
    router.push("/?from=reader");
  }, [pagination, router]);

  const getFullscreenElement = () => {
    if (typeof document === "undefined") return null;
    return (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      null
    );
  };

  // 全螢幕切換（僅由全螢幕按鈕或快捷鍵觸發）
  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    const elem = document.documentElement as any;
    if (!getFullscreenElement()) {
      const req = elem.requestFullscreen || elem.webkitRequestFullscreen;
      if (req) {
        req
          .call(elem)
          .then(() => setIsFullscreen(true))
          .catch(console.warn);
      }
    } else {
      const exit =
        document.exitFullscreen || (document as any).webkitExitFullscreen;
      if (exit) {
        exit
          .call(document)
          .then(() => setIsFullscreen(false))
          .catch(console.warn);
      }
    }
  }, []);

  // 切換工具列（修復先前強制連帶切換瀏覽器全螢幕的 Bug）
  const handleToggleToolbar = useCallback(() => {
    setShowToolbar((prev) => !prev);
  }, []);

  // 同步全螢幕狀態
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // 鍵盤導航快捷鍵
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showTOC || showSettings) return;

      if (settings.readMode === "continuous") {
        const scrollEl = pagination.scrollContainerRef.current;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          scrollEl?.scrollBy({ top: 80, behavior: "smooth" });
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          scrollEl?.scrollBy({ top: -80, behavior: "smooth" });
        } else if (e.key === "PageDown" || e.key === " ") {
          e.preventDefault();
          if (scrollEl) {
            const isNearBottom =
              scrollEl.scrollTop + scrollEl.clientHeight >=
              scrollEl.scrollHeight - 30;
            if (isNearBottom) {
              pagination.goToNextChapter();
            } else {
              scrollEl.scrollBy({
                top: scrollEl.clientHeight * 0.8,
                behavior: "smooth",
              });
            }
          }
        } else if (e.key === "PageUp") {
          e.preventDefault();
          if (scrollEl) {
            if (scrollEl.scrollTop <= 10) {
              pagination.goToPrevChapter();
            } else {
              scrollEl.scrollBy({
                top: -scrollEl.clientHeight * 0.8,
                behavior: "smooth",
              });
            }
          }
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          pagination.goToNextChapter();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          pagination.goToPrevChapter();
        } else if (e.key === "f" || e.key === "F") {
          toggleFullscreen();
        }
        return;
      }

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
    settings.readMode,
    toggleFullscreen,
    showTOC,
    showSettings,
  ]);

  // 觸控手勢 Hook（僅在左右分頁模式啟用滑動翻頁與點擊翻頁）
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
        handleToggleToolbar();
      }
    },
    enabled: !isLoading && settings.readMode === "paginated",
  });

  // 全書百分比計算
  const currentPercentage = useMemo(() => {
    if (!totalChars) return 0;
    return Number(((pagination.currentOffset / totalChars) * 100).toFixed(1));
  }, [pagination.currentOffset, totalChars]);

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col select-text bg-[var(--bg-color)] text-[var(--text-color)]">
      {/* 頂部懸浮資訊列 */}
      <ReaderHeader
        showToolbar={showToolbar}
        title={title}
        processedChapterTitle={processedChapterTitle}
        onBackToShelf={handleBackToShelf}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* 章節切換通知提示 */}
      <ReaderToasts chapterSwitchToast={pagination.chapterSwitchToast} />

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
          lastTouchActionTime={lastTouchActionTime}
          onPrevPage={pagination.goToPrevPage}
          onNextPage={pagination.goToNextPage}
          onToggleToolbar={handleToggleToolbar}
          onActivity={onUserActivity}
        />
      ) : (
        <ContinuousViewport
          scrollContainerRef={pagination.scrollContainerRef}
          paddingClass={settings.paddingClass}
          maxWidthClass={settings.maxWidthClass}
          currentFontClass={settings.currentFontClass}
          fontSize={settings.fontSize}
          lineHeight={settings.lineHeight}
          textAlign={settings.textAlign}
          processedChapterTitle={processedChapterTitle}
          processedParagraphs={processedParagraphs}
          isLoading={isLoading}
          currentChapterIdx={currentChapterIdx}
          totalChapters={chapters.length}
          onScroll={pagination.handleContinuousScroll}
          onToggleToolbar={handleToggleToolbar}
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
        showTOC={showTOC}
        showSettings={showSettings}
        isFullscreen={isFullscreen}
        onBackToShelf={handleBackToShelf}
        onToggleTOC={() => setShowTOC(!showTOC)}
        onToggleSettings={() => setShowSettings(!showSettings)}
        onToggleFullscreen={toggleFullscreen}
        onToggleScrubberMode={() => {
          pagination.setScrubberMode((m) =>
            m === "chapter" ? "book" : "chapter"
          );
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

      {/* 章節目錄抽屜 */}
      <TOCDrawer
        isOpen={showTOC}
        chapters={chapters}
        currentChapterIdx={currentChapterIdx}
        totalChars={totalChars}
        activeChapterBtnRef={pagination.activeChapterBtnRef}
        onClose={() => setShowTOC(false)}
        onJumpToChapter={(chapter) => {
          pagination.jumpToChapter(chapter);
          setShowTOC(false);
        }}
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
        brightness={settings.brightness}
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
        onUpdateBrightness={settings.updateBrightness}
      />

      {/* 閱讀器亮度調整遮罩 */}
      {settings.brightness < 100 && (
        <div
          className="fixed inset-0 pointer-events-none transition-opacity duration-150"
          style={{
            backgroundColor: "#000",
            opacity: (100 - settings.brightness) / 100,
            zIndex: 9999,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
