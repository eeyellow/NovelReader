# 小說閱讀器 (PWA Novel Reader) 架構與重構設計文件

本文件詳細記錄本專案的軟體架構設計、重構思維、SOLID 原則落實以及離線優先 (Offline-First) 跨裝置同步機制。

---

## 🏛️ 架構概覽與重構背景

重構前，專案存在嚴重的「上帝組件 (God Component)」壞味道：
- `src/app/page.tsx` 高達 **1395 行**，同時混合了書庫 API 請求、IndexedDB 離線快取、簡繁動態偵測、檔案轉碼、4 個彈跳對話框 (Modal) 與書卡渲染邏輯。
- `src/app/reader/[id]/page.tsx` 高達 **2221 行**，同時負責多欄分頁演算法、視窗尺寸變化監聽 (ResizeObserver)、垂直滾動、字元偏移量同步、TTS 語音朗讀、全文檢索、書籤增刪、手勢處理與多個抽屜面板。

### 重構核心目標
1. **零功能回退 (Zero Regression)**：所有功能、狀態欄位、localStorage 鍵值、IndexedDB 架構、API 協議、快捷鍵與觸控手勢 100% 保持相容。
2. **單一職責與關注點分離 (SRP & Separation of Concerns)**：將狀態與業務邏輯抽出為自訂 Hooks，展示邏輯拆解為模組化子組件。
3. **易測試與高內聚低耦合**：清晰定義 TypeScript 介面，依賴單一資料來源 (Single Source of Truth)。

---

## 🧩 SOLID 原則落實

### 1. 單一職責原則 (Single Responsibility Principle, SRP)
- **`useBookshelf` Hook**：專注負責書架書籍列表獲取、離線快取同步、上傳轉碼與排序搜尋邏輯。
- **`useReaderPagination` Hook**：專注負責 CSS Columns 分頁計算、視窗拉伸旋轉適應、字元偏移量定位與背景進度自動同步。
- **`useReaderSettings` Hook**：專注負責閱讀器排版偏好（主題、字體、行距、版寬、簡繁轉換等）與本機持久化。
- **`useReaderBookmarks` Hook**：專注負責書籤的 IndexedDB 本機儲存與伺服器非同步同步。
- **`useReaderSearch` Hook**：專注負責書內關鍵字全文檢索演算法與前後脈絡片段截取。
- **子組件各司其職**：`BookshelfHeader`、`BookCard`、`PaginatedViewport`、`ContinuousViewport`、`TOCDrawer` 等純粹負責 UI 渲染。

### 2. 開放封閉原則 (Open/Closed Principle, OCP)
- **佈景主題擴充**：全域主題定義於 `src/constants/themes.ts`，新增主題只需在此擴充設定，書架與閱讀器即自動支援，無需修改 UI 容器代碼。
- **字型與手勢擴充**：字型與手勢行為透過配置驅動 (`GestureConfig`、`FONT_FAMILIES`)，具備高擴充性。

### 3. 里氏替換原則 (Liskov Substitution Principle, LSP)
- 閱讀器視圖提供 **分頁模式 (`PaginatedViewport`)** 與 **連續滾動模式 (`ContinuousViewport`)**，兩者遵循統一的閱讀器資料接口，在切換時無縫接軌且字元偏移量不漂移。

### 4. 介面隔離原則 (Interface Segregation Principle, ISP)
- 在 `src/types/bookshelf.ts` 與 `src/types/reader.ts` 中拆分專屬介面，組件只宣告並依賴其所需的最小 Props，避免傳遞臃腫且未使用的龐大物件。

### 5. 依賴反轉原則 (Dependency Inversion Principle, DIP)
- UI 視圖組件依賴於抽象的高階 Hooks 與資料型別定義，而非直接在 JSX 內依賴 `localStorage`、`fetch` 或底層原生 DOM 事件。

---

## 📁 重構後專案目錄結構

