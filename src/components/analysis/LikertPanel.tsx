"use client";

import type { DescriptiveStats } from "@/lib/types";

export function LikertPanel({ likert }: { likert: Record<string, DescriptiveStats[]> }) {
  const entries = Object.entries(likert).filter(([, items]) => items?.length > 0);

  return (
    <div className="space-y-8">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Likert 量表分析 (1-5分制)</h3>
      {entries.map(([groupName, items]) => (
        <div key={groupName} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{items[0]?.group || groupName}</h4>
          <div className="space-y-3">
            {items.map((item, i) => {
              const shortLabel = item.column.includes("—")
                ? item.column.split("—").pop()?.trim()
                : item.column.length > 40
                  ? item.column.slice(0, 40) + "..."
                  : item.column;

              // Determine color based on mean value
              const meanColor =
                item.mean >= 4 ? "bg-green-500" :
                item.mean >= 3 ? "bg-yellow-500" :
                "bg-red-500";

              return (
                <div key={i} className="bg-white dark:bg-gray-900 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{shortLabel}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      M={item.mean.toFixed(2)} SD={item.std.toFixed(2)} N={item.n}
                    </span>
                  </div>

                  {/* Score bar */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 w-4">1</span>
                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full relative overflow-hidden">
                      <div
                        className={`absolute h-full ${meanColor} rounded-full opacity-30`}
                        style={{ width: `${(item.mean / 5) * 100}%` }}
                      />
                      <div
                        className="absolute w-2 h-2 bg-white dark:bg-gray-600 border-2 border-gray-700 dark:border-gray-300 rounded-full -translate-x-1/2 top-1/2 -translate-y-1/2"
                        style={{ left: `${(item.mean / 5) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 w-4">5</span>
                  </div>

                  {/* Distribution */}
                  <div className="flex gap-1">
                    {item.distribution.map((d, j) => (
                      <div
                        key={j}
                        className="flex-1 text-center"
                        title={`${d.score}分: ${d.percentage}%`}
                      >
                        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded relative overflow-hidden">
                          <div
                            className="absolute bottom-0 w-full bg-blue-400 rounded-b transition-all"
                            style={{ height: `${d.percentage}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{d.score}分</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
