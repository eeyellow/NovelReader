import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "極簡小說閱讀器 (NovelReader)",
  description: "跨裝置無縫同步、極速離線快取的小說 PWA 閱讀器",
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
        {/* PWA / Cold-Start Instant Auto-Resume (executes before React hydration) */}
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
        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(err => {
                    console.log('SW registration failed: ', err);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
