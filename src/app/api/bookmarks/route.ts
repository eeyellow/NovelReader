import { NextRequest, NextResponse } from "next/server";
import { BookmarkModel } from "@/lib/db";
import { getSessionFromRequest } from "@/lib/auth";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get("bookId");

    if (!bookId) {
      return NextResponse.json(
        { success: false, error: "bookId is required" },
        { status: 400 }
      );
    }

    const session = getSessionFromRequest(req);
    const userId = session?.id || searchParams.get("userId") || "default_user";
    const bookmarks = BookmarkModel.getAllByBookId(bookId, userId);
    return NextResponse.json({ success: true, bookmarks });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch bookmarks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { book_id, char_offset, title, preview_text } = body;

    if (!book_id || typeof char_offset !== "number") {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const session = getSessionFromRequest(req);
    const userId = session?.id || body.user_id || "default_user";

    const bookmarkId = body.id || `bm_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    BookmarkModel.create({
      id: bookmarkId,
      user_id: userId,
      book_id,
      char_offset: Math.round(char_offset),
      title: title || "書籤",
      preview_text: preview_text || "",
    });

    return NextResponse.json({
      success: true,
      bookmark: {
        id: bookmarkId,
        user_id: userId,
        book_id,
        char_offset: Math.round(char_offset),
        title: title || "書籤",
        preview_text: preview_text || "",
        created_at: body.created_at || new Date().toISOString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create bookmark" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 }
      );
    }

    const session = getSessionFromRequest(req);
    const userId = session?.role === "admin" ? undefined : session?.id;
    BookmarkModel.delete(id, userId);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete bookmark" },
      { status: 500 }
    );
  }
}
