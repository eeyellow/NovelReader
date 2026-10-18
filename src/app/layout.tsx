import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "極簡小說閱讀器 (NovelReader)",
  description: "輕量、跨裝置同步的小說閱讀器",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "小說閱讀",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#fbf6ec",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW" data-theme="parchment" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var themeColors = {
                    parchment: '#fbf6ec',
                    dark: '#141416',
                    oled: '#000000',
                    eyecare: '#dcebd9',
                    light: '#fafafa'
                  };
                  var savedTheme = localStorage.getItem('novel_reader_theme') || 'parchment';
                  document.documentElement.setAttribute('data-theme', savedTheme);
                  var metaTheme = document.querySelector('meta[name="theme-color"]');
                  if (metaTheme && themeColors[savedTheme]) {
                    metaTheme.setAttribute('content', themeColors[savedTheme]);
                  }
                  var path = window.location.pathname;
                  var search = window.location.search;
                  var isManual = search.indexOf('from=reader') !== -1 || search.indexOf('shelf=1') !== -1;
                  var autoResume = localStorage.getItem('novel_reader_auto_resume') !== 'false';
                  var lastBookId = localStorage.getItem('novel_reader_last_book_id');
                  if ((path === '/' || path === '') && !isManual && autoResume && lastBookId && lastBookId !== '__shell__') {
                    window.location.replace('/reader/' + encodeURIComponent(lastBookId));
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col antialiased select-text">
        {children}
        {/* 註冊 Service Worker（離線閱讀） */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                var registerSw = function() {
                  navigator.serviceWorker
                    .register('/sw.js', { updateViaCache: 'none' })
                    .then(function(reg) {
                      reg.update().catch(function() {});
                      document.addEventListener('visibilitychange', function() {
                        if (document.visibilityState === 'visible' && navigator.onLine) {
                          reg.update().catch(function() {});
                        }
                      });
                    })
                    .catch(function(err) { console.warn('SW register failed', err); });
                };
                if (document.readyState === 'complete') {
                  registerSw();
                } else {
                  window.addEventListener('load', registerSw);
                }
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
