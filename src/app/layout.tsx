import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "極簡小說閱讀器 (NovelReader)",
  description: "輕量、跨裝置同步的小說閱讀器",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "小說閱讀",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#8b5e3c",
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
                  var path = window.location.pathname;
                  var search = window.location.search;
                  var isManual = search.indexOf('from=reader') !== -1 || search.indexOf('shelf=1') !== -1;
                  var autoResume = localStorage.getItem('novel_reader_auto_resume') !== 'false';
                  var lastBookId = localStorage.getItem('novel_reader_last_book_id');
                  if ((path === '/' || path === '') && !isManual && autoResume && lastBookId) {
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
        {/* 自動清除歷史殘留的 Service Worker 與快取 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (var i = 0; i < registrations.length; i++) {
                    registrations[i].unregister();
                  }
                }).catch(function() {});
                if ('caches' in window) {
                  caches.keys().then(function(keys) {
                    for (var j = 0; j < keys.length; j++) {
                      caches.delete(keys[j]);
                    }
                  }).catch(function() {});
                }
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
