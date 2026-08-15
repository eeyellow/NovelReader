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

    // Auto-detect encoding and convert to standard UTF-8 string
    let { text, detectedEncoding } = decodeToUtf8(rawBuffer);

    // Check if simplified
    const isSimplified = isSimplifiedChinese(text);

    let sanitizedTitle =
      titleOverride ||
      originalName.replace(/\.[^/.]+$/, "").trim() ||
      "未命名小說";

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

    // Insert to DB
    BookModel.create({
      id: bookId,
      title: sanitizedTitle,
      file_name: fileName,
      file_size: fileSize,
      total_chars: totalChars,
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
