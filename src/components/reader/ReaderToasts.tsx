/**
 * @file ReaderToasts.tsx
 * @description 閱讀器章節切換通知提示組件
 */

import React from "react";
import { BookMarked } from "lucide-react";

interface ReaderToastsProps {
  chapterSwitchToast: string | null;
}

export const ReaderToasts: React.FC<ReaderToastsProps> = ({
  chapterSwitchToast,
}) => {
  if (!chapterSwitchToast) return null;

  return (
    <div className="fixed top-16 inset-x-0 mx-auto w-fit z-50 bg-[var(--accent-color)] text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center space-x-1.5 animate-fade-in truncate max-w-[85vw]">
      <BookMarked className="w-4 h-4 shrink-0" />
      <span className="truncate">{chapterSwitchToast}</span>
    </div>
  );
};
