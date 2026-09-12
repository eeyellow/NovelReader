/**
 * @file useReaderSearch.ts
 * @description 閱讀器書內全文檢索 Hook，封裝高效關鍵字全文檢索演算法與結果脈絡高亮片段生成
 */

import { useState, useCallback } from "react";
import { Chapter, findCurrentChapter } from "@/lib/parser";
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

  // 執行書內全文搜尋
  const performSearch = useCallback(
    (query: string) => {
      if (!query.trim() || !fullText) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      const q = query.trim();
      const results: SearchResultItem[] = [];
      let pos = 0;
      const lowerFull = fullText.toLowerCase();
      const lowerQ = q.toLowerCase();

      while (results.length < 80) {
        const matchIdx = lowerFull.indexOf(lowerQ, pos);
        if (matchIdx === -1) break;

        const chIdx = findCurrentChapter(chapters, matchIdx);
        const chTitle = chapters[chIdx]?.title || "正文";
        const snippetStart = Math.max(0, matchIdx - 22);
        const snippetEnd = Math.min(fullText.length, matchIdx + q.length + 30);

        results.push({
          chapterIndex: chIdx,
          chapterTitle: chTitle,
          charOffset: matchIdx,
          snippetBefore: fullText.slice(snippetStart, matchIdx),
          matchText: fullText.slice(matchIdx, matchIdx + q.length),
          snippetAfter: fullText.slice(matchIdx + q.length, snippetEnd),
        });

        pos = matchIdx + Math.max(1, q.length);
      }
      setSearchResults(results);
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
