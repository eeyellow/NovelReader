"use client";

import React, { useState, useRef } from "react";
import { X, MousePointerClick, RotateCcw, Sparkles, Check, Info } from "lucide-react";
import { GestureAction, GestureConfig, Point } from "@/lib/gesture/types";
import {
  DEFAULT_GESTURE_CONFIG,
  DEFAULT_GESTURE_MAP,
  GESTURE_INFOS,
  saveGestureConfig,
} from "@/lib/gesture/defaultGestures";
import { GestureRecognizer } from "@/lib/gesture/recognizer";

interface GestureSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GestureConfig;
  onConfigChange: (newConfig: GestureConfig) => void;
}

export const GestureSettingsModal: React.FC<GestureSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onConfigChange,
}) => {
  const [testResult, setTestResult] = useState<{
    gesture: string;
    actionName: string;
  } | null>(null);

  // 測試區畫布狀態
  const testCanvasRef = useRef<HTMLDivElement>(null);
  const isTesting = useRef(false);
  const testPoints = useRef<Point[]>([]);
  const [testTrail, setTestTrail] = useState<Point[]>([]);
  const recognizer = useRef(new GestureRecognizer(config.minDistance));

  if (!isOpen) return null;

  const updateConfig = (partial: Partial<GestureConfig>) => {
    const updated = { ...config, ...partial };
    onConfigChange(updated);
    saveGestureConfig(updated);
  };

  const handleReset = () => {
    if (confirm("確定要將滑鼠手勢設定還原為預設值嗎？")) {
      onConfigChange(DEFAULT_GESTURE_CONFIG);
      saveGestureConfig(DEFAULT_GESTURE_CONFIG);
    }
  };

  // 測試畫布事件監聽
  const handleTestMouseDown = (e: React.MouseEvent) => {
    if (e.button !== config.triggerButton) return;
    e.preventDefault();
    isTesting.current = true;
    const rect = testCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    testPoints.current = [p];
    setTestTrail([p]);
    setTestResult(null);
  };

  const handleTestMouseMove = (e: React.MouseEvent) => {
    if (!isTesting.current) return;
    const rect = testCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    testPoints.current.push(p);
    setTestTrail([...testPoints.current]);

    const gesture = recognizer.current.recognize(testPoints.current);
    if (gesture) {
      const act = config.customMap[gesture];
      setTestResult({
        gesture,
        actionName: act ? GESTURE_INFOS[act]?.name || act : "未對應動作",
      });
    }
  };

  const handleTestMouseUp = (e: React.MouseEvent) => {
    if (!isTesting.current || e.button !== config.triggerButton) return;
    isTesting.current = false;
    setTimeout(() => {
      setTestTrail([]);
    }, 400);
  };

  const pathData =
    testTrail.length > 1
      ? testTrail.reduce(
          (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
          ""
        )
      : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[var(--card-bg)] text-[var(--text-color)] border border-[var(--border-color)] w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MousePointerClick className="w-5 h-5 text-[var(--accent-color)]" />
            <h2 className="font-bold text-base">滑鼠手勢設定 (Mouse Gestures)</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--bg-color)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* 1. 總開關 */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)]">
            <div>
              <p className="font-bold text-sm">啟用滑鼠右鍵手勢</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                在閱讀畫面按住滑鼠右鍵拖曳即可快速執行翻頁、切換章節與開關目錄
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => updateConfig({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-neutral-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--accent-color)]"></div>
            </label>
          </div>

          {/* 2. 即時測試演練畫板 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold flex items-center gap-1.5 text-[var(--text-color)]">
                <Sparkles className="w-4 h-4 text-amber-500" /> 手勢試畫板（請在此區域按住滑鼠右鍵拖曳）
              </span>
              {testResult && (
                <span className="font-bold text-[var(--accent-color)] bg-[var(--accent-color)]/10 px-2 py-0.5 rounded-md">
                  {GestureRecognizer.toArrowSymbols(testResult.gesture)} → {testResult.actionName}
                </span>
              )}
            </div>
            <div
              ref={testCanvasRef}
              onMouseDown={handleTestMouseDown}
              onMouseMove={handleTestMouseMove}
              onMouseUp={handleTestMouseUp}
              onContextMenu={(e) => e.preventDefault()}
              className="relative h-28 w-full rounded-xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-color)]/60 flex items-center justify-center cursor-crosshair overflow-hidden select-none"
            >
              {pathData && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  <path
                    d={pathData}
                    fill="none"
                    stroke={config.strokeColor || "#3b82f6"}
                    strokeWidth={config.strokeWidth || 4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {!pathData && !testResult && (
                <p className="text-xs text-[var(--text-muted)] pointer-events-none">
                  🖱️ 按住右鍵在此處隨意劃線測試辨識效果
                </p>
              )}
            </div>
          </div>

          {/* 3. 手勢對照與清單 */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              預設手勢對照表
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {Object.entries(config.customMap).map(([gesture, action]) => {
                const info = GESTURE_INFOS[action];
                return (
                  <div
                    key={gesture}
                    className="p-2.5 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className="font-mono text-sm tracking-wider font-bold bg-[var(--card-bg)] px-2 py-1 rounded-lg border border-[var(--border-color)] shadow-xs">
                        {GestureRecognizer.toArrowSymbols(gesture)}
                      </span>
                      <div>
                        <p className="font-bold text-[var(--text-color)]">{info?.name || action}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">{info?.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. 進階微調選項 */}
          <div className="space-y-3 pt-2 border-t border-[var(--border-color)]">
            <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
              辨識與顯示偏好
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 顯示軌跡開關 */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] text-xs">
                <span>繪製手勢軌跡 (Show Trail)</span>
                <input
                  type="checkbox"
                  checked={config.showTrail}
                  onChange={(e) => updateConfig({ showTrail: e.target.checked })}
                  className="rounded accent-[var(--accent-color)] w-4 h-4"
                />
              </label>

              {/* 顯示 HUD 提示開關 */}
              <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] text-xs">
                <span>游標旁 HUD 動作提示 (HUD Tooltip)</span>
                <input
                  type="checkbox"
                  checked={config.showHUD}
                  onChange={(e) => updateConfig({ showHUD: e.target.checked })}
                  className="rounded accent-[var(--accent-color)] w-4 h-4"
                />
              </label>
            </div>

            {/* 辨識靈敏度 */}
            <div className="p-3 rounded-xl bg-[var(--bg-color)] border border-[var(--border-color)] space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold">
                <span>辨識位移閾值 (Sensitivity)</span>
                <span className="text-[var(--accent-color)]">{config.minDistance} px</span>
              </div>
              <input
                type="range"
                min="14"
                max="40"
                value={config.minDistance}
                onChange={(e) => updateConfig({ minDistance: Number(e.target.value) })}
                className="w-full h-1.5 bg-[var(--border-color)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-color)]"
              />
              <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                <span>更靈敏（短位移觸發）</span>
                <span>更抗誤觸（長位移判定）</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-color)] flex items-center justify-between bg-[var(--header-bg)]">
          <button
            onClick={handleReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs rounded-xl border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重設為預設</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-[var(--accent-color)] text-white hover:opacity-90 transition-opacity shadow-sm"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
