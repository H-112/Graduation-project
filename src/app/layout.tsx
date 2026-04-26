import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AnalysisProvider } from "@/components/analysis/AnalysisProvider";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { ClientLayout } from "@/components/layout/ClientLayout";

export const metadata: Metadata = {
  title: "智能体辅助问卷分析系统",
  description: "基于大语言模型的智能问卷分析平台 — 支持渐进式多模式分析",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body
        className="min-h-full flex bg-gray-50 dark:bg-gray-950"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' }}
      >
        <ThemeProvider>
          <AnalysisProvider>
            <SidebarProvider>
              <ClientLayout>{children}</ClientLayout>
            </SidebarProvider>
          </AnalysisProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
