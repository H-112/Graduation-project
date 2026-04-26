"use client";

import { Sidebar } from "./Sidebar";
import { useSidebar } from "./SidebarContext";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <>
      <Sidebar />
      <main
        className={`flex-1 min-h-screen transition-all duration-300 print:!ml-0 ${
          collapsed ? "ml-16" : "ml-64"
        }`}
      >
        {children}
      </main>
    </>
  );
}
