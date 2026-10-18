import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const versionJsonPath = path.resolve(__dirname, "../src/constants/version.json");

try {
  let gitHash =
    process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    "";

  if (!gitHash) {
    try {
      gitHash = execSync("git rev-parse --short=7 HEAD", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      try {
        if (fs.existsSync(versionJsonPath)) {
          const vData = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));
          gitHash = vData.commit || "";
        }
      } catch {}
    }
  }

  if (!gitHash) {
    gitHash = "dev";
  }

  const vPayload = {
    commit: gitHash,
    buildTime: new Date().toISOString(),
  };
  fs.writeFileSync(versionJsonPath, JSON.stringify(vPayload, null, 2) + "\n", "utf8");
  console.log(`[Version] Synced version.json commit to: ${gitHash}`);
} catch (err) {
  console.warn("[Version] Could not write version.json:", err);
}
