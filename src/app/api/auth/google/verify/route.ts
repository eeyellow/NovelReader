import { NextRequest, NextResponse } from "next/server";
import { getGoogleConfig, setSessionCookie } from "@/lib/auth";
import { UserModel } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Verify Google ID Token (e.g. from Google One Tap / Google Sign In Client button)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { credential } = body;

    if (!credential) {
      return NextResponse.json(
        { success: false, error: "Credential is required" },
        { status: 400 }
      );
    }

    // Call Google's tokeninfo endpoint to verify token signature and extract claims
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
    );

    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      console.error("Google tokeninfo error:", errText);
      return NextResponse.json(
        { success: false, error: "Invalid Google credential" },
        { status: 401 }
      );
    }

    const payload = await verifyRes.json();
    const { clientId } = getGoogleConfig();

    // Verify audience matches if clientId is set
    if (clientId && payload.aud !== clientId) {
      console.warn("Audience mismatch:", { aud: payload.aud, clientId });
      return NextResponse.json(
        { success: false, error: "Audience mismatch" },
        { status: 401 }
      );
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name || email.split("@")[0];
    const avatar = payload.picture || "";

    const userId = `g_${googleId}`;
    const user = UserModel.createOrUpdate({
      id: userId,
      email,
      name,
      avatar,
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
    console.error("Google verify error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to verify credential" },
      { status: 500 }
    );
  }
}
