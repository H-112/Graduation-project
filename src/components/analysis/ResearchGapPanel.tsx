"use client";

import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export interface ResearchGapItem {
  category: string;
  severity: "high" | "medium" | "low";
  description: string;
  impact: string;
  mitigation: string;
}

export interface CoveredQuestion {
  question: string;
  answered_by: string;
}

export interface ResearchGapData {
  covered_questions: CoveredQuestion[];
  gaps: ResearchGapItem[];
  future_research: string[];
}

const SEVERITY_CONFIG = {
  high: { label: "高", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", dot: "bg-red-500" },
  medium: { label: "中", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", dot: "bg-amber-500" },
  low: { label: "低", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", dot: "bg-green-500" },
};

const CATEGORY_ICONS: Record<string, string> = {
  "数据缺口": "📊",
  "方法缺口": "🔬",
  "理论缺口": "📚",
  "群体缺口": "👥",
};

export function ResearchGapPanel({ data }: { data: ResearchGapData | null }) {
  const [showCovered, setShowCovered] = useState(false);

  if (!data || !data.gaps?.length) {
    return (
      <div className="text-center py-12">
        <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">暂无研究缺口分析数据</p>
      </div>
    );
  }

  const categories = ["数据缺口", "方法缺口", "理论缺口", "群体缺口"];

  return (
    <div className="space-y-6">
      {/* Covered Questions Toggle */}
      <button
        onClick={() => setShowCovered(!showCovered)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span>本研究已回答的问题 ({data.covered_questions?.length || 0})</span>
        {showCovered ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {showCovered && data.covered_questions && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-2">
          {data.covered_questions.map((q, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>{q.question}</span>
              <span className="text-gray-400 dark:text-gray-500 shrink-0">({q.answered_by})</span>
            </div>
          ))}
        </div>
      )}

      {/* Gap Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat) => {
          const catGaps = data.gaps.filter((g) => g.category === cat);
          if (catGaps.length === 0) return null;

          return (
            <div key={cat} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{CATEGORY_ICONS[cat] || "•"}</span>
                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">{cat}</h4>
              </div>
              {catGaps.map((gap, idx) => {
                const config = SEVERITY_CONFIG[gap.severity] || SEVERITY_CONFIG.low;
                return (
                  <div key={idx} className={`rounded-lg border p-3 ${config.bg} ${config.border}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                      <span className={`text-[10px] font-medium ${config.color}`}>{config.label}</span>
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">{gap.description}</p>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 space-y-1">
                      <div><span className="font-medium">影响:</span> {gap.impact}</div>
                      <div><span className="font-medium">缓解:</span> {gap.mitigation}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Future Research */}
      {data.future_research && data.future_research.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-xl border border-blue-100 dark:border-blue-800 p-5">
          <h4 className="text-sm font-bold text-blue-900 dark:text-blue-400 mb-3">未来研究方向</h4>
          <div className="space-y-2">
            {data.future_research.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
