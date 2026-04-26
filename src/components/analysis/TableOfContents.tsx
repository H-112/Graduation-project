"use client";

import { useEffect, useState, useRef } from "react";
import { List } from "lucide-react";

export interface TocItem {
  id: string;
  label: string;
  available: boolean;
}

export interface TocGroup {
  label: string;
  items: TocItem[];
}

export function TableOfContents({ groups }: { groups: TocGroup[] }) {
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const ignoreObserverRef = useRef(false);

  const availableGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.available) }))
    .filter((g) => g.items.length > 0);

  const allAvailableItems = availableGroups.flatMap((g) => g.items);

  useEffect(() => {
    if (allAvailableItems.length === 0) return;

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      if (ignoreObserverRef.current) return;

      const intersecting = entries.filter((e) => e.isIntersecting);
      if (intersecting.length === 0) return;

      const topmost = intersecting.reduce((best, cur) =>
        cur.boundingClientRect.top < best.boundingClientRect.top ? cur : best
      );
      setActiveId(topmost.target.id);
    };

    observerRef.current = new IntersectionObserver(handleIntersect, {
      rootMargin: "-80px 0px -85% 0px",
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });

    for (const item of allAvailableItems) {
      const el = document.getElementById(item.id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, [allAvailableItems]);

  const scrollTo = (id: string) => {
    setActiveId(id);
    ignoreObserverRef.current = true;

    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    window.setTimeout(() => {
      ignoreObserverRef.current = false;
    }, 600);
  };

  if (availableGroups.length === 0) return null;

  return (
    <nav className="hidden lg:block w-56 shrink-0">
      <div className="sticky top-8">
        <div className="flex items-center gap-2 mb-4 px-2">
          <List className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            目录
          </span>
        </div>
        <div className="space-y-4">
          {availableGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2 mb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => scrollTo(item.id)}
                      className={`w-full text-left px-2 py-1 text-xs rounded-md transition-colors ${
                        activeId === item.id
                          ? "text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-950/30"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
