/**
 * @file TTSPlayerWidget.tsx
 * @description 閱讀器語音朗讀 (TTS) 懸浮播放卡片組件，支援段落切換、暫停/播放與語速倍率切換
 */

import React from "react";
import { Volume2, X, SkipBack, SkipForward, Play, Pause } from "lucide-react";

interface TTSPlayerWidgetProps {
  isOpen: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  currentParagraphIdx: number;
  totalParagraphs: number;
  rate: number;
  onClose: () => void;
  onPrevParagraph: () => void;
  onTogglePlay: () => void;
  onNextParagraph: () => void;
  onSetRate: (rate: number) => void;
}

export const TTSPlayerWidget: React.FC<TTSPlayerWidgetProps> = ({
  isOpen,
  isPlaying,
  isPaused,
  currentParagraphIdx,
  totalParagraphs,
  rate,
  onClose,
  onPrevParagraph,
  onTogglePlay,
  onNextParagraph,
  onSetRate,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-20 inset-x-4 sm:inset-x-auto sm:right-6 z-40 max-w-sm bg-[var(--card-bg)] border border-[var(--border-color)] rounded-2xl p-3.5 shadow-2xl backdrop-blur-md animate-fade-in space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-[var(--accent-color)]/15 text-[var(--accent-color)]">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold">語音朗讀中</p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {currentParagraphIdx >= 0
                ? `第 ${currentParagraphIdx + 1} / ${totalParagraphs} 段`
                : "就緒"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text-color)] p-1 rounded-lg"
          title="關閉朗讀"
          aria-label="關閉朗讀"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)]/60 gap-1">
        <div className="flex items-center space-x-1">
          <button
            onClick={onPrevParagraph}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-color)] text-[var(--text-color)]"
            title="上一段"
            aria-label="上一段"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={onTogglePlay}
            className="p-2 rounded-xl bg-[var(--accent-color)] text-white shadow-sm hover:opacity-90 transition-opacity"
            title={isPlaying && !isPaused ? "暫停" : "播放"}
            aria-label={isPlaying && !isPaused ? "暫停" : "播放"}
          >
            {isPlaying && !isPaused ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onNextParagraph}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-color)] text-[var(--text-color)]"
            title="下一段"
            aria-label="下一段"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Rate speed buttons */}
        <div className="flex items-center space-x-1">
          {[1.0, 1.25, 1.5, 1.8].map((s) => (
            <button
              key={s}
              onClick={() => onSetRate(s)}
              className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                rate === s
                  ? "bg-[var(--accent-color)] text-white"
                  : "bg-[var(--bg-color)] text-[var(--text-muted)] hover:text-[var(--text-color)]"
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
