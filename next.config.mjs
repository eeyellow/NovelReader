import { execSync } from "child_process";

let gitCommitSha =
  process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ||
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  "";

if (!gitCommitSha) {
  try {
    gitCommitSha = execSync("git rev-parse --short=7 HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    gitCommitSha = "dev";
  }
}

const buildTime = new Date().toISOString();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  env: {
    NEXT_PUBLIC_GIT_COMMIT_SHA: gitCommitSha,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
