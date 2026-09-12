/**
 * @file reader.ts
 * @description 閱讀器核心型別定義，涵蓋排版偏好、閱讀模式、檢索結果與同步狀態
 */

/** 翻頁/捲動閱讀模式 */
export type ReadingMode = "paginated" | "continuous";

/** 閱讀器主題識別碼 */
export type ThemeId = "parchment" | "dark" | "oled" | "eyecare" | "light";

/** 字體家族識別碼 */
export type FontFamilyId = "serif" | "sans" | "kaiti";

/** 版面最大寬度選項 */
export type MaxWidthMode = "narrow" | "normal" | "wide";

/** 點擊翻頁方向規則 */
export type ClickDirection = "standard" | "inverted";

/** 簡繁中文動態轉換選項 */
export type ChineseVariant = "original" | "traditional" | "simplified";

/** 文字對齊方式 */
export type TextAlignMode = "justify" | "left";

/** 邊緣內縮留白選項 */
export type PaddingMode = "compact" | "normal" | "spacious";

/** 進度滑桿切換模式：本章頁碼或全書百分比 */
export type ScrubberMode = "chapter" | "book";

/** 全文搜尋結果項目 */
export interface SearchResultItem {
  chapterIndex: number;
  chapterTitle: string;
  charOffset: number;
  snippetBefore: string;
  matchText: string;
  snippetAfter: string;
}

/** 跨裝置進度衝突提示資料結構 */
export interface ConflictPromptData {
  serverOffset: number;
  serverPercentage: number;
  deviceName: string;
}

/** 閱讀器外觀與排版設定物件 */
export interface ReaderSettingsState {
  theme: ThemeId;
  fontSize: number;
  lineHeight: number;
  fontFamily: FontFamilyId;
  maxWidthMode: MaxWidthMode;
  clickDirection: ClickDirection;
  chineseVariant: ChineseVariant;
  readMode: ReadingMode;
  textAlign: TextAlignMode;
  paddingMode: PaddingMode;
}
