"use client";

import { useState } from "react";
import { Target, ChevronDown, ChevronUp, Lightbulb, Users, Gauge } from "lucide-react";

export interface ActionableInsightItem {
  id: string;
  category: string;
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  evidence: Array<{ finding: string; source: string }>;
  difficulty: string;
  stakeholders: string[];
  expected_outcome: string;
}

export interface ActionableInsightData {
  insights: ActionableInsightItem[];
  priority_summary: { high: number; medium: number; low: number };
  total: number;
}

const PRIORITY_CONFIG = {
  high: { label: "高优先级", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", dot: "bg-red-500" },
  medium: { label: "中优先级", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", dot: "bg-amber-500" },
  low: { label: "低优先级", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", dot: "bg-green-500" },
};

const CATEGORY_COLORS: Record<string, string> = {
  "教学改进": "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
  "政策管理": "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400",
  "工具设计": "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400",
  "后续研究": "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400",
};

export function ActionableInsightPanel({ data }: { data: ActionableInsightData | null }) {
  const [filter, setFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (!data || !data.insights?.length) {
    return (
      <div className="text-center py-12">
        <Target className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">暂无可操作建议数据</p>
      </div>
    );
  }

  const filtered = filter === "all" ? data.insights : data.insights.filter((i) => i.priority === filter);

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  return (
    <div className="space-y-6">
      {/* Priority Summary */}
      <div className="grid grid-cols-3 gap-3">
        {(Object.entries(data.priority_summary) as Array<["high" | "medium" | "low", number]>).map(([key, count]) => {
          const config = PRIORITY_CONFIG[key];
          return (
            <div key={key} className={`rounded-lg border p-3 text-center ${config.bg} ${config.border}`}>
              <div className={`text-2xl font-bold ${config.color}`}>{count}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{config.label}</div>
            </div>
          );
        })}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(["all", "high", "medium", "low"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              filter === key
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {key === "all" ? "全部" : PRIORITY_CONFIG[key].label}
          </button>
        ))}
      </div>

      {/* Insight Cards */}
      <div className="space-y-3">
        {filtered.map((insight) => {
          const config = PRIORITY_CONFIG[insight.priority] || PRIORITY_CONFIG.medium;
          const isExpanded = expandedIds.has(insight.id);
          const catColor = CATEGORY_COLORS[insight.category] || CATEGORY_COLORS["后续研究"];

          return (
            <div key={insight.id} className={`rounded-xl border p-4 ${config.bg} ${config.border}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                  <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${catColor}`}>{insight.category}</span>
                </div>
              </div>

              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1.5">{insight.title}</h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-3">{insight.description}</p>

              {/* Evidence toggle */}
              {insight.evidence && insight.evidence.length > 0 && (
                <button
                  onClick={() => toggleExpand(insight.id)}
                  className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-2"
                >
                  {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  证据来源 ({insight.evidence.length})
                </button>
              )}

              {isExpanded && insight.evidence && (
                <div className="space-y-1.5 mb-3 pl-2 border-l-2 border-gray-200 dark:border-gray-700">
                  {insight.evidence.map((e, idx) => (
                    <div key={idx} className="text-[11px] text-gray-500 dark:text-gray-400">
                      <span className="text-gray-300 dark:text-gray-600 mr-1">·</span>
                      {e.finding}
                      <span className="text-gray-400 dark:text-gray-500 ml-1">({e.source})</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer meta */}
              <div className="flex items-center gap-4 text-[10px] text-gray-400 dark:text-gray-500">
                <span className="flex items-center gap-1">
                  <Gauge className="w-3 h-3" />
                  难度: {insight.difficulty}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {insight.stakeholders.join(", ")}
                </span>
              </div>

              {/* Expected outcome */}
              {insight.expected_outcome && (
                <div className="mt-2 flex items-start gap-1.5 text-[10px] text-green-600 dark:text-green-400">
                  <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>预期效果: {insight.expected_outcome}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
