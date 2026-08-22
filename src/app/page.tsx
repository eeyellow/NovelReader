"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Upload,
  Trash2,
  DownloadCloud,
  CheckCircle2,
  HardDrive,
  Laptop,
  Smartphone,
  Tablet,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Moon,
  Sparkles,
  WifiOff,
  Clock,
  BookMarked,
  X,
  Check,
  Palette,
  Pencil,
  LayoutGrid,
  List,
  ArrowUpDown,
  ArrowUpWideNarrow,
  ArrowDownWideNarrow,
} from "lucide-react";
import { Book } from "@/lib/db";
import { LocalStore, requestPersistentStorage } from "@/lib/idb";
import { getDeviceName, setCustomDeviceName } from "@/lib/device";
import { decodeToUtf8 } from "@/lib/encoding";
import { isSimplifiedChinese } from "@/lib/chinese";

const THEMES = [
  { id: "parchment", name: "羊皮紙", icon: BookMarked, color: "bg-[#fbf6ec] border-[#8b5e3c]" },
  { id: "dark", name: "深色", icon: Moon, color: "bg-[#141416] border-[#444]" },
  { id: "oled", name: "純黑", icon: Sparkles, color: "bg-[#000000] border-[#333]" },
  { id: "eyecare", name: "護眼", icon: Sun, color: "bg-[#dcebd9] border-[#2e663a]" },
  { id: "light", name: "極簡白", icon: Sun, color: "bg-[#ffffff] border-[#ccc]" },
];

type SortField = "updated" | "title" | "progress" | "chars";
type SortOrder = "asc" | "desc";

