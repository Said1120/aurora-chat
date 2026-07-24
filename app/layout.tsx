import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "./PwaRegister";

export const metadata: Metadata = { title: "Aurora Chat", description: "你的 iPad AI 聊天工具", manifest: "/manifest.webmanifest", icons: { icon: "/icon.svg" }, appleWebApp: { capable: true, statusBarStyle: "default", title: "Aurora Chat" } };
export const viewport: Viewport = { themeColor: "#f6f7fb", width: "device-width", initialScale: 1, viewportFit: "cover" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body><PwaRegister />{children}</body></html>; }
