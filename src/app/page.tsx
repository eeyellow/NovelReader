"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
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

export default function BookshelfPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
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

  // Simplified Chinese conversion modal state
  const [pendingSimplifiedFile, setPendingSimplifiedFile] = useState<File | null>(null);
  const [rememberConversionChoice, setRememberConversionChoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize theme & load data
  useEffect(() => {
    // 1. Theme
    const savedTheme = localStorage.getItem("novel_reader_theme") || "parchment";
    setCurrentTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);

    // 2. Device Name
    const devName = getDeviceName();
    setDeviceNameState(devName);
    setTempDeviceName(devName);

    // 3. Persistent Storage (for Safari/iOS)
    requestPersistentStorage().catch(console.warn);

    // 4. Online/Offline detection
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 5. Fetch Books
    fetchBooks();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const changeTheme = (themeId: string) => {
    setCurrentTheme(themeId);
    document.documentElement.setAttribute("data-theme", themeId);
    localStorage.setItem("novel_reader_theme", themeId);
  };

  const fetchBooks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/books");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setBooks(data.books);
          // Check cache status for each book
          checkAllCaches(data.books);
          // Save books list to local storage as offline cache
          LocalStore.setSetting("cached_book_list", data.books);
        }
      } else {
        throw new Error("Failed to fetch books");
      }
    } catch (e) {
      console.warn("Using offline book list", e);
      setIsOffline(true);
      const cached = await LocalStore.getSetting<Book[]>("cached_book_list", []);
      setBooks(cached);
      checkAllCaches(cached);
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
    } catch (err) {
      alert("刪除失敗");
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

  const filteredBooks = books.filter((b) =>
    b.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-200">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 backdrop-blur-md border-b border-[var(--border-color)] bg-[var(--header-bg)] px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-[var(--accent-color)] text-white shadow-sm">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">小說書架</h1>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
              <span>PWA 離線同步版</span>
              {isOffline ? (
                <span className="inline-flex items-center text-amber-600 dark:text-amber-400 font-medium">
                  <WifiOff className="w-3 h-3 mr-0.5 inline" /> 離線模式
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">● 雲端連線</span>
              )}
            </p>
          </div>
        </div>

        {/* Right Tools: Device Name, Theme Toggle, Refresh */}
        <div className="flex items-center space-x-2">
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

          {/* Theme Selector */}
          <div className="flex items-center space-x-1 p-1 rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)]">
            {THEMES.map((theme) => {
              const Icon = theme.icon;
              const isActive = currentTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => changeTheme(theme.id)}
                  title={theme.name}
                  className={`p-1.5 rounded-md text-xs transition-all ${
                    isActive
                      ? "bg-[var(--accent-color)] text-white shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text-color)]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              書庫清單 ({filteredBooks.length})
            </h2>
            <div className="text-xs text-[var(--text-muted)] flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> 已離線快取
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 雲端存放
              </span>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-44 rounded-2xl bg-[var(--card-bg)] animate-pulse border border-[var(--border-color)]"
                />
              ))}
            </div>
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
          ) : (
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
                        <span className="truncate max-w-[150px]">
                          {lastDevice ? `上次：${lastDevice}` : "尚未開始"}
                        </span>
                        <button
                          onClick={(e) => handleDeleteBook(e, book)}
                          className="p-1 rounded text-[var(--text-muted)] hover:text-red-500 transition-colors opacity-60 hover:opacity-100"
                          title="刪除小說"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
    </div>
  );
}
