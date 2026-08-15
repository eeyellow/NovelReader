import { NextRequest, NextResponse } from "next/server";
import { BookModel, UPLOADS_DIR } from "@/lib/db";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const book = BookModel.getById(id);
    if (!book) {
      return NextResponse.json(
        { success: false, error: "Book not found" },
        { status: 404 }
      );
    }

    const filePath = path.join(UPLOADS_DIR, book.file_name);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: "File not found on disk" },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(filePath, "utf-8");

    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to read content" },
      { status: 500 }
    );
  }
}
