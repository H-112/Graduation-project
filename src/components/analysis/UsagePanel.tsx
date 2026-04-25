"use client";

import type { CategoricalResult } from "@/lib/types";
import { CheckSquare } from "lucide-react";

export function UsagePanel({ usage }: { usage: Record<string, CategoricalResult> }) {
  const entries = Object.entries(usage).filter(([, d]) => d?.distribution?.length > 0);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-900">选择题分布</h3>
      <div className="grid grid-cols-2 gap-6">
        {entries.map(([key, d]) => {
          const isMulti = d.type === "multi_select" || d.type === "multi_select_columns";
          const total = d.total_respondents ?? d.total_valid ?? d.total_records;
          return (
            <div key={key} className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <h4 className="text-sm font-semibold text-gray-700">{d.column}</h4>
                {isMulti && (
                  <span className="text-xs text-purple-600 bg-purple-100 rounded-full px-2 py-0.5 flex items-center gap-1 shrink-0">
                    <CheckSquare className="w-3 h-3" />
                    多选
                  </span>
                )}
              </div>
              {isMulti && d.avg_selections_per_respondent != null && (
                <p className="text-xs text-gray-400 mb-2">
                  {total} 人参与 · 共 {d.total_selections} 次选择 · 人均 {d.avg_selections_per_respondent} 项
                </p>
              )}
              <div className="space-y-2">
                {d.distribution.slice(0, 8).map((item, i) => {
                  const pct = isMulti
                    ? (item.percentage_in_respondents ?? 0)
                    : (item.percentage ?? 0);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-600 truncate" title={item.label}>{item.label}</span>
                          <span className="text-gray-500 ml-2 shrink-0">
                            {item.count} · {pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-white rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isMulti ? "bg-purple-400" : "bg-purple-500"}`}
                            style={{ width: `${Math.max(pct, 2)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
