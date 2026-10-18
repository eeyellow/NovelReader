import { NextRequest, NextResponse } from "next/server";
import { BookModel, UPLOADS_DIR } from "@/lib/db";
import { decodeToUtf8 } from "@/lib/encoding";
import { convertToTraditional } from "@/lib/chinese";
import fs from "fs";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const books = BookModel.getAll();
    return NextResponse.json(
      { success: true, books },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
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
      const decoded = decodeToUtf8(rawBuffer);
      text = decoded.text;
      detectedEncoding = decoded.detectedEncoding;
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "小說檔案內容為空或無法讀取" },
        { status: 400 }
      );
    }

    let sanitizedTitle = titleOverride || detectedTitle;

    if (shouldConvertToTraditional) {
      text = convertToTraditional(text);
      sanitizedTitle = convertToTraditional(sanitizedTitle);
    }

    const idOverride = formData.get("id") as string | null;
    let bookId = `b_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    if (idOverride && /^[a-zA-Z0-9_-]+$/.test(idOverride)) {
      bookId = idOverride;
    }
    const fileName = `${bookId}.txt`;
    const targetFilePath = path.join(UPLOADS_DIR, fileName);

    fs.writeFileSync(targetFilePath, text, "utf-8");

    const totalChars = text.length;
    const fileSize = Buffer.byteLength(text, "utf-8");

    const { extractChapters } = await import("@/lib/parser");
    const parsedChapters = extractChapters(text);
    const chaptersJson = JSON.stringify(parsedChapters);

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
      chapters: parsedChapters,
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
