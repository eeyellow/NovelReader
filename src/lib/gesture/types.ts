export type Direction = "U" | "D" | "L" | "R";

export interface Point {
  x: number;
  y: number;
}

export type GestureAction =
  | "PREV_PAGE"
  | "NEXT_PAGE"
  | "PREV_CHAPTER"
  | "NEXT_CHAPTER"
  | "SCROLL_TOP"
  | "SCROLL_BOTTOM"
  | "TOGGLE_TOC"
  | "TOGGLE_SETTINGS"
  | "BACK_TO_SHELF"
  | "TOGGLE_FULLSCREEN"
  | "TOGGLE_THEME"
  | "FONT_INCREASE"
  | "FONT_DECREASE";

export interface GestureInfo {
  action: GestureAction;
  name: string;
  description: string;
}

export interface GestureConfig {
  enabled: boolean;
  triggerButton: number; // 2: 右鍵, 1: 中鍵
  minDistance: number; // 採樣閾值 (px)
  showTrail: boolean;
  showHUD: boolean;
  strokeColor: string;
  strokeWidth: number;
  customMap: Record<string, GestureAction>;
}
