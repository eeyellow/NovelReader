/**
 * @file themes.ts
 * @description 統一管理全站佈景主題與字型樣式常數，落實 Single Source of Truth 與 DRY 原則
 */

import { BookMarked, Moon, Sparkles, Sun, LucideIcon } from "lucide-react";
import { ThemeId, FontFamilyId } from "@/types/reader";

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  shelfName: string;
  icon: LucideIcon;
  bg: string;
  text: string;
  shelfClass: string;
}

/** 全站統一主題清單 */
export const THEMES: ThemeConfig[] = [
  {
    id: "parchment",
    name: "羊皮紙",
    shelfName: "羊皮紙",
    icon: BookMarked,
    bg: "#fbf6ec",
    text: "#2c241d",
    shelfClass: "bg-[#fbf6ec] border-[#8b5e3c]",
  },
  {
    id: "dark",
    name: "深色",
    shelfName: "深色",
    icon: Moon,
    bg: "#141416",
    text: "#d6d6dc",
    shelfClass: "bg-[#141416] border-[#444]",
  },
  {
    id: "oled",
    name: "純黑",
    shelfName: "純黑",
    icon: Sparkles,
    bg: "#000000",
    text: "#c8c8cf",
    shelfClass: "bg-[#000000] border-[#333]",
  },
  {
    id: "eyecare",
    name: "護眼綠",
    shelfName: "護眼",
    icon: Sun,
    bg: "#dcebd9",
    text: "#1e3321",
    shelfClass: "bg-[#dcebd9] border-[#2e663a]",
  },
  {
    id: "light",
    name: "極簡白",
    shelfName: "極簡白",
    icon: Sun,
    bg: "#fafafa",
    text: "#18181b",
    shelfClass: "bg-[#ffffff] border-[#ccc]",
  },
];

export interface FontFamilyConfig {
  id: FontFamilyId;
  name: string;
  className: string;
}

/** 閱讀器支援之排版字體樣式 */
export const FONT_FAMILIES: FontFamilyConfig[] = [
  { id: "serif", name: "宋體 / 明體", className: "font-serif-novel" },
  { id: "sans", name: "黑體", className: "font-sans-novel" },
  { id: "kaiti", name: "楷體", className: "font-kaiti-novel" },
];
