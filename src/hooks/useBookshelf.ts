/**
 * @file useBookshelf.ts
 * @description 書架狀態與業務邏輯管理 Hook（直接讀寫伺服器 API + 輕量本地快取）
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Book } from "@/lib/db";
import { LocalStore } from "@/lib/idb";
import { getDeviceName, setCustomDeviceName } from "@/lib/device";
import { decodeToUtf8 } from "@/lib/encoding";
import { isSimplifiedChinese, convertToTraditional, convertToSimplified } from "@/lib/chinese";
import { flushPendingProgress } from "@/lib/sync";
import { parseSafeTime } from "@/lib/format";
import { SortField, SortOrder, ShelfLayoutMode, EditingBookState } from "@/types/bookshelf";

export function useBookshelf() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [autoResume, setAutoResume] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
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
  const [showSystemInfoModal, setShowSystemInfoModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const isFetchingBooksRef = useRef(false);

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

  // 從伺服器載入書籍列表
  const fetchBooks = useCallback(async () => {
    if (isFetchingBooksRef.current) return;
    isFetchingBooksRef.current = true;

    try {
      await flushPendingProgress();
      const res = await fetch("/api/books", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.books)) {
          setBooks(data.books as Book[]);
        }
      }
    } catch (e) {
      console.warn("取得書籍列表失敗:", e);
    } finally {
      setLoading(false);
      isFetchingBooksRef.current = false;
    }
  }, []);

  // 初始化主題、偏好設定與自動接續閱讀檢查
  useEffect(() => {
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

    const savedTheme = localStorage.getItem("novel_reader_theme") || "parchment";
    setCurrentTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);

    const savedLayout =
      (localStorage.getItem("novel_reader_shelf_layout") as ShelfLayoutMode) || "detailed";
    setLayoutMode(savedLayout);

    const savedSortBy = (localStorage.getItem("novel_reader_sort_by") as SortField) || "updated";
    const savedSortOrder = (localStorage.getItem("novel_reader_sort_order") as SortOrder) || "desc";
    setSortBy(savedSortBy);
    setSortOrder(savedSortOrder);

    const devName = getDeviceName();
    setDeviceNameState(devName);
    setTempDeviceName(devName);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchBooks();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    fetchBooks();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchBooks]);

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

  // 上傳檔案至伺服器
  const uploadFile = async (file: File, convertToTraditionalChoice: boolean) => {
    setIsUploading(true);
    const isEpub = file.name.toLowerCase().endsWith(".epub");
    setUploadStatus(
      isEpub
        ? "正在解析並上傳 EPUB 電子書..."
        : convertToTraditionalChoice
        ? "正在轉為正體中文並上傳..."
        : "正在上傳小說..."
    );

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (convertToTraditionalChoice) {
        formData.append("convertToTraditional", "true");
      }

      const res = await fetch("/api/books", {
        method: "POST",
        body: formData,
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        throw new Error(resData.error || "上傳失敗");
      }

      if (resData.book && Array.isArray(resData.chapters)) {
        await LocalStore.saveChapters(resData.book.id, resData.chapters);
      }

      setUploadStatus("上傳成功！");
      await fetchBooks();

      setTimeout(() => {
        setIsUploading(false);
        setUploadStatus(null);
      }, 1200);
    } catch (e: any) {
      alert("上傳小說出錯：" + (e?.message || "未知錯誤"));
      setIsUploading(false);
      setUploadStatus(null);
    }
  };

  // 選擇檔案時偵測編碼與簡繁體
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    const lowerName = file.name.toLowerCase();
    const isTxt = lowerName.endsWith(".txt");
    const isEpub = lowerName.endsWith(".epub");

    if (!isTxt && !isEpub) {
      alert("僅支援 .txt 與 .epub 格式小說");
      return;
    }

    if (isEpub) {
      uploadFile(file, false);
      return;
    }

    // 檢查是否已記住簡繁轉換偏好
    const savedAutoConvert = localStorage.getItem("novel_reader_auto_convert_traditional");

    try {
      const slice = file.slice(0, 131072);
      const arrayBuf = await slice.arrayBuffer();
      const { text, detectedEncoding } = decodeToUtf8(new Uint8Array(arrayBuf));
      const isSimplified = isSimplifiedChinese(text, detectedEncoding);

      if (isSimplified) {
        if (savedAutoConvert === "true") {
          uploadFile(file, true);
        } else if (savedAutoConvert === "false") {
          uploadFile(file, false);
        } else {
          setPendingSimplifiedFile(file);
        }
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

  // 徹底刪除伺服器與本機書籍
  const handleDeleteBook = async (e: React.MouseEvent, book: Book) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`確定要永久刪除《${book.title}》嗎？`)) {
      return;
    }

    try {
      const res = await fetch(`/api/books/${encodeURIComponent(book.id)}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "刪除失敗");
      }

      await LocalStore.deleteBookContent(book.id);
      setBooks((prev) => prev.filter((b) => b.id !== book.id));

      if (
        typeof window !== "undefined" &&
        localStorage.getItem("novel_reader_last_book_id") === book.id
      ) {
        localStorage.removeItem("novel_reader_last_book_id");
      }
    } catch (err: any) {
      alert(err?.message || "刪除書籍失敗");
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
      const res = await fetch(`/api/books/${encodeURIComponent(editingBook.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "更新書名失敗");
      }

      await LocalStore.updateBookTitle(editingBook.id, trimmed);
      setBooks((prev) =>
        prev.map((b) => (b.id === editingBook.id ? { ...b, title: trimmed } : b))
      );
      setEditingBook(null);
    } catch (err: any) {
      alert(err.message || "更新書名失敗");
    } finally {
      setIsSavingTitle(false);
    }
  };

  // 儲存自訂裝置名稱與自動接續閱讀設定
  const handleSaveDeviceName = () => {
    localStorage.setItem("novel_reader_auto_resume", autoResume ? "true" : "false");
    if (tempDeviceName.trim()) {
      setCustomDeviceName(tempDeviceName.trim());
      setDeviceNameState(tempDeviceName.trim());
    }
    setShowDeviceModal(false);
  };

  // 搜尋與排序過濾後的書庫清單
  const filteredBooks = useMemo(() => {
    const rawQ = searchTerm.trim().toLowerCase();
    const tradQ = rawQ ? convertToTraditional(rawQ).toLowerCase() : "";
    const simpQ = rawQ ? convertToSimplified(rawQ).toLowerCase() : "";

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
        const aProg = a.percentage ?? 0;
        const bProg = b.percentage ?? 0;
        cmp = aProg - bProg;
      } else if (sortBy === "chars") {
        const aChars = a.total_chars || 0;
        const bChars = b.total_chars || 0;
        cmp = aChars - bChars;
      } else {
        const aTime = Math.max(
          parseSafeTime(a.progress_updated_at),
          parseSafeTime(a.created_at)
        );
        const bTime = Math.max(
          parseSafeTime(b.progress_updated_at),
          parseSafeTime(b.created_at)
        );
        cmp = aTime - bTime;
      }

      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [books, searchTerm, sortBy, sortOrder]);

  return {
    books,
    loading,
    isRedirecting,
    autoResume,
    setAutoResume,
    isUploading,
    uploadStatus,
    searchTerm,
    setSearchTerm,
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
    fileInputRef,
    themeMenuRef,
    fetchBooks,
    handleFileSelect,
    handleConfirmSimplifiedChoice,
    handleDeleteBook,
    handleOpenRename,
    handleSaveTitle,
    handleSaveDeviceName,
    filteredBooks,
    showSystemInfoModal,
    setShowSystemInfoModal,
  };
}
