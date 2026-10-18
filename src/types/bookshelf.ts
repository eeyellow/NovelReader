/**
 * @file bookshelf.ts
 * @description 書架系統相關型別定義
 */

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
