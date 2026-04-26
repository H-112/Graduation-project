"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Database, Home, FileText, Upload, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAnalysis } from "@/components/analysis/AnalysisProvider";
import { useSidebar } from "./SidebarContext";

const NAV = [
  { href: "/", label: "仪表盘", icon: Home },
  { href: "/datasets", label: "数据集 (7)", icon: Database },
  { href: "/upload", label: "上传新问卷", icon: Upload },
  { href: "/analysis", label: "分析历史", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { activeJob } = useAnalysis();
  const { collapsed, toggle } = useSidebar();
  const isAnalyzing = activeJob?.status === "analyzing";

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col z-10 transition-all duration-300 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Logo */}
      <div className={`h-16 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 ${collapsed ? "px-3 justify-center" : "px-6"}`}>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">问卷智能分析</h1>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">Agent-Assisted</p>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={toggle}
            className="ml-auto p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="收起侧边栏"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {collapsed && (
          <button
            onClick={toggle}
            className="absolute -right-3 top-5 w-6 h-6 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 shadow-sm"
            title="展开侧边栏"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center rounded-lg text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
              } ${
                active
                  ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Active analysis indicator */}
      {isAnalyzing && (
        <div className={`mb-2 ${collapsed ? "px-2" : "mx-3"}`}>
          <Link
            href="/upload"
            title={collapsed ? "分析进行中..." : undefined}
            className={`flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors ${collapsed ? "justify-center px-2 py-2" : "px-3 py-2"}`}
          >
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            {!collapsed && <span className="font-medium">分析进行中...</span>}
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className={`px-3 py-4 border-t border-gray-100 dark:border-gray-800 space-y-2 ${collapsed ? "items-center" : ""}`}>
        <div className={collapsed ? "flex justify-center" : ""}>
          <ThemeToggle collapsed={collapsed} />
        </div>
        {!collapsed && (
          <>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 px-3">毕设项目 · 2026</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 px-3">
              渐进式三模式分析引擎
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
