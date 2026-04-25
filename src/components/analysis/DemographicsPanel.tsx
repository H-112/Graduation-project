"use client";

import type { CategoricalResult } from "@/lib/types";

export function DemographicsPanel({ demographics }: { demographics: Record<string, CategoricalResult> }) {
  const entries = Object.entries(demographics).filter(([, d]) => d?.distribution?.length > 0);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-900">样本构成</h3>
      <div className="grid grid-cols-2 gap-6">
        {entries.map(([key, d]) => (
          <div key={key} className="bg-gray-50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">{d.column}</h4>
            <div className="space-y-2">
              {d.distribution.slice(0, 8).map((item, i) => {
                  const pct = item.percentage ?? 0;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-600 truncate">{item.label}</span>
                          <span className="text-gray-400 ml-2 shrink-0">{item.count} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-white rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
