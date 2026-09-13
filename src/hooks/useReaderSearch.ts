/**
 * @file useReaderSearch.ts
 * @description 閱讀器書內全文檢索 Hook，封裝高效關鍵字全文檢索演算法與結果脈絡高亮片段生成
 */

import { useState, useCallback } from "react";
import { Chapter, findCurrentChapter } from "@/lib/parser";
import { convertToTraditional, convertToSimplified } from "@/lib/chinese";
import { SearchResultItem } from "@/types/reader";

interface UseReaderSearchOptions {
  fullText: string;
  chapters: Chapter[];
  onJumpToResult: (result: { chapterIndex: number; charOffset: number }) => void;
  onActivity?: () => void;
}

export function useReaderSearch({
  fullText,
  chapters,
  onJumpToResult,
  onActivity,
}: UseReaderSearchOptions) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 執行書內全文搜尋（支援簡繁雙向跨字集檢索）
  const performSearch = useCallback(
    (query: string) => {
      if (!query.trim() || !fullText) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      const q = query.trim();
      const lowerFull = fullText.toLowerCase();
      const lowerQ = q.toLowerCase();
      const tradQ = convertToTraditional(q).toLowerCase();
      const simpQ = convertToSimplified(q).toLowerCase();

      // 搜集所有搜尋關鍵字變體
      const queryVariants = Array.from(new Set([lowerQ, tradQ, simpQ])).filter(Boolean);
      const results: SearchResultItem[] = [];
      const matchedOffsets = new Set<number>();

      for (const variant of queryVariants) {
        let pos = 0;
        while (results.length < 80 && pos < lowerFull.length) {
          const matchIdx = lowerFull.indexOf(variant, pos);
          if (matchIdx === -1) break;

          if (!matchedOffsets.has(matchIdx)) {
            matchedOffsets.add(matchIdx);
            const chIdx = findCurrentChapter(chapters, matchIdx);
            const chTitle = chapters[chIdx]?.title || "正文";
            const snippetStart = Math.max(0, matchIdx - 22);
            const snippetEnd = Math.min(fullText.length, matchIdx + variant.length + 30);

            results.push({
              chapterIndex: chIdx,
              chapterTitle: chTitle,
              charOffset: matchIdx,
              snippetBefore: fullText.slice(snippetStart, matchIdx),
              matchText: fullText.slice(matchIdx, matchIdx + variant.length),
              snippetAfter: fullText.slice(matchIdx + variant.length, snippetEnd),
            });
          }

          pos = matchIdx + Math.max(1, variant.length);
        }
      }

      // 按全文位置先後重新排序
      results.sort((a, b) => a.charOffset - b.charOffset);
      setSearchResults(results.slice(0, 80));
      setIsSearching(false);
    },
    [fullText, chapters]
  );

  // 跳轉至搜尋結果
  const jumpToSearchResult = useCallback(
    (result: SearchResultItem) => {
      onActivity?.();
      onJumpToResult({ chapterIndex: result.chapterIndex, charOffset: result.charOffset });
      setShowSearchModal(false);
    },
    [onJumpToResult, onActivity]
  );

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  return {
    showSearchModal,
    setShowSearchModal,
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    performSearch,
    jumpToSearchResult,
    clearSearch,
  };
}
