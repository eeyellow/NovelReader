/**
 * @file format.ts
 * @description 文字與檔案數值格式化工具函式
 */

/** 格式化位元組大小為易讀字串 (B, KB, MB) */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** 格式化字數為易讀字串 (字, 萬字) */
export function formatChars(chars: number): string {
  if (!chars) return "0 字";
  if (chars < 10000) return `${chars} 字`;
  return `${(chars / 10000).toFixed(1)} 萬字`;
}

/** 格式化相對時間或日期字串 */
export function formatDate(dateStr?: string): string {
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
}
