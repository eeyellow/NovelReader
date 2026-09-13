import { NextRequest, NextResponse } from "next/server";
import { BookModel, UPLOADS_DIR } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = getSessionFromRequest(req);
    const userId = session?.id || "default_user";
    const book = BookModel.getById(id, userId);
    if (!book) {
      return NextResponse.json(
        { success: false, error: "Book not found" },
        { status: 404 }
      );
    }

    let parsedChapters: any[] | null = null;
    if (book.chapters_json) {
      try {
        parsedChapters = JSON.parse(book.chapters_json);
      } catch (e) {
        console.warn("Failed to parse chapters_json:", e);
      }
    }

    // 若為既有舊書且尚未存有預解析章節，於後端自動補齊解析並持久化
    if (!parsedChapters || parsedChapters.length === 0) {
      try {
        const filePath = path.join(UPLOADS_DIR, book.file_name);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          const { extractChapters } = await import("@/lib/parser");
          parsedChapters = extractChapters(content);
          BookModel.updateChapters(id, JSON.stringify(parsedChapters));
        }
      } catch (e) {
        console.warn("Lazy chapter generation failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      book,
      chapters: parsedChapters || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch book" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = getSessionFromRequest(req);
    const book = BookModel.getById(id);
    if (!book) {
      return NextResponse.json(
        { success: false, error: "Book not found" },
        { status: 404 }
      );
    }

    // Check permissions: admin, default_user or the original uploader can delete
    const isAuthorized =
      !book.uploader_id ||
      book.uploader_id === "default_user" ||
      session?.role === "admin" ||
      (session?.id && book.uploader_id === session.id);

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "您沒有權限刪除其他使用者上傳的書籍" },
        { status: 403 }
      );
    }

    BookModel.delete(id);
    return NextResponse.json({ success: true, message: "Book deleted" });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete book" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = getSessionFromRequest(req);
    const book = BookModel.getById(id);
    if (!book) {
      return NextResponse.json(
        { success: false, error: "找不到該書籍" },
        { status: 404 }
      );
    }

    const isAuthorized =
      !book.uploader_id ||
      book.uploader_id === "default_user" ||
      session?.role === "admin" ||
      (session?.id && book.uploader_id === session.id);

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "您沒有權限修改其他使用者上傳的書籍名稱" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { title } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { success: false, error: "書名不得為空" },
        { status: 400 }
      );
    }

    const trimmedTitle = title.trim();
    BookModel.updateTitle(id, trimmedTitle);
    const updatedBook = BookModel.getById(id, session?.id || "default_user");

    if (!updatedBook) {
      return NextResponse.json(
        { success: false, error: "找不到該書籍" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, book: updatedBook });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "更新書名失敗" },
      { status: 500 }
    );
  }
}
