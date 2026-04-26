"use client";

import type { TextAnalysisResult } from "@/lib/types";

export function KeywordsPanel({ textAnalysis }: { textAnalysis: Record<string, TextAnalysisResult> }) {
  const entries = Object.entries(textAnalysis).filter(([, t]) => t?.top_keywords?.length > 0);

  if (entries.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400 text-sm">暂无文本分析数据</p>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">开放题文本分析</h3>
      <div className="grid grid-cols-2 gap-6">
        {entries.map(([key, ta]) => (
          <div key={key} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{ta.column}</h4>
            <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
              <span>回答: {ta.total_answers} 份</span>
              <span>均长: {ta.avg_answer_length} 字</span>
              <span>独立词: {ta.unique_words}</span>
            </div>

            {/* Keyword bars */}
            <div className="space-y-1.5">
              {ta.top_keywords.slice(0, 12).map((kw) => {
                const maxCount = ta.top_keywords[0]?.count || 1;
                const width = (kw.count / maxCount) * 100;
                return (
                  <div key={kw.rank} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 w-5 text-right">{kw.rank}</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-16 truncate">{kw.word}</span>
                    <div className="flex-1 h-2 bg-white dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 w-8">{kw.count}</span>
                  </div>
                );
              })}
            </div>

            {/* Sentiment distribution */}
            {ta.sentiment && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">情感分布</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">均分: {ta.sentiment.avg_score}</span>
                </div>
                <div className="flex gap-2 mb-2">
                  {ta.sentiment.distribution.map((d) => {
                    const colors: Record<string, string> = {
                      "正面": "bg-emerald-400",
                      "中性": "bg-gray-400",
                      "负面": "bg-rose-400",
                    };
                    return (
                      <div key={d.label} className="flex-1">
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 text-center mb-1">{d.label}</div>
                        <div className="h-8 bg-white dark:bg-gray-700 rounded-md overflow-hidden relative">
                          <div
                            className={`absolute bottom-0 left-0 right-0 ${colors[d.label] || "bg-gray-400"} transition-all rounded-b-md`}
                            style={{ height: `${Math.max(d.percentage, 5)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 text-center mt-1">
                          {d.percentage}%
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 情感样例展示 */}
                {ta.sentiment.samples && (
                  <div className="mt-3 space-y-2">
                    {(["positive", "neutral", "negative"] as const).map((key) => {
                      const labelMap = { positive: "正面", neutral: "中性", negative: "负面" };
                      const colorMap = {
                        positive: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20",
                        neutral: "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50",
                        negative: "border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20",
                      };
                      const items = ta.sentiment!.samples![key];
                      if (!items || items.length === 0) return null;
                      return (
                        <div key={key} className={`rounded-lg border p-2.5 ${colorMap[key]}`}>
                          <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                            {labelMap[key]}样例
                          </div>
                          <div className="space-y-1.5">
                            {items.map((s, idx) => (
                              <div key={idx} className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                <span className="text-gray-400 dark:text-gray-500 mr-1">#{idx + 1}</span>
                                {s.text}
                                <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">({s.score})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Length distribution */}
            {ta.length_distribution && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">回答长度分布</span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">均长: {ta.length_distribution.avg_length} 字</span>
                </div>
                <div className="space-y-1">
                  {ta.length_distribution.distribution.map((d) => {
                    const colors: Record<string, string> = {
                      "敷衍 (<10字)": "bg-red-300",
                      "简短 (10-50字)": "bg-amber-300",
                      "充实 (>50字)": "bg-sky-300",
                      "详细 (>100字)": "bg-emerald-300",
                    };
                    const maxCount = Math.max(...ta.length_distribution!.distribution.map((x) => x.count), 1);
                    const width = (d.count / maxCount) * 100;
                    return (
                      <div key={d.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 dark:text-gray-500 w-20 truncate">{d.label}</span>
                        <div className="flex-1 h-1.5 bg-white dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colors[d.label] || "bg-gray-400"} rounded-full transition-all`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 w-10 text-right">{d.count} ({d.percentage}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
