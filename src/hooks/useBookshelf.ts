/**
 * @file useBookshelf.ts
 * @description 書架狀態與業務邏輯管理 Hook，封裝書籍獲取、離線快取同步、上傳、搜尋與排序
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Book } from "@/lib/db";
import { LocalStore, requestPersistentStorage } from "@/lib/idb";
import { getDeviceName, setCustomDeviceName } from "@/lib/device";
import { decodeToUtf8 } from "@/lib/encoding";
import { isSimplifiedChinese, convertToTraditional, convertToSimplified } from "@/lib/chinese";
import { flushAllSyncTasks } from "@/lib/sync";
import { parseEpub } from "@/lib/epub";
import { extractChapters } from "@/lib/parser";
import { parseSafeTime } from "@/lib/format";
import { SortField, SortOrder, ShelfLayoutMode, EditingBookState, CacheAllProgress } from "@/types/bookshelf";
import {
  UserSession,
  getCachedUserSession,
  setCachedUserSession,
  getCachedUserId,
  onAuthChange,
} from "@/lib/clientAuth";

export function useBookshelf() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [autoResume, setAutoResume] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [cachedStatus, setCachedStatus] = useState<Record<string, boolean>>({});
  const [localProgress, setLocalProgress] = useState<Record<string, any>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [isOffline, setIsOffline] = useState(false);
  const [currentTheme, setCurrentTheme] = useState("parchment");
  const [deviceName, setDeviceNameState] = useState("");
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [tempDeviceName, setTempDeviceName] = useState("");
  const [pendingSimplifiedFile, setPendingSimplifiedFile] = useState<File | null>(null);
  const [editingBook, setEditingBook] = useState<EditingBookState | null>(null);
  const [editTitleInput, setEditTitleInput] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [layoutMode, setLayoutMode] = useState<ShelfLayoutMode>("detailed");
  const [sortBy, setSortBy] = useState<SortField>("updated");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [rememberConversionChoice, setRememberConversionChoice] = useState(false);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [storageUsage, setStorageUsage] = useState(0);
  const [storageQuota, setStorageQuota] = useState(0);
  const [isCachingAll, setIsCachingAll] = useState(false);
  const [cacheAllProgress, setCacheAllProgress] = useState<CacheAllProgress | null>(null);
  const [cachingBookIds, setCachingBookIds] = useState<Record<string, boolean>>({});
  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => getCachedUserSession());
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSystemInfoModal, setShowSystemInfoModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const booksRef = useRef<Book[]>([]);
  const cachedStatusRef = useRef<Record<string, boolean>>({});
  const isFetchingBooksRef = useRef(false);
  const isFetchingAuthRef = useRef(false);

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

  useEffect(() => {
    cachedStatusRef.current = cachedStatus;
  }, [cachedStatus]);

  // 點擊主題選單外部自動關閉
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setShowThemeMenu(false);
      }
    };

    if (showThemeMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showThemeMenu]);

  // 檢查所有書籍快取與本機進度
  const checkAllCaches = useCallback(async (bookList: Book[], userId?: string) => {
    const cacheMap: Record<string, boolean> = {};
    const progMap: Record<string, any> = {};

    for (const book of bookList) {
      const cached = await LocalStore.isBookCached(book.id);
      cacheMap[book.id] = cached;

      if (cached) {
        // 同步伺服器書名至離線快取
        await LocalStore.updateBookTitle(book.id, book.title);
      }

      const prog = await LocalStore.getLocalProgress(book.id, userId || "default_user");
      if (prog) {
        progMap[book.id] = prog;
      }
    }
    setCachedStatus(cacheMap);
    setLocalProgress(progMap);

    // 若有已快取書籍，於背景預熱通用 Reader App Shell
    const firstCached = bookList.find((b) => cacheMap[b.id]);
    if (firstCached && typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
      setTimeout(() => {
        navigator.serviceWorker.controller?.postMessage({
          type: "WARMUP_READER",
          url: `/reader/${encodeURIComponent(firstCached.id)}`,
        });
      }, 1200);
    }
  }, []);

  // 背景閒置時自動快取未快取的書籍，確保隨時進入離線狀態均可秒開所有小說
  const prefetchUncachedBooks = useCallback(async (bookList: Book[]) => {
    if (typeof window === "undefined" || !navigator.onLine) return;

    // 優先快取前 8 本尚未快取的小說（避免大批並行阻塞網路）
    const uncached = bookList.filter((b) => !cachedStatusRef.current[b.id]).slice(0, 8);
    if (uncached.length === 0) return;

    for (const book of uncached) {
      if (!navigator.onLine) break;
      try {
        const isCachedAlready = await LocalStore.isBookCached(book.id);
        if (isCachedAlready) {
          setCachedStatus((prev) => ({ ...prev, [book.id]: true }));
          continue;
        }

        const res = await fetch(`/api/books/${book.id}/content`);
        if (res.ok) {
          const text = await res.text();
          if (text && (!text.startsWith('{"') || !text.includes('"success":false'))) {
            await LocalStore.saveBookContent(book.id, book.title, text, book.total_chars);
            setCachedStatus((prev) => ({ ...prev, [book.id]: true }));

            try {
              const metaRes = await fetch(`/api/books/${book.id}`);
              if (metaRes.ok) {
                const metaData = await metaRes.json();
                if (Array.isArray(metaData.chapters) && metaData.chapters.length > 0) {
                  await LocalStore.saveChapters(book.id, metaData.chapters);
                }
              }
            } catch (e) {}
          }
        }
      } catch (e) {
        // 背景預快取為非關鍵任務，略過
      }
    }
  }, []);

  // 取得書庫清單（離線優先 + 背景非同步雲端同步 + 本機快取智能合併）
  const fetchBooks = useCallback(async () => {
    if (isFetchingBooksRef.current) return;
    isFetchingBooksRef.current = true;

    // 1. 離線優先：僅在目前尚未有書單時才從 IndexedDB 載入，防止重複載入導致畫面閃爍
    if (booksRef.current.length === 0) {
      try {
        const [cachedList, localContentBooks, pendingUploads, removedIds] = await Promise.all([
          LocalStore.getSetting<Book[]>("cached_book_list", []),
          LocalStore.getAllCachedBooks(),
          LocalStore.getPendingUploads(),
          LocalStore.getRemovedBookIds(),
        ]);
        const removedSet = new Set(removedIds);

        const initialMap = new Map<string, Book>();
        for (const b of localContentBooks) {
          if (!removedSet.has(b.id)) initialMap.set(b.id, b);
        }
        for (const b of cachedList || []) {
          if (!removedSet.has(b.id)) initialMap.set(b.id, { ...initialMap.get(b.id), ...b });
        }
        for (const p of pendingUploads) {
          if (!removedSet.has(p.id) && !initialMap.has(p.id)) {
            initialMap.set(p.id, {
              id: p.id,
              title: p.title,
              file_name: `${p.id}.txt`,
              file_size: p.fileSize,
              total_chars: p.totalChars,
              created_at: p.createdAt,
              updated_at: p.createdAt,
            });
          }
        }

        const initialBooks = Array.from(initialMap.values());
        if (initialBooks.length > 0) {
          setBooks(initialBooks);
          setLoading(false);
          const activeUserId = getCachedUserId();
          checkAllCaches(initialBooks, activeUserId);
        }
      } catch (e) {
        console.warn("讀取本機離線快取失敗", e);
      }
    }

    // 2. 背景非阻塞發送請求與雲端/NAS 比對同步（強制 no-store，避免快取到舊身分）
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch("/api/books", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setCurrentUser(data.user);
          setCachedUserSession(data.user);
        }
        if (data.success && Array.isArray(data.books)) {
          const [pendingUploads, localContentBooks, removedIds] = await Promise.all([
            LocalStore.getPendingUploads(),
            LocalStore.getAllCachedBooks(),
            LocalStore.getRemovedBookIds(),
          ]);
          const removedSet = new Set(removedIds);

          // 伺服器上的所有書籍，過濾掉此客戶端已主動移除的書籍
          const serverBooks = (data.books as Book[]).filter((b) => !removedSet.has(b.id));
          const serverBookIds = new Set(serverBooks.map((b) => b.id));
          const pendingUploadMap = new Map(pendingUploads.map((p) => [p.id, p]));

          // 清除本機已被標記移除或在伺服器端不存在且不在待上傳佇列中的幽靈書籍快取
          for (const localBook of localContentBooks) {
            if (
              removedSet.has(localBook.id) ||
              (!serverBookIds.has(localBook.id) && !pendingUploadMap.has(localBook.id))
            ) {
              LocalStore.deleteBookContent(localBook.id).catch(console.warn);
            }
          }

          const mergedMap = new Map<string, Book>();

          // (A) 伺服器上的最新書籍（未被本機標記移除）
          for (const b of serverBooks) {
            mergedMap.set(b.id, b);
          }

          // (B) 本機離線新增但尚未上傳完成的書籍
          for (const p of pendingUploads) {
            if (!removedSet.has(p.id) && !mergedMap.has(p.id)) {
              mergedMap.set(p.id, {
                id: p.id,
                title: p.title,
                file_name: `${p.id}.txt`,
                file_size: p.fileSize,
                total_chars: p.totalChars,
                created_at: p.createdAt,
                updated_at: p.createdAt,
              });
            }
          }

          const mergedBooks = Array.from(mergedMap.values());
          setBooks(mergedBooks);
          setIsOffline(false);
          checkAllCaches(mergedBooks, data.user?.id);
          LocalStore.setSetting("cached_book_list", mergedBooks);

          // 自動同步待同步進度及離線上傳書籍
          flushAllSyncTasks().catch(console.warn);

          // 於背景閒置時自動快取未快取的書籍，確保隨時進入離線狀態也能秒開
          setTimeout(() => {
            prefetchUncachedBooks(mergedBooks);
          }, 1500);
        }
      } else {
        throw new Error("伺服器回應異常");
      }
    } catch (e) {
      console.warn("伺服器無法連線或逾時，保持離線快取模式", e);
      setIsOffline(true);
      if (booksRef.current.length === 0) {
        const [cached, localBooks, pendingUploads, removedIds] = await Promise.all([
          LocalStore.getSetting<Book[]>("cached_book_list", []),
          LocalStore.getAllCachedBooks(),
          LocalStore.getPendingUploads(),
          LocalStore.getRemovedBookIds(),
        ]);
        const removedSet = new Set(removedIds);
        const fallbackMap = new Map<string, Book>();
        for (const b of localBooks || []) if (!removedSet.has(b.id)) fallbackMap.set(b.id, b);
        for (const b of cached || []) if (!removedSet.has(b.id)) fallbackMap.set(b.id, { ...fallbackMap.get(b.id), ...b });
        for (const p of pendingUploads || []) {
          if (!removedSet.has(p.id) && !fallbackMap.has(p.id)) {
            fallbackMap.set(p.id, {
              id: p.id,
              title: p.title,
              file_name: `${p.id}.txt`,
              file_size: p.fileSize,
              total_chars: p.totalChars,
              created_at: p.createdAt,
              updated_at: p.createdAt,
            });
          }
        }
        const fallbackBooks = Array.from(fallbackMap.values());
        if (fallbackBooks.length > 0) {
          setBooks(fallbackBooks);
          checkAllCaches(fallbackBooks, getCachedUserId());
        }
      }
    } finally {
      setLoading(false);
      isFetchingBooksRef.current = false;
    }
  }, [checkAllCaches, prefetchUncachedBooks]);

  // 取得使用者驗證狀態（強制 no-store 杜絕訪客狀態快取）
  const fetchAuthSession = useCallback(async () => {
    if (isFetchingAuthRef.current) return;
    isFetchingAuthRef.current = true;
    try {
      const res = await fetch("/api/auth/session", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.user) {
            setCurrentUser(data.user);
            setCachedUserSession(data.user);
          } else {
            setCurrentUser(null);
            setCachedUserSession(null);
          }
          setGoogleConfigured(Boolean(data.googleConfigured));
          if (data.user?.id && booksRef.current.length > 0) {
            checkAllCaches(booksRef.current, data.user.id);
          }
        }
      }
    } catch (e) {
      console.warn("離線狀態，保持本機快取身分:", e);
    } finally {
      isFetchingAuthRef.current = false;
    }
  }, [checkAllCaches]);

  const handleLogout = useCallback(async () => {
    if (typeof window !== "undefined" && !navigator.onLine) {
      const proceed = confirm("目前為離線狀態，登出後需在有網路環境下才能重新登入。確定要在此裝置登出嗎？");
      if (!proceed) return;
    }
    try {
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
    } catch (e) {}
    setCachedUserSession(null);
    setCurrentUser(null);
    await fetchBooks();
  }, [fetchBooks]);

  const handleLoginSuccess = useCallback(
    (user: UserSession) => {
      setCurrentUser(user);
      setCachedUserSession(user);
      fetchBooks();
    },
    [fetchBooks]
  );

  // 初始化主題、偏好設定、網路監聽與接續閱讀檢查（僅在初次掛載執行）
  useEffect(() => {
    // 0. PWA / App 啟動自動接續上次閱讀檢查
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      // 清理登入成功後的 query 參數，避免重複閃動
      if (searchParams.has("login_success")) {
        searchParams.delete("login_success");
        const cleanSearch = searchParams.toString();
        const cleanUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : "");
        window.history.replaceState({}, "", cleanUrl);
      }

      const isManualShelf =
        searchParams.get("from") === "reader" || searchParams.get("shelf") === "1";

      const savedAutoResume = localStorage.getItem("novel_reader_auto_resume") !== "false";
      setAutoResume(savedAutoResume);

      const lastBookId = localStorage.getItem("novel_reader_last_book_id");

      if (savedAutoResume && lastBookId && !isManualShelf) {
        setIsRedirecting(true);
        window.location.replace(`/reader/${encodeURIComponent(lastBookId)}`);
        return;
      }
    }

    // 1. 主題
    const savedTheme = localStorage.getItem("novel_reader_theme") || "parchment";
    setCurrentTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);

    // 2. 版面檢視模式 (compact vs detailed)
    const savedLayout =
      (localStorage.getItem("novel_reader_shelf_layout") as ShelfLayoutMode) || "detailed";
    setLayoutMode(savedLayout);

    // 3. 排序偏好
    const savedSortBy = (localStorage.getItem("novel_reader_sort_by") as SortField) || "updated";
    const savedSortOrder = (localStorage.getItem("novel_reader_sort_order") as SortOrder) || "desc";
    setSortBy(savedSortBy);
    setSortOrder(savedSortOrder);

    // 4. 裝置名稱
    const devName = getDeviceName();
    setDeviceNameState(devName);
    setTempDeviceName(devName);

    // 5. Safari/iOS 持久儲存授權請求
    requestPersistentStorage().catch(console.warn);

    // 6. 離線/在線狀態監聽
    const handleOnline = () => {
      setIsOffline(false);
      flushAllSyncTasks()
        .then(() => fetchBooks())
        .catch(console.warn);
    };
    const handleOffline = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 7. 每次進入首頁書籍列表時觸發一次同步與最新書單載入（無背景輪詢以極大化省電）
    fetchAuthSession();
    fetchBooks();

    const unsubscribeAuth = onAuthChange((user) => {
      setCurrentUser(user);
    });

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsubscribeAuth();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetLayout = (mode: ShelfLayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem("novel_reader_shelf_layout", mode);
  };

  const handleSetSortBy = (field: SortField) => {
    setSortBy(field);
    localStorage.setItem("novel_reader_sort_by", field);
  };

  const handleToggleSortOrder = () => {
    const nextOrder: SortOrder = sortOrder === "asc" ? "desc" : "asc";
    setSortOrder(nextOrder);
    localStorage.setItem("novel_reader_sort_order", nextOrder);
  };

  const changeTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    document.documentElement.setAttribute("data-theme", themeId);
    localStorage.setItem("novel_reader_theme", themeId);
  };

  // 取得本機儲存空間用量
  const fetchStorageInfo = async () => {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        setStorageUsage(est.usage || 0);
        setStorageQuota(est.quota || 0);
      } catch (e) {
        console.warn("Storage estimate error:", e);
      }
    }
  };

  // 一鍵離線快取所有書籍
  const handleCacheAllBooks = async () => {
    if (typeof window !== "undefined" && !navigator.onLine) {
      alert("目前處於離線狀態，需連接網路才能下載雲端小說至本機快取。");
      return;
    }

    const uncached = books.filter((b) => !cachedStatus[b.id]);
    if (uncached.length === 0) {
      alert("所有書籍均已離線快取！");
      return;
    }

    setIsCachingAll(true);
    setCacheAllProgress({ current: 0, total: uncached.length });

    for (let i = 0; i < uncached.length; i++) {
      const book = uncached[i];
      try {
        const res = await fetch(`/api/books/${book.id}/content`);
        if (res.ok) {
          const text = await res.text();
          await LocalStore.saveBookContent(book.id, book.title, text, book.total_chars);
          setCachedStatus((prev) => ({ ...prev, [book.id]: true }));

          // 並行快取章節索引，達成大長篇秒開
          try {
            const metaRes = await fetch(`/api/books/${book.id}`);
            if (metaRes.ok) {
              const metaData = await metaRes.json();
              if (Array.isArray(metaData.chapters) && metaData.chapters.length > 0) {
                await LocalStore.saveChapters(book.id, metaData.chapters);
              }
            }
          } catch (e) {}
        }
      } catch (e) {
        console.warn(`Failed to cache ${book.title}:`, e);
      }
      setCacheAllProgress({ current: i + 1, total: uncached.length });
    }

    setIsCachingAll(false);
    setCacheAllProgress(null);
    fetchStorageInfo();
  };

  // 清除所有本機快取小說文字
  const handleClearAllCaches = async () => {
    if (!confirm("確定要清除所有本機離線快取的小說文本嗎？（這不會刪除雲端書籍與閱讀進度）")) {
      return;
    }
    for (const book of books) {
      await LocalStore.clearBookContentOnly(book.id);
    }
    const newStatus: Record<string, boolean> = {};
    books.forEach((b) => {
      newStatus[b.id] = false;
    });
    setCachedStatus(newStatus);
    fetchStorageInfo();
    alert("已成功清除所有本機快取！");
  };

  // 上傳單一檔案（支援離線優先上傳 + 前端解析 + 待連網自動同步）
  const uploadFile = async (file: File, convertToTraditionalChoice: boolean) => {
    setIsUploading(true);
    const isEpub = file.name.toLowerCase().endsWith(".epub");
    setUploadStatus(
      isEpub
        ? "正在解析 EPUB 電子書結構..."
        : convertToTraditionalChoice
        ? "正在解析編碼並轉換為正體..."
        : "正在解析編碼..."
    );

    try {
      const originalName = file.name;
      let text = "";
      let detectedTitle = originalName.replace(/\.[^/.]+$/, "").trim() || "未命名小說";

      const arrayBuf = await file.arrayBuffer();

      if (isEpub) {
        const parsed = await parseEpub(arrayBuf);
        text = parsed.text;
        if (parsed.title && parsed.title !== "未命名小說") {
          detectedTitle = parsed.title;
        }
      } else {
        const decoded = decodeToUtf8(new Uint8Array(arrayBuf));
        text = decoded.text;
      }

      if (!text || text.trim().length === 0) {
        throw new Error("小說檔案內容為空或無法讀取");
      }

      let sanitizedTitle = detectedTitle;
      if (convertToTraditionalChoice) {
        text = convertToTraditional(text);
        sanitizedTitle = convertToTraditional(sanitizedTitle);
      }

      // 生成本機唯一 Book ID
      const bookId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const totalChars = text.length;
      const fileSize = file.size;

      // 前端預先解析章節
      const parsedChapters = extractChapters(text);

      // 1. 立刻持久化至本機 IndexedDB (0延遲，使用者離線立刻能開讀)
      await LocalStore.saveBookContent(bookId, sanitizedTitle, text, totalChars);
      await LocalStore.saveChapters(bookId, parsedChapters);
      await LocalStore.unmarkBookRemoved(bookId);

      const newBook: Book = {
        id: bookId,
        title: sanitizedTitle,
        file_name: `${bookId}.txt`,
        file_size: fileSize,
        total_chars: totalChars,
        uploader_id: currentUser?.id || "default_user",
        uploader_name:
          currentUser?.name ||
          (typeof navigator !== "undefined" && !navigator.onLine ? "離線本機" : "訪客"),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 2. 嘗試立即同步至伺服器（若在線且連線成功）
      let syncedToServer = false;
      if (typeof navigator !== "undefined" && navigator.onLine) {
        try {
          setUploadStatus("正在同步至雲端伺服器...");
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          const uploadTxtFile = new File([blob], `${sanitizedTitle}.txt`, { type: "text/plain" });

          const formData = new FormData();
          formData.append("file", uploadTxtFile);
          formData.append("title", sanitizedTitle);
          formData.append("id", bookId);

          const res = await fetch("/api/books", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const resData = await res.json();
            if (resData.success) {
              syncedToServer = true;
            }
          }
        } catch (netErr) {
          console.warn("在線上傳失敗，轉為離線隊列等待自動同步:", netErr);
        }
      }

      // 3. 若未同步至伺服器（離線或連線失敗），存入待同步隊列
      if (!syncedToServer) {
        await LocalStore.savePendingUpload({
          id: bookId,
          title: sanitizedTitle,
          content: text,
          fileSize,
          totalChars,
          originalFileName: originalName,
          convertToTraditional: convertToTraditionalChoice,
          createdAt: new Date().toISOString(),
        });
        setUploadStatus("已儲存至本機離線書架！將在連線後自動同步至雲端。");
      } else {
        setUploadStatus("上傳並同步至雲端成功！");
      }

      // 4. 更新書架列表狀態
      setBooks((prev) => {
        const updated = [newBook, ...prev.filter((b) => b.id !== bookId)];
        LocalStore.setSetting("cached_book_list", updated);
        return updated;
      });
      setCachedStatus((prev) => ({ ...prev, [bookId]: true }));

      // 預熱閱讀器 App Shell
      if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: "WARMUP_READER",
          url: `/reader/${encodeURIComponent(bookId)}`,
        });
      }

      // 若在線上傳成功，再次觸發 fetchBooks 確保伺服器最新資訊
      if (syncedToServer) {
        await fetchBooks();
      }

      setTimeout(() => {
        setIsUploading(false);
        setUploadStatus(null);
      }, 1800);
    } catch (e: any) {
      alert("解析或儲存小說出錯：" + e.message);
      setIsUploading(false);
      setUploadStatus(null);
    }
  };

  // 選擇檔案時偵測編碼與簡繁體
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // 重置 input value 以便連續選取相同檔案時仍能觸發
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    const isTxt = file.name.toLowerCase().endsWith(".txt");
    const isEpub = file.name.toLowerCase().endsWith(".epub");

    if (!isTxt && !isEpub) {
      alert("目前支援 .txt 與 .epub 格式小說");
      return;
    }

    if (isEpub) {
      uploadFile(file, false);
      return;
    }

    // 取前 128KB 採樣自動判斷編碼與繁簡
    try {
      const slice = file.slice(0, 131072);
      const arrayBuf = await slice.arrayBuffer();
      const { text, detectedEncoding } = decodeToUtf8(new Uint8Array(arrayBuf));

      const isSimplified = isSimplifiedChinese(text, detectedEncoding);

      if (isSimplified) {
        setPendingSimplifiedFile(file);
      } else {
        uploadFile(file, false);
      }
    } catch (e) {
      console.error("Error detecting file encoding/simplified Chinese:", e);
      uploadFile(file, false);
    }
  };

  const handleConfirmSimplifiedChoice = (convertToTraditionalChoice: boolean) => {
    if (!pendingSimplifiedFile) return;
    if (rememberConversionChoice) {
      localStorage.setItem(
        "novel_reader_auto_convert_traditional",
        convertToTraditionalChoice ? "true" : "false"
      );
    }
    const file = pendingSimplifiedFile;
    setPendingSimplifiedFile(null);
    uploadFile(file, convertToTraditionalChoice);
  };

  // 快取單本書籍
  const handleCacheBook = async (e: React.MouseEvent, book: Book) => {
    e.preventDefault();
    e.stopPropagation();

    if (typeof window !== "undefined" && !navigator.onLine) {
      alert("目前為離線狀態，無法下載雲端小說。請連接網路後再試。");
      return;
    }

    if (cachingBookIds[book.id]) return;
    setCachingBookIds((prev) => ({ ...prev, [book.id]: true }));

    try {
      const res = await fetch(`/api/books/${book.id}/content`);
      if (res.ok) {
        const text = await res.text();
        if (text && (!text.startsWith('{"') || !text.includes('"success":false'))) {
          await LocalStore.saveBookContent(book.id, book.title, text, book.total_chars);
          setCachedStatus((prev) => ({ ...prev, [book.id]: true }));

          // 並行快取章節索引結構
          try {
            const metaRes = await fetch(`/api/books/${book.id}`);
            if (metaRes.ok) {
              const metaData = await metaRes.json();
              if (Array.isArray(metaData.chapters) && metaData.chapters.length > 0) {
                await LocalStore.saveChapters(book.id, metaData.chapters);
              }
            }
          } catch (e) {}

          // 預熱閱讀器 App Shell，確保完全斷網時冷啟動此書籍毫無阻礙
          if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: "WARMUP_READER",
              url: `/reader/${encodeURIComponent(book.id)}`,
            });
          }
        } else {
          throw new Error("伺服器回應內容異常");
        }
      } else {
        throw new Error(`下載失敗 (${res.status})`);
      }
    } catch (err: any) {
      alert("快取下載失敗，請檢查網路連線：" + (err?.message || ""));
    } finally {
      setCachingBookIds((prev) => ({ ...prev, [book.id]: false }));
    }
  };

  // 移除本機書籍（僅刪除此客戶端的離線檔案與閱讀記錄，完全不影響伺服器與其他使用者）
  const handleDeleteBook = async (e: React.MouseEvent, book: Book) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      !confirm(
        `確定要從此裝置的書架移除《${book.title}》嗎？\n\n（僅會清除此客戶端的本機檔案與進度，不會刪除伺服器雲端備份，亦不影響其他正在閱讀的小說使用者）`
      )
    ) {
      return;
    }

    try {
      // 1. 標記為本機已移除書籍，防止後續雲端同步再次自動加回此裝置
      await LocalStore.markBookRemoved(book.id);

      // 2. 清理本機待上傳隊列與 IndexedDB 快取、章節與進度
      await LocalStore.removePendingUpload(book.id);
      await LocalStore.deleteBookContent(book.id);

      // 3. 更新書架狀態
      setBooks((prev) => {
        const next = prev.filter((b) => b.id !== book.id);
        LocalStore.setSetting("cached_book_list", next);
        return next;
      });

      if (
        typeof window !== "undefined" &&
        localStorage.getItem("novel_reader_last_book_id") === book.id
      ) {
        localStorage.removeItem("novel_reader_last_book_id");
      }
    } catch (err) {
      alert("移除書籍失敗");
    }
  };

  // 開啟書名編輯
  const handleOpenRename = (e: React.MouseEvent, book: Book) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingBook({ id: book.id, title: book.title });
    setEditTitleInput(book.title);
  };

  // 儲存更名
  const handleSaveTitle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingBook) return;
    const trimmed = editTitleInput.trim();
    if (!trimmed) {
      alert("書名不能為空");
      return;
    }
    if (trimmed === editingBook.title) {
      setEditingBook(null);
      return;
    }

    setIsSavingTitle(true);
    try {
      const res = await fetch(`/api/books/${editingBook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "更新書名失敗");
      }

      await LocalStore.updateBookTitle(editingBook.id, trimmed);

      setBooks((prev) => {
        const updated = prev.map((b) => (b.id === editingBook.id ? { ...b, title: trimmed } : b));
        LocalStore.setSetting("cached_book_list", updated);
        return updated;
      });
      setEditingBook(null);
    } catch (err: any) {
      alert(err.message || "更新書名失敗");
    } finally {
      setIsSavingTitle(false);
    }
  };

  // 儲存自訂裝置名稱
  const handleSaveDeviceName = () => {
    if (tempDeviceName.trim()) {
      setCustomDeviceName(tempDeviceName.trim());
      setDeviceNameState(tempDeviceName.trim());
      setShowDeviceModal(false);
    }
  };

  // 搜尋與排序過濾後的書庫清單
  const filteredBooks = useMemo(() => {
    const rawQ = searchTerm.trim().toLowerCase();
    const tradQ = convertToTraditional(rawQ).toLowerCase();
    const simpQ = convertToSimplified(rawQ).toLowerCase();

    const list = books.filter((b) => {
      if (!rawQ) return true;
      const lowerTitle = (b.title || "").toLowerCase();
      return lowerTitle.includes(rawQ) || lowerTitle.includes(tradQ) || lowerTitle.includes(simpQ);
    });

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "title") {
        cmp = (a.title || "").localeCompare(b.title || "", "zh-Hant");
      } else if (sortBy === "progress") {
        const aProg = localProgress[a.id]?.percentage ?? a.percentage ?? 0;
        const bProg = localProgress[b.id]?.percentage ?? b.percentage ?? 0;
        cmp = aProg - bProg;
      } else if (sortBy === "chars") {
        const aChars = a.total_chars || 0;
        const bChars = b.total_chars || 0;
        cmp = aChars - bChars;
      } else {
        const aTime = Math.max(
          parseSafeTime(localProgress[a.id]?.updated_at),
          parseSafeTime(a.progress_updated_at),
          parseSafeTime(a.created_at)
        );
        const bTime = Math.max(
          parseSafeTime(localProgress[b.id]?.updated_at),
          parseSafeTime(b.progress_updated_at),
          parseSafeTime(b.created_at)
        );
        cmp = aTime - bTime;
      }

      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [books, searchTerm, sortBy, sortOrder, localProgress]);

  return {
    books,
    loading,
    isRedirecting,
    autoResume,
    setAutoResume,
    isUploading,
    uploadStatus,
    cachedStatus,
    localProgress,
    searchTerm,
    setSearchTerm,
    isOffline,
    currentTheme,
    changeTheme,
    deviceName,
    showDeviceModal,
    setShowDeviceModal,
    tempDeviceName,
    setTempDeviceName,
    pendingSimplifiedFile,
    setPendingSimplifiedFile,
    editingBook,
    setEditingBook,
    editTitleInput,
    setEditTitleInput,
    isSavingTitle,
    layoutMode,
    handleSetLayout,
    sortBy,
    handleSetSortBy,
    sortOrder,
    handleToggleSortOrder,
    showThemeMenu,
    setShowThemeMenu,
    rememberConversionChoice,
    setRememberConversionChoice,
    showStorageModal,
    setShowStorageModal,
    storageUsage,
    storageQuota,
    fetchStorageInfo,
    isCachingAll,
    cacheAllProgress,
    cachingBookIds,
    fileInputRef,
    themeMenuRef,
    fetchBooks,
    handleCacheAllBooks,
    handleClearAllCaches,
    handleFileSelect,
    handleConfirmSimplifiedChoice,
    handleCacheBook,
    handleDeleteBook,
    handleOpenRename,
    handleSaveTitle,
    handleSaveDeviceName,
    filteredBooks,
    currentUser,
    googleConfigured,
    showAuthModal,
    setShowAuthModal,
    showSystemInfoModal,
    setShowSystemInfoModal,
    handleLogout,
    handleLoginSuccess,
  };
}
