"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Database, Home, FileText, Upload } from "lucide-react";

const NAV = [
  { href: "/", label: "仪表盘", icon: Home },
  { href: "/datasets", label: "数据集 (7)", icon: Database },
  { href: "/upload", label: "上传新问卷", icon: Upload },
  { href: "/analysis", label: "分析历史", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col z-10">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <FileText className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-gray-900">问卷智能分析</h1>
          <p className="text-[10px] text-gray-400">Agent-Assisted</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-100">
        <p className="text-[10px] text-gray-400">毕设项目 · 2026</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          渐进式三模式分析引擎
        </p>
      </div>
    </aside>
  );
}
