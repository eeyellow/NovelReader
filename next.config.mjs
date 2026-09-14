import { execSync } from "child_process";
import fs from "fs";
import path from "path";

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
    // 容器無 git 或非 git 目錄時從 version.json 讀取
    try {
      const vJsonPath = path.resolve("./src/constants/version.json");
      if (fs.existsSync(vJsonPath)) {
        const vData = JSON.parse(fs.readFileSync(vJsonPath, "utf8"));
        gitCommitSha = vData.commit || "";
      }
    } catch {}
  }
}

if (!gitCommitSha) {
  gitCommitSha = "c92f069";
}

const buildTime = new Date().toISOString();
process.env.NEXT_PUBLIC_GIT_COMMIT_SHA = gitCommitSha;
process.env.NEXT_PUBLIC_BUILD_TIME = buildTime;

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
