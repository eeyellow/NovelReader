import { NextRequest, NextResponse } from "next/server";
import { BookModel, UPLOADS_DIR } from "@/lib/db";
import { decodeToUtf8 } from "@/lib/encoding";
import { convertToTraditional, isSimplifiedChinese } from "@/lib/chinese";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const books = BookModel.getAll();
    return NextResponse.json({ success: true, books });
  } catch (error: any) {
    console.error("Failed to fetch books:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch books" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const titleOverride = formData.get("title") as string | null;
    const shouldConvertToTraditional =
      formData.get("convertToTraditional") === "true";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const originalName = file.name;
    const rawBuffer = Buffer.from(await file.arrayBuffer());
    let text = "";
    let detectedEncoding = "UTF-8";
    let detectedTitle = originalName.replace(/\.[^/.]+$/, "").trim() || "未命名小說";

    if (originalName.toLowerCase().endsWith(".epub")) {
      const { parseEpub } = await import("@/lib/epub");
      const parsedEpub = await parseEpub(rawBuffer);
      text = parsedEpub.text;
      if (parsedEpub.title && parsedEpub.title !== "未命名小說") {
        detectedTitle = parsedEpub.title;
      }
      detectedEncoding = "EPUB/UTF-8";
    } else {
      // Auto-detect encoding and convert to standard UTF-8 string for TXT
      const decoded = decodeToUtf8(rawBuffer);
      text = decoded.text;
      detectedEncoding = decoded.detectedEncoding;
    }

    let sanitizedTitle = titleOverride || detectedTitle;

    // If requested, convert entire text and title to Traditional Chinese
    if (shouldConvertToTraditional) {
      text = convertToTraditional(text);
      sanitizedTitle = convertToTraditional(sanitizedTitle);
    }

    // Generate book ID and sanitized filename
    const bookId = `b_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const fileName = `${bookId}.txt`;
    const targetFilePath = path.join(UPLOADS_DIR, fileName);

    // Save as standard UTF-8 file
    fs.writeFileSync(targetFilePath, text, "utf-8");

    const totalChars = text.length;
    const fileSize = Buffer.byteLength(text, "utf-8");

    // 於後端 Node.js 環境預先解析章節結構，減輕前端瀏覽器主執行緒負荷
    const { extractChapters } = await import("@/lib/parser");
    const parsedChapters = extractChapters(text);
    const chaptersJson = JSON.stringify(parsedChapters);

    // Insert to DB
    BookModel.create({
      id: bookId,
      title: sanitizedTitle,
      file_name: fileName,
      file_size: fileSize,
      total_chars: totalChars,
      chapters_json: chaptersJson,
    });

    const createdBook = BookModel.getById(bookId);

    return NextResponse.json({
      success: true,
      book: createdBook,
      detectedEncoding,
    });
  } catch (error: any) {
    console.error("Failed to upload book:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}
