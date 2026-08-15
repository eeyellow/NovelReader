import { NextRequest, NextResponse } from "next/server";
import { ProgressModel } from "@/lib/db";

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

    const progress = ProgressModel.get(bookId);
    return NextResponse.json({ success: true, progress: progress || null });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch progress" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any;
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await req.json();
    } else {
      // Handle sendBeacon plain text JSON payload
      const text = await req.text();
      body = JSON.parse(text);
    }

    const {
      book_id,
      char_offset,
      percentage,
      device_name = "Unknown Device",
      updated_at,
    } = body;

    if (!book_id || typeof char_offset !== "number") {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = ProgressModel.upsert(
      book_id,
      char_offset,
      percentage || 0,
      device_name,
      updated_at
    );

    return NextResponse.json({
      success: true,
      updated: result.updated,
      currentProgress: result.currentProgress,
    });
  } catch (error: any) {
    console.error("Progress sync error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to save progress" },
      { status: 500 }
    );
  }
}
