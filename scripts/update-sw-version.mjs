import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const swPath = path.resolve(__dirname, '../public/sw.js');

try {
  const content = fs.readFileSync(swPath, 'utf8');
  let version = Date.now().toString(36);
  try {
    const gitHash = execSync('git rev-parse --short=7 HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (gitHash) {
      version = `${gitHash}-${Date.now().toString(36)}`;
    }
  } catch {
    // Git 不可用或非 git 目錄時回退至時間戳
  }

  const buildVersion = `novel-reader-${version}`;
  const updatedContent = content.replace(
    /const CACHE_VERSION = "[^"]+";/,
    `const CACHE_VERSION = "${buildVersion}";`
  );

  fs.writeFileSync(swPath, updatedContent, 'utf8');
  console.log(`[PWA] Updated sw.js CACHE_VERSION to: ${buildVersion}`);
} catch (err) {
  console.error('[PWA] Failed to update sw.js version:', err);
}
