import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getGoogleConfig, STATE_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { clientId, isConfigured } = getGoogleConfig();
    if (!isConfigured) {
      return NextResponse.json(
        {
          success: false,
          error: "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        },
        { status: 500 }
      );
    }

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:4000";
    const proto = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const origin = process.env.APP_URL || `${proto}://${host}`;
    const redirectUri = `${origin}/api/auth/callback/google`;

    const state = crypto.randomBytes(24).toString("hex");

    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", clientId);
    googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("access_type", "offline");
    googleAuthUrl.searchParams.set("prompt", "select_account");
    googleAuthUrl.searchParams.set("state", state);

    const res = NextResponse.redirect(googleAuthUrl.toString());
    res.cookies.set(STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10, // 10 minutes
    });

    return res;
  } catch (error: any) {
    console.error("Google Auth error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to initialize Google auth" },
      { status: 500 }
    );
  }
}
