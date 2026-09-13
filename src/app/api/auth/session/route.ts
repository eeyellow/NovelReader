import { NextRequest, NextResponse } from "next/server";
import {
  clearSessionCookie,
  getGoogleConfig,
  getSessionFromRequest,
  setSessionCookie,
} from "@/lib/auth";
import { UserModel } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    const { isConfigured, clientId } = getGoogleConfig();

    return NextResponse.json({
      success: true,
      user: session,
      googleConfigured: isConfigured,
      googleClientId: clientId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch session" },
      { status: 500 }
    );
  }
}

// Dev / Demo quick login or account switcher
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, avatar } = body;

    if (!email || !name) {
      return NextResponse.json(
        { success: false, error: "Email and Name are required" },
        { status: 400 }
      );
    }

    // Generate safe deterministic ID for demo/test user
    const sanitizedEmail = email.trim().toLowerCase();
    const userId = `u_${Buffer.from(sanitizedEmail).toString("hex").slice(0, 16)}`;

    const user = UserModel.createOrUpdate({
      id: userId,
      email: sanitizedEmail,
      name: name.trim(),
      avatar: avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${sanitizedEmail}`,
      role: "user",
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
      },
    });

    setSessionCookie(response, {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Login failed" },
      { status: 500 }
    );
  }
}

// Logout
export async function DELETE() {
  const response = NextResponse.json({ success: true, message: "Logged out" });
  clearSessionCookie(response);
  return response;
}
