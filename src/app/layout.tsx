import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { BarChart3, FileText, Home } from "lucide-react";

export const metadata: Metadata = {
  title: "股票价值分析系统",
  description: "基于 AI 的股票价值投资分析工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <header className="bg-white border-b sticky top-0 z-50">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center gap-2 font-bold text-xl">
                <BarChart3 className="h-6 w-6 text-blue-600" />
                <span>股票价值分析</span>
              </Link>
              <nav className="flex items-center gap-6">
                <Link
                  href="/"
                  className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <Home className="h-4 w-4" />
                  首页
                </Link>
                <Link
                  href="/analyze"
                  className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <BarChart3 className="h-4 w-4" />
                  分析
                </Link>
                <Link
                  href="/reports"
                  className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  报告
                </Link>
              </nav>
            </div>
          </div>
        </header>
        <main className="flex-1 container mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="bg-white border-t py-4">
          <div className="container mx-auto px-4 text-center text-sm text-gray-500">
            © 2026 股票价值分析系统 - 基于 AI 的价值投资分析工具
          </div>
        </footer>
      </body>
    </html>
  );
}
