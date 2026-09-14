import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swPath = path.resolve(__dirname, '../public/sw.js');
const versionJsonPath = path.resolve(__dirname, '../src/constants/version.json');

try {
  let gitHash =
    process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    '';

  if (!gitHash) {
    try {
      gitHash = execSync('git rev-parse --short=7 HEAD', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // 若容器無 git 或非 git 目錄，讀取 version.json 現有值
      try {
        if (fs.existsSync(versionJsonPath)) {
          const vData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
          gitHash = vData.commit || '';
        }
      } catch {}
    }
  }

  if (!gitHash) {
    gitHash = 'c92f069';
  }

  // 同步寫入 version.json 供前端靜態引入
  try {
    const vPayload = {
      commit: gitHash,
      buildTime: new Date().toISOString(),
    };
    fs.writeFileSync(versionJsonPath, JSON.stringify(vPayload, null, 2) + '\n', 'utf8');
    console.log(`[Version] Synced version.json commit to: ${gitHash}`);
  } catch (err) {
    console.warn('[Version] Could not write version.json:', err);
  }

  const content = fs.readFileSync(swPath, 'utf8');
  const buildVersion = `novel-reader-${gitHash}-${Date.now().toString(36)}`;
  const updatedContent = content.replace(
    /const CACHE_VERSION = "[^"]+";/,
    `const CACHE_VERSION = "${buildVersion}";`
  );

  fs.writeFileSync(swPath, updatedContent, 'utf8');
  console.log(`[PWA] Updated sw.js CACHE_VERSION to: ${buildVersion}`);
} catch (err) {
  console.error('[PWA] Failed to update sw.js version:', err);
}
