export interface Chapter {
  index: number;
  title: string;
  charOffset: number;
  length?: number;
}

const CHAPTER_REGEX =
  /(?:^|\r?\n)\s*(第[0-9一二三四五六七八九十百千萬]+[章回節卷集部篇幕][^\r\n]{0,35}|(?:Chapter|CHAPTER)\s+[0-9]+[^\r\n]{0,35}|序[章言]|尾聲|後記|前言|番外[^\r\n]{0,35})/g;

/**
 * Parses chapter titles and character offsets from plain text
 */
export function extractChapters(text: string): Chapter[] {
  const chapters: Chapter[] = [];
  let match: RegExpExecArray | null;

  // Always include starting chapter if text doesn't start with a chapter header
  let firstChapterOffset = 0;

  while ((match = CHAPTER_REGEX.exec(text)) !== null) {
    const title = match[1].trim();
    // Offset is start of the match within text
    const charOffset = match.index + (match[0].indexOf(title));

    if (chapters.length === 0 && charOffset > 0) {
      chapters.push({
        index: 0,
        title: "開始 (正文前言)",
        charOffset: 0,
      });
    }

    chapters.push({
      index: chapters.length,
      title,
      charOffset,
    });
  }

  if (chapters.length === 0) {
    chapters.push({
      index: 0,
      title: "全文",
      charOffset: 0,
    });
  }

  // Calculate chapter lengths
  for (let i = 0; i < chapters.length; i++) {
    const nextOffset =
      i + 1 < chapters.length ? chapters[i + 1].charOffset : text.length;
    chapters[i].length = nextOffset - chapters[i].charOffset;
  }

  return chapters;
}

/**
 * Finds the current chapter index given a character offset
 */
export function findCurrentChapter(chapters: Chapter[], charOffset: number): number {
  if (chapters.length === 0) return 0;
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (charOffset >= chapters[i].charOffset) {
      return i;
    }
  }
  return 0;
}
