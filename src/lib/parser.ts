export interface Chapter {
  index: number;
  title: string;
  charOffset: number;
  length?: number;
}

const CHAPTER_REGEX =
  /(?:^|\r?\n)\s*(第[0-9一二三四五六七八九十百千萬]+[章回節卷集部篇幕話][^\r\n]{0,45}|(?:Chapter|CHAPTER)\s*[0-9]+[^\r\n]{0,45}|【第[0-9一二三四五六七八九十百千萬]+[卷部篇]】[^\r\n]{0,45}|卷[0-9一二三四五六七八九十百千萬]+[\s\t]+第[0-9一二三四五六七八九十百千萬]+[章回][^\r\n]{0,45}|[0-9]{1,4}[\s\.\、\-\:：]+[^\r\n]{1,35}|序[章言幕]|尾聲|後記|前言|番外[^\r\n]{0,45}|楔子|結語|終章[^\r\n]{0,35})/g;

/**
 * Parses chapter titles and character offsets from plain text
 */
export function extractChapters(text: string): Chapter[] {
  const chapters: Chapter[] = [];
  let match: RegExpExecArray | null;
  CHAPTER_REGEX.lastIndex = 0;

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

  // 大長篇小說優化：若單章字數超過 15,000 字，自動在段落換行邊界進行分片分割，防止 DOM 節點膨脹與 CSS Columns 卡頓
  const MAX_CHUNK_LENGTH = 15000;
  const chunkedChapters: Chapter[] = [];

  for (const chapter of chapters) {
    const chLen = chapter.length || 0;
    if (chLen <= MAX_CHUNK_LENGTH) {
      chunkedChapters.push(chapter);
      continue;
    }

    // 需分割的超大章節
    let currentStart = chapter.charOffset;
    const chapterEnd = chapter.charOffset + chLen;
    let partNum = 1;

    while (currentStart < chapterEnd) {
      const remainingLen = chapterEnd - currentStart;
      if (remainingLen <= MAX_CHUNK_LENGTH) {
        chunkedChapters.push({
          index: 0,
          title: partNum === 1 ? chapter.title : `${chapter.title} (${partNum})`,
          charOffset: currentStart,
          length: remainingLen,
        });
        break;
      }

      // 在 MAX_CHUNK_LENGTH 附近尋找最近的段落換行符號 (\n)
      const targetSplitPoint = currentStart + MAX_CHUNK_LENGTH;
      const searchWindow = text.slice(targetSplitPoint - 500, targetSplitPoint + 500);
      const newlineIdx = searchWindow.lastIndexOf("\n");

      let splitOffset = targetSplitPoint;
      if (newlineIdx !== -1) {
        splitOffset = targetSplitPoint - 500 + newlineIdx + 1;
      }

      const chunkLength = splitOffset - currentStart;
      chunkedChapters.push({
        index: 0,
        title: partNum === 1 ? `${chapter.title} (1)` : `${chapter.title} (${partNum})`,
        charOffset: currentStart,
        length: chunkLength,
      });

      currentStart = splitOffset;
      partNum++;
    }
  }

  // 重新建立連續章節索引
  return chunkedChapters.map((ch, idx) => ({
    ...ch,
    index: idx,
  }));
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
