import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/AppProviders";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "CookPilot",
  description: "CookPilot browser MVP",
  icons: {
    icon: "/images/cp-logo-lg.png",
    apple: "/images/cp-logo-lg.png",
    shortcut: "/images/cp-logo-lg.png",
  },
};

// Applied before React hydrates so the correct theme is never a flash away.
const themeScript = `(function(){try{var m=localStorage.getItem('cookpilot-appearance-mode')||'system';document.documentElement.dataset.theme=m==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Preload critical Manrope weights to avoid text reflow */}
        <link rel="preload" href="/fonts/Manrope-Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Manrope-SemiBold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Manrope-Bold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Manrope-ExtraBold.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ErrorBoundary>
          <AppProviders>{children}</AppProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}
