"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className={`flex items-center rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${collapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-2 w-full"}`}
      title={resolvedTheme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="w-4 h-4 shrink-0" />
      ) : (
        <Moon className="w-4 h-4 shrink-0" />
      )}
      {!collapsed && <span>{resolvedTheme === "dark" ? "浅色模式" : "深色模式"}</span>}
    </button>
  );
}
