"use client";

import type { TextAnalysisResult } from "@/lib/types";

export function KeywordsPanel({ textAnalysis }: { textAnalysis: Record<string, TextAnalysisResult> }) {
  const entries = Object.entries(textAnalysis).filter(([, t]) => t?.top_keywords?.length > 0);

  if (entries.length === 0) {
    return <p className="text-gray-500 text-sm">暂无文本分析数据</p>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-900">开放题文本分析</h3>
      <div className="grid grid-cols-2 gap-6">
        {entries.map(([key, ta]) => (
          <div key={key} className="bg-gray-50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">{ta.column}</h4>
            <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
              <span>回答: {ta.total_answers} 份</span>
              <span>均长: {ta.avg_answer_length} 字</span>
              <span>独立词: {ta.unique_words}</span>
            </div>

            {/* Keyword bars */}
            <div className="space-y-1.5">
              {ta.top_keywords.slice(0, 15).map((kw) => {
                const maxCount = ta.top_keywords[0]?.count || 1;
                const width = (kw.count / maxCount) * 100;
                return (
                  <div key={kw.rank} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-5 text-right">{kw.rank}</span>
                    <span className="text-xs font-medium text-gray-700 w-16 truncate">{kw.word}</span>
                    <div className="flex-1 h-2 bg-white rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 w-8">{kw.count}</span>
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
