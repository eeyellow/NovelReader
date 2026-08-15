import { NextRequest, NextResponse } from "next/server";
import { BookModel } from "@/lib/db";

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
    return NextResponse.json({ success: true, book });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch book" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
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
    const updatedBook = BookModel.getById(id);

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
