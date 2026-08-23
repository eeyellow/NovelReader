"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface UseTTSOptions {
  onParagraphChange?: (index: number) => void;
  onPageEnd?: () => void;
}

export function useTTS({ onParagraphChange, onPageEnd }: UseTTSOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentParagraphIdx, setCurrentParagraphIdx] = useState<number>(-1);
  const [rate, setRateState] = useState<number>(1.0);
  const [isSupported, setIsSupported] = useState(false);

  const paragraphsRef = useRef<string[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const rateRef = useRef<number>(1.0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setIsSupported(true);
      const savedRate = Number(localStorage.getItem("novel_reader_tts_rate")) || 1.0;
      setRateState(savedRate);
      rateRef.current = savedRate;
    }
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentParagraphIdx(-1);
    currentIndexRef.current = -1;
  }, []);

  const speakCurrent = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const paras = paragraphsRef.current;
    const idx = currentIndexRef.current;

    if (idx < 0 || idx >= paras.length) {
      // Reached the end of current chapter paragraphs
      if (onPageEnd) {
        onPageEnd();
      } else {
        stop();
      }
      return;
    }

    const textToSpeak = paras[idx].trim();
    if (!textToSpeak) {
      // Skip empty paragraph
      currentIndexRef.current = idx + 1;
      setCurrentParagraphIdx(idx + 1);
      speakCurrent();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utteranceRef.current = utterance;
    utterance.rate = rateRef.current;
    utterance.lang = "zh-TW";

    // Best effort Chinese voice selection
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(
      (v) => v.lang.includes("zh-TW") || v.lang.includes("zh_TW") || v.lang.includes("cmn-Hant")
    ) || voices.find((v) => v.lang.includes("zh"));
    if (zhVoice) {
      utterance.voice = zhVoice;
    }

    utterance.onend = () => {
      if (currentIndexRef.current < paragraphsRef.current.length - 1) {
        const nextIdx = currentIndexRef.current + 1;
        currentIndexRef.current = nextIdx;
        setCurrentParagraphIdx(nextIdx);
        if (onParagraphChange) {
          onParagraphChange(nextIdx);
        }
        speakCurrent();
      } else {
        if (onPageEnd) {
          onPageEnd();
        } else {
          stop();
        }
      }
    };

    utterance.onerror = (e) => {
      if (e.error !== "canceled" && e.error !== "interrupted") {
        console.warn("Speech synthesis error:", e);
      }
    };

    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  }, [onPageEnd, onParagraphChange, stop]);

  const startReading = useCallback(
    (paragraphs: string[], startIndex: number = 0) => {
      paragraphsRef.current = paragraphs;
      const initialIdx = Math.max(0, Math.min(paragraphs.length - 1, startIndex));
      currentIndexRef.current = initialIdx;
      setCurrentParagraphIdx(initialIdx);
      speakCurrent();
    },
    [speakCurrent]
  );

  const pause = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      } else {
        speakCurrent();
      }
      setIsPaused(false);
    }
  }, [speakCurrent]);

  const nextParagraph = useCallback(() => {
    if (currentIndexRef.current < paragraphsRef.current.length - 1) {
      currentIndexRef.current += 1;
      setCurrentParagraphIdx(currentIndexRef.current);
      speakCurrent();
    }
  }, [speakCurrent]);

  const prevParagraph = useCallback(() => {
    if (currentIndexRef.current > 0) {
      currentIndexRef.current -= 1;
      setCurrentParagraphIdx(currentIndexRef.current);
      speakCurrent();
    }
  }, [speakCurrent]);

  const setRate = useCallback(
    (newRate: number) => {
      const clamped = Math.max(0.75, Math.min(2.0, Number(newRate.toFixed(2))));
      setRateState(clamped);
      rateRef.current = clamped;
      if (typeof window !== "undefined") {
        localStorage.setItem("novel_reader_tts_rate", clamped.toString());
      }
      if (isPlaying && !isPaused) {
        speakCurrent();
      }
    },
    [isPlaying, isPaused, speakCurrent]
  );

  // Clean up speech synthesis when component unmounts
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    isSupported,
    isPlaying,
    isPaused,
    currentParagraphIdx,
    rate,
    startReading,
    pause,
    resume,
    stop,
    nextParagraph,
    prevParagraph,
    setRate,
  };
}
