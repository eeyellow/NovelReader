/**
 * @file ThemeDropdown.tsx
 * @description 書架主題下拉切換選單組件
 */

import React from "react";
import { Palette, Check } from "lucide-react";
import { THEMES } from "@/constants/themes";

interface ThemeDropdownProps {
  currentTheme: string;
  showThemeMenu: boolean;
  themeMenuRef: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onSelectTheme: (themeId: string) => void;
}

export const ThemeDropdown: React.FC<ThemeDropdownProps> = ({
  currentTheme,
  showThemeMenu,
  themeMenuRef,
  onToggle,
  onSelectTheme,
}) => {
  return (
    <div className="relative" ref={themeMenuRef}>
      <button
        onClick={onToggle}
        className={`p-2 rounded-lg border border-[var(--border-color)] transition-colors ${
          showThemeMenu
            ? "bg-[var(--accent-color)] text-white border-[var(--accent-color)]"
            : "text-[var(--text-muted)] hover:text-[var(--text-color)] hover:border-[var(--accent-color)]"
        }`}
        title="切換佈景主題"
        aria-label="切換佈景主題"
        aria-expanded={showThemeMenu}
      >
        <Palette className="w-4 h-4" />
      </button>

      {showThemeMenu && (
        <div className="absolute right-0 mt-2 w-36 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] shadow-lg py-1 z-50">
          {THEMES.map((theme) => {
            const Icon = theme.icon;
            const isActive = currentTheme === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => {
                  onSelectTheme(theme.id);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                  isActive
                    ? "text-[var(--accent-color)] font-semibold bg-[var(--accent-color)]/10"
                    : "text-[var(--text-color)] hover:bg-[var(--bg-color)]"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{theme.shelfName}</span>
                </div>
                {isActive && <Check className="w-3.5 h-3.5 text-[var(--accent-color)] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
