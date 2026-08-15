# 極簡小說閱讀器 (PWA Novel Reader)

專為私有雲（NAS）與跨裝置同步打造的輕量 PWA 小說閱讀器，支援 TXT 格式純文字解析、IndexedDB 離線快取、Page Visibility API 自動同步與衝突提示。

---

## 🚀 特色亮點

1. **PWA 100% 離線支援**：
   - 採用 **IndexedDB** 快取全書文字與本地閱讀進度。
   - 斷網、出門通勤時皆可完整閱讀，重新連線後自動回傳進度。
   - 支援 iOS / iPadOS Safari（加入主畫面）與 Windows / Mac（PWA 應用安裝）。

2. **跨裝置無縫同步 & 衝突解決**：
   - **Page Visibility API**：鎖定螢幕、切換分頁或關閉視窗時，使用 `sendBeacon` / `keepalive` 立即回傳進度。
   - **LWW (Last-Write-Wins) + 衝突提示**：偵測到其他裝置有更新的進度時，自動跳出 Toast 詢問是否跳轉。

3. **字元偏移量（`char_offset`）精確錨點**：
   - 避免不同螢幕尺寸（手機 vs 電腦）因排版重流導致頁碼偏移。
   - 自動提取章節目錄（第 X 章、Chapter、序章等）。

4. **TXT 自動編碼偵測**：
   - 自動偵測 UTF-8、Big5、GBK / GB2312 等編碼並無縫轉碼，避免小說亂碼。

5. **閱讀體驗客製化**：
   - 5 款主題：羊皮紙、深色、純黑（OLED）、護眼綠、極簡白。
   - 字體大小、行距倍數、宋體/黑體/楷體樣式調整。

---

## 🛠 本地開發與測試

```bash
# 1. 安裝相依套件
npm install

# 2. 啟動開發伺服器
npm run dev

# 3. 開啟瀏覽器訪問
http://localhost:3000
```

---

## 🐳 NAS Docker 一鍵部署

專案根目錄已提供完整的 `Dockerfile` 與 `docker-compose.yml`，可直接在 Synology Container Manager、QNAP Container Station 或任何 Linux 伺服器一鍵啟動：

```bash
# 啟動容器
docker compose up -d --build
```

### 資料持久化說明
- **資料庫與上傳檔案**：預設掛載 `./data` 目錄（包含 `novel_reader.db` 與 `uploads/`）。
- **反向代理**：可透過 NAS 內建的反向代理伺服器（或 Nginx Proxy Manager / Cloudflare Tunnel）綁定自訂網域並啟用 HTTPS（PWA 必須使用 HTTPS 才能發揮完整離線與 Service Worker 功能）。

---

## 📁 目錄結構

- `src/app/page.tsx`：書架首頁（上傳、搜尋、離線標籤、裝置名稱設定、主題切換）
- `src/app/reader/[id]/page.tsx`：閱讀器頁面（章節目錄、字元偏移量定位、排版偏好、自動同步）
- `src/app/api/`：REST API（書籍清單、上傳、全文下載、進度儲存）
- `src/lib/db.ts`：SQLite (better-sqlite3) 資料模型
- `src/lib/idb.ts`：前端 IndexedDB 離線快取封裝
- `src/lib/sync.ts`：Page Visibility 與 sendBeacon 進度同步器
- `src/lib/encoding.ts`：jschardet 自動編碼偵測與轉碼
