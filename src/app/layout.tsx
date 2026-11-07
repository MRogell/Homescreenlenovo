import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { NoZoom } from "@/components/no-zoom";

export const metadata: Metadata = {
  title: { default: "Hemskärm", template: "%s · Hemskärm" },
  description: "Familjens smarta hem på en skärm.",
  appleWebApp: { capable: true, title: "Hemskärm", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};
// Ägarens val: ingen zoom (appen är en fast hemskärm på platta och iPhone). Avvikelse från WCAG 1.4.4 (förstoring) som ägaren valt medvetet.
export const viewport: Viewport = { themeColor: "#0f1419", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", colorScheme: "dark light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* App Router: layouten gäller alla sidor, så varningen om _document gäller inte. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600&display=swap" />
      </head>
      <body>
        {children}
        <ServiceWorker />
        <NoZoom />
      </body>
    </html>
  );
}
