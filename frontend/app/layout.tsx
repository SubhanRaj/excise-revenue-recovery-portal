import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Excise Revenue Recovery Portal | आबकारी विभाग, उत्तर प्रदेश",
  description: "State Excise Revenue Recovery (PAC/RC) Portal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hi" className="h-full antialiased">
      <head>
        {/* Google Fonts (CDN) — Noto Sans Devanagari for Hindi labels, Inter for Latin/numerals */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Tailwind CSS v4 (Play CDN, jsDelivr-mirrored) — utility classes only, no build step */}
        <Script
          src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"
          strategy="beforeInteractive"
        />
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
      </head>
      <body className="min-h-full flex flex-col" style={{ fontFamily: "'Noto Sans Devanagari', Inter, sans-serif" }}>
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
      </body>
    </html>
  );
}