export default function BookshelfPage() {
  const router = useRouter();
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
  const [editingBook, setEditingBook] = useState<{ id: string; title: string } | null>(null);
  const [editTitleInput, setEditTitleInput] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"compact" | "detailed">("detailed");
  const [sortBy, setSortBy] = useState<SortField>("updated");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [rememberConversionChoice, setRememberConversionChoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close theme menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        themeMenuRef.current &&
        !themeMenuRef.current.contains(event.target as Node)
      ) {
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

  // Initialize theme, layout, sort & load data (and check auto-resume)
  useEffect(() => {
    // 0. PWA / App 啟動自動接續上次閱讀檢查
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const isManualShelf =
        searchParams.get("from") === "reader" ||
        searchParams.get("shelf") === "1";

      const savedAutoResume =
        localStorage.getItem("novel_reader_auto_resume") !== "false";
      setAutoResume(savedAutoResume);

      const lastBookId = localStorage.getItem("novel_reader_last_book_id");

      if (savedAutoResume && lastBookId && !isManualShelf) {
        setIsRedirecting(true);
        window.location.replace(`/reader/${encodeURIComponent(lastBookId)}`);
        return;
      }
    }

    // 1. Theme
    const savedTheme = localStorage.getItem("novel_reader_theme") || "parchment";
    setCurrentTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);

    // 2. Shelf Layout (compact vs detailed)
    const savedLayout = (localStorage.getItem("novel_reader_shelf_layout") as "compact" | "detailed") || "detailed";
    setLayoutMode(savedLayout);

    // 3. Sorting preferences
    const savedSortBy = (localStorage.getItem("novel_reader_sort_by") as SortField) || "updated";
    const savedSortOrder = (localStorage.getItem("novel_reader_sort_order") as SortOrder) || "desc";
    setSortBy(savedSortBy);
    setSortOrder(savedSortOrder);

    // 4. Device Name
    const devName = getDeviceName();
    setDeviceNameState(devName);
    setTempDeviceName(devName);

    // 5. Persistent Storage (for Safari/iOS)
    requestPersistentStorage().catch(console.warn);

    // 6. Online/Offline detection
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 7. Fetch Books
    fetchBooks();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleSetLayout = (mode: "compact" | "detailed") => {
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

  const fetchBooks = async () => {
    // 1. 離線優先：立即讀取本機快取書籍清單與進度，做到 0 延遲秒開畫面
    try {
      let cachedList = await LocalStore.getSetting<Book[]>("cached_book_list", []);
      if (!cachedList || cachedList.length === 0) {
        cachedList = await LocalStore.getAllCachedBooks();
      }
      if (cachedList && cachedList.length > 0) {
        setBooks(cachedList);
        setLoading(false);
        checkAllCaches(cachedList);
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
        if (data.success && Array.isArray(data.books)) {
          setBooks(data.books);
          setIsOffline(false);
          checkAllCaches(data.books);
          LocalStore.setSetting("cached_book_list", data.books);
        }
      } else {
        throw new Error("伺服器回應異常");
      }
    } catch (e) {
      console.warn("伺服器無法連線或逾時，保持離線快取模式", e);
      setIsOffline(true);
      const cached = await LocalStore.getSetting<Book[]>("cached_book_list", []);
      if (cached && cached.length > 0) {
        setBooks(cached);
        checkAllCaches(cached);
      } else {
        const localBooks = await LocalStore.getAllCachedBooks();
        if (localBooks && localBooks.length > 0) {
          setBooks(localBooks);
          checkAllCaches(localBooks);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const checkAllCaches = async (bookList: Book[]) => {
    const cacheMap: Record<string, boolean> = {};
    const progMap: Record<string, any> = {};

    for (const book of bookList) {
      const cached = await LocalStore.isBookCached(book.id);
      cacheMap[book.id] = cached;

      if (cached) {
        // Keep cached title in sync with server title
        await LocalStore.updateBookTitle(book.id, book.title);
      }

      const prog = await LocalStore.getLocalProgress(book.id);
      if (prog) {
        progMap[book.id] = prog;
      }
    }
    setCachedStatus(cacheMap);
    setLocalProgress(progMap);
  };

  // Check file encoding & Simplified Chinese before uploading
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // Reset input value so selecting the same file again triggers onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      alert("目前僅支援 .txt 格式純文字小說");
      return;
    }

    // Sample the first 128KB to detect encoding and Simplified Chinese
    try {
      const slice = file.slice(0, 131072);
      const arrayBuf = await slice.arrayBuffer();
      const { text, detectedEncoding } = decodeToUtf8(new Uint8Array(arrayBuf));

      const isSimplified = isSimplifiedChinese(text, detectedEncoding);

      if (isSimplified) {
        // Prompt user with conversion modal
        setPendingSimplifiedFile(file);
      } else {
        uploadFile(file, false);
      }
    } catch (e) {
      console.error("Error detecting file encoding/simplified Chinese:", e);
      uploadFile(file, false);
    }
  };

  const uploadFile = async (file: File, convertToTraditional: boolean) => {
    setIsUploading(true);
    setUploadStatus(
      convertToTraditional
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
      // Immediately fetch content to pre-cache in IndexedDB
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

  const handleConfirmSimplifiedChoice = (convertToTraditional: boolean) => {
    if (!pendingSimplifiedFile) return;
    if (rememberConversionChoice) {
      localStorage.setItem(
        "novel_reader_auto_convert_traditional",
        convertToTraditional ? "true" : "false"
      );
    }
    const file = pendingSimplifiedFile;
    setPendingSimplifiedFile(null);
    uploadFile(file, convertToTraditional);
  };

  // Cache book locally
  const handleCacheBook = async (e: React.MouseEvent, book: Book) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const res = await fetch(`/api/books/${book.id}/content`);
      if (res.ok) {
        const text = await res.text();
        await LocalStore.saveBookContent(book.id, book.title, text, book.total_chars);
        setCachedStatus((prev) => ({ ...prev, [book.id]: true }));
      }
    } catch (err) {
      alert("快取下載失敗，請檢查網路連線");
    }
  };

  // Delete book
  const handleDeleteBook = async (e: React.MouseEvent, book: Book) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`確定要刪除《${book.title}》嗎？這會同時刪除雲端檔案與本機快取。`)) {
      return;
    }

    try {
      await fetch(`/api/books/${book.id}`, { method: "DELETE" });
      await LocalStore.deleteBookContent(book.id);
      setBooks((prev) => prev.filter((b) => b.id !== book.id));
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

  // Open rename modal
  const handleOpenRename = (e: React.MouseEvent, book: Book) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingBook({ id: book.id, title: book.title });
    setEditTitleInput(book.title);
  };

  // Save renamed book title
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

      // Update local cache in IndexedDB
      await LocalStore.updateBookTitle(editingBook.id, trimmed);

      // Update state
      setBooks((prev) => {
        const updated = prev.map((b) =>
          b.id === editingBook.id ? { ...b, title: trimmed } : b
        );
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

  // Save device name
  const handleSaveDeviceName = () => {
    if (tempDeviceName.trim()) {
      setCustomDeviceName(tempDeviceName.trim());
      setDeviceNameState(tempDeviceName.trim());
      setShowDeviceModal(false);
    }
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Format word count
  const formatChars = (chars: number) => {
    if (!chars) return "0 字";
    if (chars < 10000) return `${chars} 字`;
    return `${(chars / 10000).toFixed(1)} 萬字`;
  };

  // Format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "尚未閱讀";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 2) return "剛剛";
    if (diffMins < 60) return `${diffMins} 分鐘前`;
    if (diffHours < 24) return `${diffHours} 小時前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString();
  };

  const filteredBooks = useMemo(() => {
    const list = books.filter((b) =>
      b.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "title") {
        cmp = a.title.localeCompare(b.title, "zh-Hant");
      } else if (sortBy === "progress") {
        const aProg = localProgress[a.id]?.percentage ?? a.percentage ?? 0;
        const bProg = localProgress[b.id]?.percentage ?? b.percentage ?? 0;
        cmp = aProg - bProg;
      } else if (sortBy === "chars") {
        const aChars = a.total_chars || 0;
        const bChars = b.total_chars || 0;
        cmp = aChars - bChars;
      } else {
        // "updated" - last progress update time or creation time
        const aTime = new Date(
          localProgress[a.id]?.updated_at || a.progress_updated_at || a.created_at
        ).getTime();
        const bTime = new Date(
          localProgress[b.id]?.updated_at || b.progress_updated_at || b.created_at
        ).getTime();
        cmp = aTime - bTime;
      }

      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [books, searchTerm, sortBy, sortOrder, localProgress]);

  if (isRedirecting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-color)] text-[var(--text-color)] select-none">
        <div className="flex flex-col items-center space-y-4 p-6 text-center">
          <div className="w-10 h-10 border-3 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin" />
          <div className="space-y-1">
            <p className="text-base font-bold">正在返回最後閱讀進度...</p>
            <p className="text-xs text-[var(--text-muted)]">無縫接軌繼續閱讀</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 backdrop-blur-md border-b border-[var(--border-color)] bg-[var(--header-bg)] px-4 sm:px-8 py-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="p-2 rounded-xl bg-[var(--accent-color)] text-white shadow-sm shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight truncate">小說書架</h1>
            <p className="text-xs">
              {isOffline ? (
                <span className="inline-flex items-center text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                  <WifiOff className="w-3 h-3 mr-1 inline shrink-0" /> 離線模式
                </span>
              ) : (
                <span className="inline-flex items-center text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 inline-block shrink-0 animate-pulse" />
                  雲端連線
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right Tools: Device Name, Theme Toggle, Refresh */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Device Tag */}
          <button
            onClick={() => setShowDeviceModal(true)}
            className="hidden sm:flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] text-xs text-[var(--text-muted)] hover:text-[var(--text-color)] hover:border-[var(--accent-color)] transition-colors"
            title="點擊自訂此裝置名稱"
          >
            {deviceName.includes("iPhone") || deviceName.includes("Android") ? (
              <Smartphone className="w-3.5 h-3.5" />
            ) : deviceName.includes("iPad") ? (
              <Tablet className="w-3.5 h-3.5" />
            ) : (
              <Laptop className="w-3.5 h-3.5" />
            )}
            <span className="font-medium">{deviceName}</span>
          </button>

          {/* Collapsible Theme Selector */}
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setShowThemeMenu((prev) => !prev)}
              className={`p-2 rounded-lg border border-[var(--border-color)] transition-colors ${
                showThemeMenu
                  ? "bg-[var(--accent-color)] text-white border-[var(--accent-color)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-color)] hover:border-[var(--accent-color)]"
              }`}
              title="切換佈景主題"
              aria-label="切換佈景主題"
              aria-expanded={showThemeMenu}
            >
              <Palette className="w-4 h-4" />
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 mt-2 w-36 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-lg py-1 z-50">
                {THEMES.map((theme) => {
                  const Icon = theme.icon;
                  const isActive = currentTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => {
                        changeTheme(theme.id);
                        setShowThemeMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                        isActive
                          ? "text-[var(--accent-color)] font-semibold bg-[var(--accent-color)]/10"
                          : "text-[var(--text-color)] hover:bg-[var(--bg-color)]"
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{theme.name}</span>
                      </div>
                      {isActive && <Check className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Refresh button */}
          <button
            onClick={fetchBooks}
            disabled={loading}
            className="p-2 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-color)] transition-colors"
            title="重新整理書單"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Upload & Search Action Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Upload Dropzone / Button */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleFileSelect(e.dataTransfer.files);
            }}
            className="md:col-span-2 group cursor-pointer border-2 border-dashed border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:bg-opacity-80 rounded-2xl p-5 flex items-center justify-between transition-all duration-200 shadow-sm"
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files)}
            />
            <div className="flex items-center space-x-4">
              <div className="p-3 rounded-xl bg-[var(--accent-color)] bg-opacity-10 text-[var(--accent-color)] group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-sm sm:text-base">
                  {isUploading ? uploadStatus : "點擊或拖曳 .TXT 小說上傳"}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  自動識別 UTF-8、Big5、GBK 編碼並同步至 NAS 私有雲
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block text-xs px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-muted)] group-hover:border-[var(--accent-color)] group-hover:text-[var(--accent-color)] font-medium">
              選擇檔案
            </span>
          </div>

          {/* Search Box */}
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3.5 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="搜尋書名..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 text-[var(--text-muted)] hover:text-[var(--text-color)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Bookshelf Section */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
              書庫清單 ({filteredBooks.length})
            </h2>
            <div className="text-xs text-[var(--text-muted)] flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Sorting Controls */}
              <div className="flex items-center space-x-1 p-0.5 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)]">
                <span className="pl-2 text-[var(--text-muted)] flex items-center">
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1 shrink-0" />
                  <span className="hidden xs:inline sm:inline text-xs">排序：</span>
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => handleSetSortBy(e.target.value as SortField)}
                  className="bg-transparent text-xs text-[var(--text-color)] focus:outline-none cursor-pointer py-1 pr-1 font-medium"
                >
                  <option value="updated" className="bg-[var(--card-bg)] text-[var(--text-color)]">更新時間</option>
                  <option value="title" className="bg-[var(--card-bg)] text-[var(--text-color)]">書名</option>
                  <option value="progress" className="bg-[var(--card-bg)] text-[var(--text-color)]">閱讀進度</option>
                  <option value="chars" className="bg-[var(--card-bg)] text-[var(--text-color)]">總字數</option>
                </select>

                <button
                  onClick={handleToggleSortOrder}
                  className="p-1 px-1.5 rounded-md hover:bg-[var(--border-color)]/50 text-[var(--text-color)] transition-colors flex items-center space-x-1 font-medium"
                  title={sortOrder === "asc" ? "目前為升冪（由小至大/舊至新），點擊切換為降冪" : "目前為降冪（由大至小/新至舊），點擊切換為升冪"}
                  aria-label="切換升降冪"
                >
                  {sortOrder === "asc" ? (
                    <>
                      <ArrowUpWideNarrow className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                      <span className="text-[11px] text-[var(--accent-color)]">升冪</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownWideNarrow className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                      <span className="text-[11px] text-[var(--accent-color)]">降冪</span>
                    </>
                  )}
                </button>
              </div>

              {/* Layout Switcher */}
              <div className="flex items-center p-0.5 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)]">
                <button
                  onClick={() => handleSetLayout("compact")}
                  className={`p-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs flex items-center space-x-1 transition-all ${
                    layoutMode === "compact"
                      ? "bg-[var(--accent-color)] text-white shadow-sm font-medium"
                      : "text-[var(--text-muted)] hover:text-[var(--text-color)]"
                  }`}
                  title="精簡資訊 (列表)"
                  aria-label="精簡資訊"
                >
                  <List className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline sm:inline text-xs">精簡</span>
                </button>
                <button
                  onClick={() => handleSetLayout("detailed")}
                  className={`p-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs flex items-center space-x-1 transition-all ${
                    layoutMode === "detailed"
                      ? "bg-[var(--accent-color)] text-white shadow-sm font-medium"
                      : "text-[var(--text-muted)] hover:text-[var(--text-color)]"
                  }`}
                  title="詳細資訊 (卡片)"
                  aria-label="詳細資訊"
                >
                  <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline sm:inline text-xs">詳細</span>
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            layoutMode === "compact" ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-12 rounded-xl bg-[var(--card-bg)] animate-pulse border border-[var(--border-color)]"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-44 rounded-2xl bg-[var(--card-bg)] animate-pulse border border-[var(--border-color)]"
                  />
                ))}
              </div>
            )
          ) : filteredBooks.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] space-y-3">
              <BookOpen className="w-12 h-12 mx-auto text-[var(--text-muted)] opacity-50" />
              <h3 className="font-semibold text-base">目前書架空空如也</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                {searchTerm
                  ? "找不到符合搜尋條件的小說"
                  : "快把電腦或手機裡的 .TXT 小說檔案拖曳進來開始閱讀吧！"}
              </p>
            </div>
          ) : layoutMode === "compact" ? (
            /* Compact List View */
            <div className="space-y-2">
              {filteredBooks.map((book) => {
                const isCached = !!cachedStatus[book.id];
                const local = localProgress[book.id];
                const percentage =
                  local?.percentage !== undefined
                    ? local.percentage
                    : book.percentage || 0;

                return (
                  <Link
                    key={book.id}
                    href={`/reader/${book.id}`}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        localStorage.setItem("novel_reader_last_book_id", book.id);
                      }
                    }}
                    className="group flex items-center justify-between p-3 sm:px-4.5 rounded-xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:shadow-sm transition-all duration-150 gap-3"
                  >
                    {/* Book Title */}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm sm:text-base truncate group-hover:text-[var(--accent-color)] transition-colors">
                        {book.title}
                      </h3>
                    </div>

                    {/* Right: Progress & Cache Status Icon */}
                    <div className="flex items-center space-x-3 shrink-0">
                      <span className="text-xs font-medium text-[var(--accent-color)] tabular-nums">
                        {percentage > 0 ? `進度 ${percentage.toFixed(1)}%` : "未讀"}
                      </span>

                      {isCached ? (
                        <span
                          className="inline-flex items-center text-emerald-600 dark:text-emerald-400"
                          title="已快取至本機，離線可讀"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </span>
                      ) : (
                        <button
                          onClick={(e) => handleCacheBook(e, book)}
                          className="p-0.5 text-amber-600 dark:text-amber-400 hover:scale-110 transition-transform"
                          title="點擊預先下載至本機快取"
                        >
                          <DownloadCloud className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            /* Detailed Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBooks.map((book) => {
                const isCached = !!cachedStatus[book.id];
                const local = localProgress[book.id];
                // Prioritize local progress if newer, else server progress
                const percentage =
                  local?.percentage !== undefined
                    ? local.percentage
                    : book.percentage || 0;
                const lastDevice = local?.device_name || book.last_device;
                const lastUpdated = local?.updated_at || book.progress_updated_at || book.created_at;

                return (
                  <Link
                    key={book.id}
                    href={`/reader/${book.id}`}
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        localStorage.setItem("novel_reader_last_book_id", book.id);
                      }
                    }}
                    className="group relative flex flex-col justify-between p-5 rounded-2xl border border-[var(--border-color)] hover:border-[var(--accent-color)] bg-[var(--card-bg)] hover:shadow-md transition-all duration-200"
                  >
                    <div>
                      {/* Card Top: Title & Cache Badge */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-bold text-base line-clamp-2 group-hover:text-[var(--accent-color)] transition-colors">
                          {book.title}
                        </h3>
                        <div className="shrink-0">
                          {isCached ? (
                            <span
                              className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium"
                              title="已快取至本機，斷網可讀"
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1 inline" /> 本機離線
                            </span>
                          ) : (
                            <button
                              onClick={(e) => handleCacheBook(e, book)}
                              className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors font-medium"
                              title="點擊預先下載至本機快取"
                            >
                              <DownloadCloud className="w-3 h-3 mr-1 inline" /> 點擊快取
                            </button>
                          )}
                        </div>
                      </div>

                      {/* File Metadata */}
                      <div className="text-xs text-[var(--text-muted)] flex items-center gap-2 mb-4">
                        <span>{formatChars(book.total_chars)}</span>
                        <span>•</span>
                        <span>{formatSize(book.file_size)}</span>
                      </div>
                    </div>

                    {/* Card Bottom: Progress Bar & Sync Device Info */}
                    <div className="space-y-2.5 pt-2 border-t border-[var(--border-color)]/60">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--accent-color)]">
                          進度 {percentage.toFixed(1)}%
                        </span>
                        <span className="text-[11px] text-[var(--text-muted)] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(lastUpdated)}
                        </span>
                      </div>

                      {/* Progress Track */}
                      <div className="w-full bg-[var(--border-color)] h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[var(--accent-color)] h-full transition-all duration-300 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                        />
                      </div>

                      {/* Device & Actions */}
                      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1">
                        <span className="truncate max-w-[140px]">
                          {lastDevice ? `上次：${lastDevice}` : "尚未開始"}
                        </span>
                        <div className="flex items-center space-x-1 shrink-0">
                          <button
                            onClick={(e) => handleOpenRename(e, book)}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent-color)] transition-colors opacity-60 hover:opacity-100"
                            title="修改書名"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteBook(e, book)}
                            className="p-1 rounded text-[var(--text-muted)] hover:text-red-500 transition-colors opacity-60 hover:opacity-100"
                            title="刪除小說"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Device Name Modal */}
      {showDeviceModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-base">設定此裝置名稱</h3>
            <p className="text-xs text-[var(--text-muted)]">
              多裝置同步時會顯示此標籤（例如：「iPad Pro」、「公司筆電」、「客廳桌機」），方便識別進度來源。
            </p>
            <input
              type="text"
              value={tempDeviceName}
              onChange={(e) => setTempDeviceName(e.target.value)}
              placeholder="例如：iPhone 15 Pro"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
            />

            <div className="pt-2 border-t border-[var(--border-color)]">
              <label className="flex items-center justify-between cursor-pointer py-1 select-none">
                <div className="pr-3">
                  <div className="text-xs font-semibold">啟動時自動繼續閱讀</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    開啟應用程式或 PWA 時，預設直接進入上次閱讀的小說
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoResume}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setAutoResume(val);
                    localStorage.setItem(
                      "novel_reader_auto_resume",
                      val ? "true" : "false"
                    );
                  }}
                  className="w-4 h-4 accent-[var(--accent-color)] rounded cursor-pointer shrink-0"
                />
              </label>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowDeviceModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-color)]"
              >
                取消
              </button>
              <button
                onClick={handleSaveDeviceName}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 transition-opacity"
              >
                儲存設定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simplified Chinese Conversion Modal */}
      {pendingSimplifiedFile && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 rounded-xl bg-[var(--accent-color)] bg-opacity-15 text-[var(--accent-color)]">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">偵測到簡體中文小說</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate max-w-[260px]">
                    《{pendingSimplifiedFile.name}》
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingSimplifiedFile(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
              此檔案內容檢測為簡體中文。請問是否要自動轉換為<strong className="text-[var(--text-color)]">繁體（正體）中文</strong>並同步至 NAS？
            </p>

            {/* Remember Choice Checkbox */}
            <label className="flex items-center space-x-2 text-xs text-[var(--text-muted)] cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={rememberConversionChoice}
                onChange={(e) => setRememberConversionChoice(e.target.checked)}
                className="rounded border-[var(--border-color)] accent-[var(--accent-color)] w-4 h-4"
              />
              <span>記住此選擇（之後簡體小說一律自動轉換為繁體）</span>
            </label>

            {/* Action Buttons */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--border-color)]">
              <button
                onClick={() => setPendingSimplifiedFile(null)}
                className="px-3 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-color)]"
              >
                取消上傳
              </button>
              <button
                onClick={() => handleConfirmSimplifiedChoice(false)}
                className="px-3.5 py-2 rounded-xl text-xs border border-[var(--border-color)] hover:bg-[var(--bg-color)] font-medium transition-colors"
              >
                保留原檔簡體
              </button>
              <button
                onClick={() => handleConfirmSimplifiedChoice(true)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 transition-opacity flex items-center space-x-1"
              >
                <Check className="w-3.5 h-3.5 mr-1" />
                <span>轉換為繁體中文</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Book Modal */}
      {editingBook && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">修改書籍名稱</h3>
              <button
                onClick={() => setEditingBook(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              自訂書架上顯示的書籍名稱，不會影響原始檔案內容。
            </p>
            <form onSubmit={handleSaveTitle} className="space-y-4">
              <input
                type="text"
                value={editTitleInput}
                onChange={(e) => setEditTitleInput(e.target.value)}
                placeholder="請輸入新書名"
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-color)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
              />
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingBook(null)}
                  className="px-4 py-2 rounded-xl text-xs text-[var(--text-muted)] hover:text-[var(--text-color)]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSavingTitle || !editTitleInput.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isSavingTitle ? "儲存中..." : "儲存名稱"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
