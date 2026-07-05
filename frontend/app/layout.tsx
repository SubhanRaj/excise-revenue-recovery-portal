import type { Metadata } from "next";
import Script from "next/script";
import { SITE_TITLE_EN, DATA_PERIOD_EN } from "@/lib/site";
import "./globals.css";

// next/script's beforeInteractive strategy injects scripts via a JS runtime hook, so it
// doesn't block the initial HTML paint — the page can flash unstyled before it runs. A
// plain synchronous <script> tag in <head> (no async/defer) *does* block parsing, which is
// also how Tailwind's own Play/browser CDN script expects to be loaded: it installs a
// MutationObserver, so blocking in <head> before <body> exists is the correct placement,
// not a workaround.

export const metadata: Metadata = {
  title: "Excise Revenue Recovery Portal | आबकारी विभाग, उत्तर प्रदेश",
  description: `${SITE_TITLE_EN}. ${DATA_PERIOD_EN}.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Tells the browser this site manages its own light/dark styling, so Chrome's Android
            "force dark" heuristic doesn't also try to auto-darken/invert colors on top of our
            own .dark class — that double-darkening is what was turning input borders greenish
            and, in some elements, forcing text to a near-black that's unreadable against our
            own dark background. */}
        <meta name="color-scheme" content="light dark" />
        {/* Dark/light theme: must run before any paint, as a plain blocking inline script (same
            reasoning as the Tailwind CDN script below) — reads the persisted choice from
            localStorage, falling back to the OS's prefers-color-scheme, and sets the `dark`
            class on <html> synchronously so there's no flash of the wrong theme on reload. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('excise-portal:theme');" +
              "var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;" +
              "if(d)document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
        {/* Google Fonts (CDN) — Noto Sans Devanagari for Hindi labels, Inter for Latin/numerals */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Tailwind v4 defaults `dark:` to a prefers-color-scheme media query; this switches it
            to a `.dark` class-based variant so the toggle (ThemeToggle.tsx) can control it
            independently of the OS setting once the DEO/Admin picks one explicitly. Must be
            declared BEFORE the CDN <script> below — the Play/browser runtime reads whatever
            `text/tailwindcss` config blocks already exist in the document at the moment it
            initializes, and a blocking script tag executes before the parser even reaches any
            markup written after it, so a config block placed after the script is invisible to
            that first pass (this was the actual cause of dark: utilities silently falling back
            to the default OS-only media query instead of following the manual toggle). */}
        <style type="text/tailwindcss">{`@custom-variant dark (&:where(.dark, .dark *));`}</style>
        {/* Tailwind CSS v4 (Play CDN, jsDelivr-mirrored) — utility classes only, no build step.
            Plain <script>, not next/script: must block parsing so no unstyled flash. */}
        <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4" />
        {/* Tabler Icons (CDN) — strictly icons, no emojis anywhere in the UI */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3/dist/tabler-icons.min.css"
        />
        {/* SweetAlert2 (CDN) — strictly no native window.alert/confirm */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css"
        />
        {/* SweetAlert2's own backdrop is a flat dim overlay; this adds a blur on top of it so
            every confirm/prompt (not just the lock flow) reads as a real modal, not a popup
            floating over still-readable content. */}
        <style>{`.swal2-container { backdrop-filter: blur(3px); }`}</style>
      </head>
      <body
        className="flex min-h-full flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100"
        style={{ fontFamily: "'Noto Sans Devanagari', Inter, sans-serif" }}
      >
        {children}

        {/* SweetAlert2 (CDN) */}
        <Script
          src="https://cdn.jsdelivr.net/npm/sweetalert2@11"
          strategy="beforeInteractive"
        />
        {/* SheetJS / xlsx (CDN) — used on DEO submit + Admin export/sync */}
        <Script
          src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
          strategy="lazyOnload"
        />
        {/* Chart.js (CDN) — only consumer today is AdminDashboard's locked/unlocked donut. */}
        <Script
          src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
