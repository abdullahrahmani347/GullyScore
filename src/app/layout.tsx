import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { BottomNav } from "@/components/layout/BottomNav";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration, GlobalOfflineBanner } from "@/components/offline";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "GullyScore — Cricket Scoring",
  description: "Ball-by-ball cricket scoring for gully matches and local tournaments",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GullyScore",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#070710",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark`} data-theme="dark">
      <head>
        <link rel="icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="bg-bg-app text-t1 antialiased">
        <ErrorBoundary>
          <GlobalOfflineBanner />
          <main className="min-h-dvh pb-20">
            {children}
          </main>
          <BottomNav />
          <Toaster />
          <ServiceWorkerRegistration />
        </ErrorBoundary>
      </body>
    </html>
  );
}
