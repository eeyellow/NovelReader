import { GestureAction, GestureConfig, GestureInfo } from "./types";

export const GESTURE_INFOS: Record<GestureAction, GestureInfo> = {
  PREV_PAGE: {
    action: "PREV_PAGE",
    name: "上一頁",
    description: "向左翻至上一頁",
  },
  NEXT_PAGE: {
    action: "NEXT_PAGE",
    name: "下一頁",
    description: "向右翻至下一頁",
  },
  PREV_CHAPTER: {
    action: "PREV_CHAPTER",
    name: "上一章",
    description: "跳轉至上一章節第一頁",
  },
  NEXT_CHAPTER: {
    action: "NEXT_CHAPTER",
    name: "下一章",
    description: "跳轉至下一章節第一頁",
  },
  SCROLL_TOP: {
    action: "SCROLL_TOP",
    name: "回到開頭",
    description: "直接跳至第一章第一頁",
  },
  SCROLL_BOTTOM: {
    action: "SCROLL_BOTTOM",
    name: "跳到末尾",
    description: "直接跳至最後一章最後一頁",
  },
  TOGGLE_TOC: {
    action: "TOGGLE_TOC",
    name: "目錄章節",
    description: "開啟或關閉目錄側邊欄",
  },
  TOGGLE_SETTINGS: {
    action: "TOGGLE_SETTINGS",
    name: "閱讀排版設定",
    description: "開啟或關閉字體與佈局設定",
  },
  BACK_TO_SHELF: {
    action: "BACK_TO_SHELF",
    name: "返回書架",
    description: "退出閱讀並返回小說書架",
  },
  TOGGLE_FULLSCREEN: {
    action: "TOGGLE_FULLSCREEN",
    name: "全螢幕切換",
    description: "切換全螢幕閱讀模式",
  },
  TOGGLE_THEME: {
    action: "TOGGLE_THEME",
    name: "切換主題",
    description: "輪流切換羊皮紙、深色、純黑等主題",
  },
  FONT_INCREASE: {
    action: "FONT_INCREASE",
    name: "放大字體",
    description: "字體大小增加 1px",
  },
  FONT_DECREASE: {
    action: "FONT_DECREASE",
    name: "縮小字體",
    description: "字體大小減少 1px",
  },
};

export const DEFAULT_GESTURE_MAP: Record<string, GestureAction> = {
  L: "PREV_PAGE",
  R: "NEXT_PAGE",
  U: "PREV_CHAPTER",
  D: "NEXT_CHAPTER",
  UD: "SCROLL_TOP",
  DU: "SCROLL_BOTTOM",
  DR: "TOGGLE_TOC",
  UR: "TOGGLE_SETTINGS",
  LU: "BACK_TO_SHELF",
  RD: "TOGGLE_FULLSCREEN",
  LR: "TOGGLE_THEME",
  UL: "FONT_INCREASE",
  DL: "FONT_DECREASE",
};

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  enabled: true,
  triggerButton: 2, // 2: 滑鼠右鍵
  minDistance: 22,
  showTrail: true,
  showHUD: true,
  strokeColor: "#3b82f6",
  strokeWidth: 4,
  customMap: DEFAULT_GESTURE_MAP,
};

const STORAGE_KEY = "novel_reader_gesture_config";

export function loadGestureConfig(): GestureConfig {
  if (typeof window === "undefined") return DEFAULT_GESTURE_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_GESTURE_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_GESTURE_CONFIG,
      ...parsed,
      customMap: {
        ...DEFAULT_GESTURE_MAP,
        ...(parsed.customMap || {}),
      },
    };
  } catch (e) {
    console.warn("Failed to load gesture config:", e);
    return DEFAULT_GESTURE_CONFIG;
  }
}

export function saveGestureConfig(config: GestureConfig) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn("Failed to save gesture config:", e);
  }
}
