/**
 * @file bookshelf.ts
 * @description 書架系統相關型別定義，遵循單一職責原則集中管理書架資料模型與狀態型別
 */

import { Book } from "@/lib/db";

/** 書庫排序依據欄位 */
export type SortField = "updated" | "title" | "progress" | "chars";

/** 排序方向：升冪 (asc) 或 降冪 (desc) */
export type SortOrder = "asc" | "desc";

/** 書架排版檢視模式：精簡列表 (compact) 或 詳細卡片 (detailed) */
export type ShelfLayoutMode = "compact" | "detailed";

/** 正在編輯書名的狀態物件 */
export interface EditingBookState {
  id: string;
  title: string;
}

/** 批次快取全書的進度物件 */
export interface CacheAllProgress {
  current: number;
  total: number;
}

/** 書架單一書籍呈現與操作所需之附加狀態 */
export interface BookCardItemProps {
  book: Book;
  isCached: boolean;
  isCaching: boolean;
  localProgressData?: {
    percentage?: number;
    char_offset?: number;
    updated_at?: string;
  };
  layoutMode: ShelfLayoutMode;
  onCache: (e: React.MouseEvent, book: Book) => void;
  onDelete: (e: React.MouseEvent, book: Book) => void;
  onOpenRename: (e: React.MouseEvent, book: Book) => void;
}
