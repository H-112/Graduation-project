"use client";

import { AlertTriangle, Zap, ShieldAlert, FlaskConical } from "lucide-react";

export interface CausalHint {
  association: string;
  strength: string;
  causal_potential: "high" | "medium" | "low";
  reasoning: string;
  confounding_risks: string[];
  suggested_methods: Array<{ method: string; description: string }>;
}

export interface CausalInferenceData {
  hints: CausalHint[];
  summary: { total: number; high: number; medium: number; low: number };
  general_warning: string;
}

const POTENTIAL_CONFIG = {
  high: { label: "高潜力", color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", dot: "bg-purple-500" },
  medium: { label: "中潜力", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", dot: "bg-amber-500" },
  low: { label: "低潜力", color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-800/50", border: "border-gray-200 dark:border-gray-700", dot: "bg-gray-400" },
};

export function CausalInferencePanel({ data }: { data: CausalInferenceData | null }) {
  if (!data || !data.hints?.length) {
    return (
      <div className="text-center py-12">
        <FlaskConical className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">暂无因果推断分析数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">重要提示</div>
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{data.general_warning}</p>
        </div>
      </div>

      {/* Potential Summary */}
      <div className="grid grid-cols-3 gap-3">
        {(["high", "medium", "low"] as const).map((key) => {
          const config = POTENTIAL_CONFIG[key];
          const count = data.summary[key];
          return (
            <div key={key} className={`rounded-lg border p-3 text-center ${config.bg} ${config.border}`}>
              <div className={`text-2xl font-bold ${config.color}`}>{count}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{config.label}</div>
            </div>
          );
        })}
      </div>

      {/* Hint Cards */}
      <div className="space-y-4">
        {data.hints.map((hint, idx) => {
          const config = POTENTIAL_CONFIG[hint.causal_potential] || POTENTIAL_CONFIG.low;

          return (
            <div key={idx} className={`rounded-xl border p-5 ${config.bg} ${config.border}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{hint.association}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{hint.strength}</span>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border ${config.bg} ${config.color} ${config.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                  {config.label}
                </span>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mb-3">{hint.reasoning}</p>

              {/* Confounding Risks */}
              {hint.confounding_risks && hint.confounding_risks.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-red-600 dark:text-red-400 mb-1.5">
                    <ShieldAlert className="w-3 h-3" />
                    混淆风险
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {hint.confounding_risks.map((risk, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800">
                        {risk}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Methods */}
              {hint.suggested_methods && hint.suggested_methods.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">建议验证方法</div>
                  <div className="space-y-1.5">
                    {hint.suggested_methods.map((m, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div>
                          <span className="font-medium text-gray-700 dark:text-gray-300">{m.method}</span>
                          <span className="text-gray-400 dark:text-gray-500 mx-1">·</span>
                          <span className="text-gray-500 dark:text-gray-400">{m.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
