"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface EvidenceBlockProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function EvidenceBlock({
  icon: Icon,
  title,
  summary,
  children,
  defaultOpen = false,
}: EvidenceBlockProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <Icon className="w-4 h-4 text-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{title}</span>
          {summary && !open && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}
