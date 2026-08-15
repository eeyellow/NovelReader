import jschardet from "jschardet";

/**
 * Automatically detects the text encoding of a buffer or Uint8Array (UTF-8, Big5, GBK, GB2312, Shift_JIS, etc.)
 * and decodes it to a standard UTF-8 JavaScript string.
 * Universal: works in both Node.js and Browser client environments.
 */
export function decodeToUtf8(buffer: Uint8Array | ArrayBuffer | Buffer): {
  text: string;
  detectedEncoding: string;
  confidence: number;
} {
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const sample = uint8.subarray(0, Math.min(uint8.length, 65536));

  let detected: { encoding?: string; confidence?: number } = {};
  try {
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
      detected = jschardet.detect(Buffer.from(sample));
    } else {
      let binary = "";
      const len = sample.length;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(sample[i]);
      }
      detected = jschardet.detect(binary);
    }
  } catch (err) {
    console.warn("jschardet detection error, default to utf-8:", err);
  }

  let encoding = (detected.encoding || "utf-8").toLowerCase();

  // Normalize common Chinese encoding names
  if (
    encoding.includes("gb2312") ||
    encoding.includes("gbk") ||
    encoding.includes("gb18030") ||
    encoding.includes("hz-gb-2312")
  ) {
    encoding = "gb18030"; // gb18030 covers GBK and GB2312
  } else if (encoding.includes("big5") || encoding.includes("cp950")) {
    encoding = "big5";
  } else if (encoding.includes("utf-8") || encoding.includes("ascii")) {
    encoding = "utf-8";
  }

  try {
    const decoder = new TextDecoder(encoding);
    const text = decoder.decode(uint8);
    return {
      text,
      detectedEncoding: encoding,
      confidence: detected.confidence || 1,
    };
  } catch (error) {
    console.warn(`Failed to decode with ${encoding}, falling back to utf-8`, error);
    const fallbackDecoder = new TextDecoder("utf-8");
    return {
      text: fallbackDecoder.decode(uint8),
      detectedEncoding: "utf-8-fallback",
      confidence: 0,
    };
  }
}
