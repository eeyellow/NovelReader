import crypto from "crypto";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { DATA_DIR, UserModel, User } from "./db";

import type { UserSession } from "./clientAuth";
export type { UserSession };

const SESSION_COOKIE_NAME = "nr_session";
const STATE_COOKIE_NAME = "nr_oauth_state";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

// Ensure persistent AUTH_SECRET even without explicit .env setting
function getAuthSecret(): string {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NEXTAUTH_SECRET) return process.env.NEXTAUTH_SECRET;

  const secretPath = path.join(DATA_DIR, ".auth_secret");
  try {
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, "utf-8").trim();
    }
    const newSecret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretPath, newSecret, "utf-8");
    return newSecret;
  } catch (e) {
    return "novel-reader-default-secure-fallback-secret-2026";
  }
}

const AUTH_SECRET = getAuthSecret();

// Sign payload with HMAC-SHA256
export function signSession(payload: UserSession): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

// Verify and decode HMAC-SHA256 session token
export function verifySession(token: string): UserSession | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [data, signature] = parts;

    const expectedSig = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(data)
      .digest("base64url");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature, "utf-8"),
        Buffer.from(expectedSig, "utf-8")
      )
    ) {
      return null;
    }

    const json = Buffer.from(data, "base64url").toString("utf-8");
    return JSON.parse(json) as UserSession;
  } catch {
    return null;
  }
}

// Extract current session from NextRequest or standard Request headers
export function getSessionFromRequest(req: NextRequest | Request): UserSession | null {
  // 1. Cloudflare Access Zero Trust 自動單點登入 (免二度手動登入)
  const cfEmail = req.headers.get("cf-access-authenticated-user-email");
  if (cfEmail) {
    const email = cfEmail.trim().toLowerCase();
    let user = UserModel.getByEmail(email);
    if (!user) {
      const userId = `cf_${Buffer.from(email).toString("hex").slice(0, 16)}`;
      user = UserModel.createOrUpdate({
        id: userId,
        email,
        name: email.split("@")[0],
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${email}`,
        role: "user",
      });
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
    };
  }

  // 2. 標準 Session Cookie
  let cookieHeader = "";
  if ("cookies" in req && typeof (req as any).cookies?.get === "function") {
    const cookie = (req as NextRequest).cookies.get(SESSION_COOKIE_NAME);
    if (cookie?.value) {
      return verifySession(cookie.value);
    }
  }

  cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (match && match[1]) {
    return verifySession(decodeURIComponent(match[1]));
  }

  return null;
}

// Set session cookie in NextResponse
export function setSessionCookie(res: NextResponse, session: UserSession): void {
  const token = signSession(session);
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

// Clear session cookie
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// Get Google OAuth Configuration
export function getGoogleConfig() {
  const clientId =
    process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const isConfigured = Boolean(clientId && clientSecret);

  return {
    clientId,
    clientSecret,
    isConfigured,
  };
}

export { SESSION_COOKIE_NAME, STATE_COOKIE_NAME };
