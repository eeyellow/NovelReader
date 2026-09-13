import { NextRequest, NextResponse } from "next/server";
import { getGoogleConfig, setSessionCookie, STATE_COOKIE_NAME } from "@/lib/auth";
import { UserModel } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:4000";
    const proto = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const origin = process.env.APP_URL || `${proto}://${host}`;

    if (error) {
      console.error("Google returned OAuth error:", error);
      return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return NextResponse.redirect(`${origin}/?auth_error=no_code`);
    }

    // Verify CSRF state
    const savedState = req.cookies.get(STATE_COOKIE_NAME)?.value;
    if (!state || state !== savedState) {
      console.warn("OAuth state mismatch:", { state, savedState });
      return NextResponse.redirect(`${origin}/?auth_error=state_mismatch`);
    }

    const { clientId, clientSecret } = getGoogleConfig();
    const redirectUri = `${origin}/api/auth/callback/google`;

    // 1. Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Failed to exchange code for token:", errText);
      return NextResponse.redirect(`${origin}/?auth_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Fetch user profile from Google
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userinfoRes.ok) {
      console.error("Failed to fetch Google userinfo:", await userinfoRes.text());
      return NextResponse.redirect(`${origin}/?auth_error=userinfo_failed`);
    }

    const googleUser = await userinfoRes.json();
    const googleId = googleUser.sub;
    const email = googleUser.email;
    const name = googleUser.name || email.split("@")[0];
    const avatar = googleUser.picture || "";

    // 3. Upsert user in database
    const userId = `g_${googleId}`;
    const user = UserModel.createOrUpdate({
      id: userId,
      email,
      name,
      avatar,
      role: "user",
    });

    // 4. Set session cookie and redirect home
    const response = NextResponse.redirect(`${origin}/?login_success=1`);
    setSessionCookie(response, {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
    });

    // Clean up state cookie
    response.cookies.set(STATE_COOKIE_NAME, "", { maxAge: 0, path: "/" });

    return response;
  } catch (error: any) {
    console.error("Google Auth Callback Exception:", error);
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:4000";
    const proto = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    return NextResponse.redirect(`${proto}://${host}/?auth_error=server_error`);
  }
}
