import JSZip from "jszip";

interface ParsedEpub {
  title: string;
  text: string;
  totalChars: number;
}

/**
 * Strips HTML tags and unescapes basic HTML entities into clean readable plain text
 */
function htmlToPlainText(html: string): string {
  if (!html) return "";

  // Replace block elements and line breaks with newlines
  let clean = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|section|article)>/gi, "\n")
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<hr\s*[\/]?>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  // Unescape standard HTML entities
  clean = clean
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&hellip;/gi, "…")
    .replace(/&#([0-9]{1,7});/gi, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]{1,6});/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

  // Normalize multi-newlines
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.join("\n\n");
}

/**
 * Parses an EPUB buffer / file and extracts clean text and title
 */
export async function parseEpub(buffer: ArrayBuffer | Uint8Array | Buffer): Promise<ParsedEpub> {
  const zip = await JSZip.loadAsync(buffer);

  // 1. Read META-INF/container.xml
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) {
    throw new Error("Invalid EPUB: META-INF/container.xml not found");
  }

  const containerXml = await containerFile.async("text");
  const opfPathMatch = containerXml.match(/full-path="([^"]+)"/i);
  if (!opfPathMatch) {
    throw new Error("Invalid EPUB: OPF rootfile not found in container.xml");
  }

  const opfPath = opfPathMatch[1];
  const opfDir = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`Invalid EPUB: OPF file at ${opfPath} not found`);
  }

  const opfXml = await opfFile.async("text");

  // 2. Extract Title from dc:title
  let title = "未命名小說";
  const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  if (titleMatch && titleMatch[1].trim()) {
    title = titleMatch[1].trim();
  }

  // 3. Extract manifest items (id -> href)
  const manifestMap: Record<string, string> = {};
  const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(opfXml)) !== null) {
    manifestMap[itemMatch[1]] = itemMatch[2];
  }

  // Fallback for reversed attribute order (href then id)
  const itemRegex2 = /<item\s+[^>]*href="([^"]+)"[^>]*id="([^"]+)"[^>]*>/gi;
  while ((itemMatch = itemRegex2.exec(opfXml)) !== null) {
    manifestMap[itemMatch[2]] = itemMatch[1];
  }

  // 4. Extract spine order
  const spineIds: string[] = [];
  const itemrefRegex = /<itemref\s+[^>]*idref="([^"]+)"[^>]*>/gi;
  let spineMatch: RegExpExecArray | null;
  while ((spineMatch = itemrefRegex.exec(opfXml)) !== null) {
    spineIds.push(spineMatch[1]);
  }

  // 5. Read chapter files in spine order
  const chapterTexts: string[] = [];

  for (const id of spineIds) {
    const relativeHref = manifestMap[id];
    if (!relativeHref) continue;

    // Resolve full path inside zip
    const decodedHref = decodeURIComponent(relativeHref);
    const fullPath = opfDir + decodedHref;

    const file = zip.file(fullPath) || zip.file(decodedHref);
    if (!file) continue;

    const htmlContent = await file.async("text");
    const plain = htmlToPlainText(htmlContent);
    if (plain) {
      chapterTexts.push(plain);
    }
  }

  const fullText = chapterTexts.join("\n\n");

  return {
    title,
    text: fullText,
    totalChars: fullText.length,
  };
}