```text
src/
├── types/                     # 統一型別定義
│   ├── bookshelf.ts           # 書架排序、檢視模式與卡片 Props
│   └── reader.ts              # 閱讀偏好、檢索結果、衝突資料與閱讀模式
├── constants/                 # 常數與配置
│   └── themes.ts              # 全站佈景主題與字型樣式 Single Source of Truth
├── hooks/                     # 業務邏輯與狀態封裝 (Custom Hooks)
│   ├── useBookshelf.ts        # 書架資料獲取、上傳、快取與搜尋排序
│   ├── useReaderSettings.ts   # 閱讀器排版設定與本機儲存
│   ├── useReaderPagination.ts # 分頁運算、視窗適應、進度自動同步與導航
│   ├── useReaderBookmarks.ts  # 書籤管理（IndexedDB + 伺服器同步）
│   ├── useReaderSearch.ts     # 書內全文檢索與片段高亮
│   ├── useMouseGesture.ts     # 滑鼠手勢辨識
│   ├── useTouchGesture.ts     # 觸控手勢（滑動、雙指縮放、分區點擊）
│   ├── useTTS.ts              # Web Speech API 語音朗讀
│   └── useWakeLock.ts         # 螢幕防休眠喚醒鎖
├── components/
│   ├── bookshelf/             # 書架模組化組件
│   │   ├── BookshelfHeader.tsx        # 頂部導覽列與連線狀態
│   │   ├── ThemeDropdown.tsx          # 主題切換下拉選單
│   │   ├── BookUploadBar.tsx          # 上傳拖曳區與搜尋列
│   │   ├── BookshelfToolbar.tsx       # 排序選單與版面檢視切換
│   │   ├── BookCard.tsx               # 單本書籍卡片 (Compact & Detailed)
│   │   ├── DeviceModal.tsx            # 裝置名稱自訂對話框
│   │   ├── SimplifiedConvertModal.tsx # 簡體轉正體確認對話框
│   │   ├── RenameModal.tsx            # 書籍更名對話框
│   │   └── StorageModal.tsx           # 離線儲存空間與快取管理對話框
│   ├── reader/                # 閱讀器模組化組件
│   │   ├── ReaderHeader.tsx           # 頂部懸浮工具列
│   │   ├── ReaderFooter.tsx           # 底部懸浮狀態列 (Scrubber + 導航)
│   │   ├── PaginatedViewport.tsx      # 水平多欄分頁視圖
│   │   ├── ContinuousViewport.tsx     # 垂直連續滾動視圖
│   │   ├── TOCDrawer.tsx              # 章節目錄與書籤抽屜
│   │   ├── ReaderSettingsDrawer.tsx   # 排版偏好設定抽屜
│   │   ├── TTSPlayerWidget.tsx        # 語音朗讀懸浮控制卡
│   │   ├── ReaderSearchModal.tsx      # 全文檢索對話框
│   │   └── ReaderToasts.tsx           # 書籤、章節切換與衝突 Toast
│   └── gesture/               # 手勢相關組件
│       ├── GestureOverlay.tsx         # 手勢軌跡與 HUD 視覺提示
│       └── GestureSettingsModal.tsx   # 手勢自訂與試畫對話框
├── lib/                       # 底層工具函式與模型
│   ├── chinese.ts             # 簡繁轉換 (opencc-js)
│   ├── db.ts                  # SQLite (better-sqlite3) 資料持久層
│   ├── device.ts              # 裝置名稱辨識
│   ├── encoding.ts            # 自動編碼識別 (jschardet)
│   ├── epub.ts                # EPUB 解析
│   ├── format.ts              # 數值、位元組與相對時間格式化
│   ├── idb.ts                 # IndexedDB 離線資料庫封裝
│   ├── parser.ts              # TXT 章節正則解析
│   └── sync.ts                # Page Visibility 與進度同步器
└── app/
    ├── page.tsx               # 書架主頁（精簡至 ~180 行容器組件）
    └── reader/[id]/page.tsx   # 閱讀器主頁（精簡至 ~400 行容器組件）
```

---

## ⚡ 核心子系統運作原理

### 1. 離線優先 (Offline-First) 機制
1. **秒開渲染**：使用者進入書架或閱讀器時，第一時間從瀏覽器本機 IndexedDB 快取讀取書單與書籍全文字串，達成 0 延遲無白畫面。
2. **背景增量比對**：非同步向伺服器發送 3.5 秒超時之探測請求。若網路順暢則更新為最新進度並回傳未同步進度；若斷網或逾時則平滑降級為離線模式，使用者體驗不中斷。

### 2. 精確定位與多欄分頁引擎
1. **字元偏移量 (`char_offset`)**：閱讀進度一律以字元偏移量作為跨裝置統一錨點，解決手機與電腦因螢幕尺寸差異導致頁碼失準問題。
2. **CSS Multi-column 排版**：利用原生 CSS 多欄排版與 `ResizeObserver` 動態量測容器寬高。視窗縮放或旋轉螢幕時，利用 `pendingTargetPageRatio` 依當前閱讀比例平滑重算，防止位置漂移。

### 3. Page Visibility API 與進度防漏同步
- 監聽 `visibilitychange`、`pagehide` 與 `beforeunload` 事件。
- 關閉分頁或鎖定手機螢幕時，優先使用 `navigator.sendBeacon` 攜帶當前 `char_offset` 回傳伺服器，確保進度不流失。
- 跨裝置同步偵測：若雲端有更新的閱讀進度，系統會主動跳出衝突提示 Toast，供使用者決定保留本機位置或跳轉同步。
