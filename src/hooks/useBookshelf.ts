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
import { flushUnsyncedProgress } from "@/lib/sync";
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const isSyncingMissingRef = useRef(false);

  // 自動檢測並補救同步「本機 IndexedDB 存在但伺服器端 SQLite 缺失」的小說文本
  const syncLocalMissingBooksToServer = useCallback(
    async (localBooks: Book[], serverBooks: Book[]) => {
      if (isSyncingMissingRef.current) return;
      const serverIds = new Set(serverBooks.map((b) => b.id));
      const missing = localBooks.filter((b) => b.id && !serverIds.has(b.id));

      if (missing.length === 0) return;

      isSyncingMissingRef.current = true;
      try {
        for (const b of missing) {
          const cached = await LocalStore.getBookContent(b.id);
          if (!cached || !cached.content || cached.content.length === 0) continue;

          console.log(
            `[SyncRecovery] 偵測到本機存在但伺服器缺失書籍《${b.title}》(${b.id})，自動補救同步至後端 SQLite...`
          );
          const blob = new Blob([cached.content], { type: "text/plain;charset=utf-8" });
          const file = new File([blob], `${b.title}.txt`, { type: "text/plain" });
          const formData = new FormData();
          formData.append("file", file);
          formData.append("title", b.title);
          formData.append("id", b.id);

          const res = await fetch("/api/books", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const resData = await res.json();
            if (resData.success) {
              console.log(`[SyncRecovery] 書籍《${b.title}》(${b.id}) 已成功自動補救同步回伺服器 SQLite！`);
            }
          }
        }
      } catch (err) {
        console.warn("[SyncRecovery] 自動補救同步異常:", err);
      } finally {
        isSyncingMissingRef.current = false;
      }
    },
    []
  );

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

  // 取得書庫清單（離線優先 + 背景非同步雲端同步 + 本機快取智能合併）
  const fetchBooks = useCallback(async () => {
    // 1. 離線優先：立即讀取本機快取與 IndexedDB 內容，做到 0 延遲秒開畫面，且防止離線書籍被拋棄
    try {
      const [cachedList, localContentBooks] = await Promise.all([
        LocalStore.getSetting<Book[]>("cached_book_list", []),
        LocalStore.getAllCachedBooks(),
      ]);

      const initialMap = new Map<string, Book>();
      // 先放 IndexedDB 內實體快取的書
      for (const b of localContentBooks) {
        initialMap.set(b.id, b);
      }
      // 再放先前快取的列表（補充可能有的章節、字數等後設資料）
      for (const b of cachedList || []) {
        initialMap.set(b.id, { ...initialMap.get(b.id), ...b });
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

    // 2. 背景非阻塞發送請求與雲端/NAS 比對同步
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch("/api/books", { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setCurrentUser(data.user);
          setCachedUserSession(data.user);
        }
        if (data.success && Array.isArray(data.books)) {
          // 關鍵修正：將伺服器書籍與本機 IndexedDB 快取書籍合併，絕不單向覆寫遺失本機書籍
          const localContentBooks = await LocalStore.getAllCachedBooks();
          const mergedMap = new Map<string, Book>();

          // 先填入本機 IndexedDB 實體快取書（防止伺服器端缺少或斷開時被消除）
          for (const b of localContentBooks) {
            mergedMap.set(b.id, b);
          }

          // 再以伺服器回傳的權威書單補充/更新
          for (const b of data.books as Book[]) {
            mergedMap.set(b.id, {
              ...mergedMap.get(b.id),
              ...b,
            });
          }

          const mergedBooks = Array.from(mergedMap.values());
          setBooks(mergedBooks);
          setIsOffline(false);
          checkAllCaches(mergedBooks, data.user?.id);
          LocalStore.setSetting("cached_book_list", mergedBooks);
          flushUnsyncedProgress().catch(console.warn);

          // 核心修復：若手機本機 IndexedDB 有完整小說，但伺服器端 SQLite 未記錄，主動背景補救同步回後端！
          syncLocalMissingBooksToServer(localContentBooks, data.books as Book[]).catch(console.warn);
        }
      } else {
        throw new Error("伺服器回應異常");
      }
    } catch (e) {
      console.warn("伺服器無法連線或逾時，保持離線快取模式", e);
      setIsOffline(true);
      const [cached, localBooks] = await Promise.all([
        LocalStore.getSetting<Book[]>("cached_book_list", []),
        LocalStore.getAllCachedBooks(),
      ]);
      const fallbackMap = new Map<string, Book>();
      for (const b of localBooks || []) {
        fallbackMap.set(b.id, b);
      }
      for (const b of cached || []) {
        fallbackMap.set(b.id, { ...fallbackMap.get(b.id), ...b });
      }
      const fallbackBooks = Array.from(fallbackMap.values());
      if (fallbackBooks.length > 0) {
        setBooks(fallbackBooks);
        checkAllCaches(fallbackBooks, getCachedUserId());
      }
    } finally {
      setLoading(false);
    }
  }, [checkAllCaches, syncLocalMissingBooksToServer]);

  // 取得使用者驗證狀態
  const fetchAuthSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCurrentUser(data.user || null);
          setCachedUserSession(data.user || null);
          setGoogleConfigured(Boolean(data.googleConfigured));
          if (data.user?.id) {
            checkAllCaches(books, data.user.id);
          }
        }
      }
    } catch (e) {
      console.warn("離線狀態，保持本機快取身分:", e);
    }
  }, [books, checkAllCaches]);

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

  // 初始化主題、偏好設定、網路監聽與接續閱讀檢查
  useEffect(() => {
    // 0. PWA / App 啟動自動接續上次閱讀檢查
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
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

    // 6. 離線/在線監聽
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 7. 載入使用者身分與書籍
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
  }, [fetchAuthSession, fetchBooks]);

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

  // 上傳單一檔案
  const uploadFile = async (file: File, convertToTraditional: boolean) => {
    if (typeof window !== "undefined" && !navigator.onLine) {
      alert("目前處於離線狀態，無法上傳新小說至雲端，請連接網路後再試。");
      return;
    }

    setIsUploading(true);
    const isEpub = file.name.toLowerCase().endsWith(".epub");
    setUploadStatus(
      isEpub
        ? "正在解析 EPUB 電子書結構並同步至伺服器..."
        : convertToTraditional
        ? "正在將簡體轉換為正體並同步至 NAS..."
        : "正在解析編碼並同步至 NAS..."
    );

    const formData = new FormData();
    formData.append("file", file);
    if (convertToTraditional) {
      formData.append("convertToTraditional", "true");
    }

    try {
      const res = await fetch("/api/books", {
        method: "POST",
        body: formData,
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`伺服器連線異常 (${res.status} ${res.statusText})`);
      }

      if (!res.ok || !data.success) {
        alert(data.error || `上傳失敗 (${res.status})`);
        setIsUploading(false);
        setUploadStatus(null);
        return;
      }

      setUploadStatus(
        `上傳成功！編碼：${data.detectedEncoding?.toUpperCase() || "UTF-8"}${
          convertToTraditional ? "（已轉為正體）" : ""
        }`
      );

      // 上傳完成後立刻預先快取至本機 IndexedDB
      if (data.book?.id) {
        const contentRes = await fetch(`/api/books/${data.book.id}/content`);
        if (contentRes.ok) {
          const text = await contentRes.text();
          await LocalStore.saveBookContent(
            data.book.id,
            data.book.title,
            text,
            data.book.total_chars
          );

          if (data.book?.chapters_json) {
            try {
              const chs = JSON.parse(data.book.chapters_json);
              if (Array.isArray(chs) && chs.length > 0) {
                await LocalStore.saveChapters(data.book.id, chs);
              }
            } catch (e) {}
          }

          if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: "WARMUP_READER",
              url: `/reader/${encodeURIComponent(data.book.id)}`,
            });
          }
        }
      }
      await fetchBooks();
      setTimeout(() => {
        setIsUploading(false);
        setUploadStatus(null);
      }, 1500);
    } catch (e: any) {
      alert("上傳出錯：" + e.message);
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

  // 刪除書籍
  const handleDeleteBook = async (e: React.MouseEvent, book: Book) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`確定要刪除《${book.title}》嗎？這會同時刪除雲端檔案與本機快取。`)) {
      return;
    }

    try {
      try {
        await fetch(`/api/books/${book.id}`, { method: "DELETE" });
      } catch (netErr) {
        console.warn("無法連接伺服器刪除雲端檔案，仍繼續清除本機資料", netErr);
      }
      await LocalStore.deleteBookContent(book.id);
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
      alert("刪除失敗");
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
    handleLogout,
    handleLoginSuccess,
  };
}
