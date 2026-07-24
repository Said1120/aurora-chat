import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";

export const metadata: Metadata = {
  title: "Aurora Chat",
  description: "你的独立 iPad AI 聊天工具",
  manifest: "/aurora-chat/manifest.webmanifest",
  icons: { icon: "/aurora-chat/icon.svg" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Aurora Chat",
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f7fb",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
