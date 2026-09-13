/**
 * @file useReaderSettings.ts
 * @description 閱讀器排版偏好設定管理 Hook，封裝主題、字型大小、行距、寬度、翻頁模式等設定與本機持久化
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ThemeId,
  FontFamilyId,
  MaxWidthMode,
  ClickDirection,
  ChineseVariant,
  ReadingMode,
  TextAlignMode,
  PaddingMode,
} from "@/types/reader";
import { FONT_FAMILIES } from "@/constants/themes";

export function useReaderSettings(onActivity?: () => void) {
  const [theme, setTheme] = useState<string>("parchment");
  const [fontSize, setFontSize] = useState<number>(19);
  const [lineHeight, setLineHeight] = useState<number>(1.85);
  const [fontFamily, setFontFamily] = useState<FontFamilyId>("serif");
  const [maxWidthMode, setMaxWidthMode] = useState<MaxWidthMode>("normal");
  const [clickDirection, setClickDirection] = useState<ClickDirection>("standard");
  const [chineseVariant, setChineseVariant] = useState<ChineseVariant>("original");
  const [readMode, setReadMode] = useState<ReadingMode>("paginated");
  const [textAlign, setTextAlign] = useState<TextAlignMode>("justify");
  const [paddingMode, setPaddingMode] = useState<PaddingMode>("normal");

  // 從 localStorage 載入使用者偏好
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedTheme = localStorage.getItem("novel_reader_theme") || "parchment";
    const savedFontSize = Number(localStorage.getItem("novel_reader_font_size")) || 19;
    const savedLineHeight = Number(localStorage.getItem("novel_reader_line_height")) || 1.85;
    const savedFontFamily =
      (localStorage.getItem("novel_reader_font_family") as FontFamilyId) || "serif";
    const savedMaxWidth =
      (localStorage.getItem("novel_reader_max_width") as MaxWidthMode) || "normal";
    const savedClickDirection =
      (localStorage.getItem("novel_reader_click_direction") as ClickDirection) || "standard";
    const savedReadMode =
      (localStorage.getItem("novel_reader_read_mode") as ReadingMode) || "paginated";
    const savedTextAlign =
      (localStorage.getItem("novel_reader_text_align") as TextAlignMode) || "justify";
    const savedPadding =
      (localStorage.getItem("novel_reader_padding_mode") as PaddingMode) || "normal";
    const savedChineseVariant =
      (localStorage.getItem("novel_reader_chinese_variant") as ChineseVariant) || "original";

    setTheme(savedTheme);
    setFontSize(savedFontSize);
    setLineHeight(savedLineHeight);
    setFontFamily(savedFontFamily);
    setMaxWidthMode(savedMaxWidth);
    setClickDirection(savedClickDirection);
    setReadMode(savedReadMode);
    setTextAlign(savedTextAlign);
    setPaddingMode(savedPadding);
    setChineseVariant(savedChineseVariant);
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  const updateTheme = useCallback((newTheme: string) => {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("novel_reader_theme", newTheme);
  }, []);

  const cycleTheme = useCallback(() => {
    const themeOrder = ["parchment", "dark", "oled", "eyecare", "light"];
    setTheme((prevTheme) => {
      const nextIdx = (themeOrder.indexOf(prevTheme) + 1) % themeOrder.length;
      const nextTheme = themeOrder[nextIdx];
      document.documentElement.setAttribute("data-theme", nextTheme);
      localStorage.setItem("novel_reader_theme", nextTheme);
      return nextTheme;
    });
  }, []);

  const updateFontSize = useCallback((delta: number) => {
    setFontSize((prev) => {
      const next = Math.max(14, Math.min(32, prev + delta));
      localStorage.setItem("novel_reader_font_size", next.toString());
      return next;
    });
  }, []);

  const updateLineHeight = useCallback((val: number) => {
    setLineHeight(val);
    localStorage.setItem("novel_reader_line_height", val.toString());
  }, []);

  const updateFontFamily = useCallback((val: FontFamilyId) => {
    setFontFamily(val);
    localStorage.setItem("novel_reader_font_family", val);
  }, []);

  const updateMaxWidth = useCallback((val: MaxWidthMode) => {
    setMaxWidthMode(val);
    localStorage.setItem("novel_reader_max_width", val);
  }, []);

  const updateClickDirection = useCallback((val: ClickDirection) => {
    setClickDirection(val);
    localStorage.setItem("novel_reader_click_direction", val);
  }, []);

  const updateReadMode = useCallback(
    (mode: ReadingMode) => {
      setReadMode(mode);
      localStorage.setItem("novel_reader_read_mode", mode);
      onActivity?.();
    },
    [onActivity]
  );

  const updateTextAlign = useCallback((val: TextAlignMode) => {
    setTextAlign(val);
    localStorage.setItem("novel_reader_text_align", val);
  }, []);

  const updatePaddingMode = useCallback((val: PaddingMode) => {
    setPaddingMode(val);
    localStorage.setItem("novel_reader_padding_mode", val);
  }, []);

  const updateChineseVariant = useCallback(
    (val: ChineseVariant) => {
      setChineseVariant(val);
      localStorage.setItem("novel_reader_chinese_variant", val);
      onActivity?.();
    },
    [onActivity]
  );

  // 依據寬度設定對應之 Tailwind class
  const maxWidthClass = useMemo(() => {
    switch (maxWidthMode) {
      case "narrow":
        return "max-w-xl";
      case "wide":
        return "max-w-4xl";
      default:
        return "max-w-2xl";
    }
  }, [maxWidthMode]);

  // 依據留白設定對應之 Tailwind class
  const paddingClass = useMemo(() => {
    switch (paddingMode) {
      case "compact":
        return "px-2.5 sm:px-5";
      case "spacious":
        return "px-6 sm:px-12";
      default:
        return "px-4 sm:px-8";
    }
  }, [paddingMode]);

  // 依據字體設定對應之 font class
  const currentFontClass = useMemo(() => {
    return FONT_FAMILIES.find((f) => f.id === fontFamily)?.className || "font-serif-novel";
  }, [fontFamily]);

  return {
    theme,
    fontSize,
    lineHeight,
    fontFamily,
    maxWidthMode,
    clickDirection,
    chineseVariant,
    readMode,
    textAlign,
    paddingMode,
    maxWidthClass,
    paddingClass,
    currentFontClass,
    updateTheme,
    cycleTheme,
    updateFontSize,
    updateLineHeight,
    updateFontFamily,
    updateMaxWidth,
    updateClickDirection,
    updateReadMode,
    updateTextAlign,
    updatePaddingMode,
    updateChineseVariant,
  };
}
