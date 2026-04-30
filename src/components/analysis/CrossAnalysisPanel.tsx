"use client";

import type { CrossAnalysisResult } from "@/lib/types";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { GitBranch, AlertCircle, TrendingUp } from "lucide-react";

export function CrossAnalysisPanel({
  crossAnalysis,
}: {
  crossAnalysis: CrossAnalysisResult[];
}) {
  if (!crossAnalysis || crossAnalysis.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">暂无交叉分析数据</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">重新运行分析可生成交叉分析结果</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-blue-500" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">交叉分析发现</h3>
        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">（共 {crossAnalysis.length} 个假设）</span>
      </div>

      <div className="space-y-4">
        {crossAnalysis.map((item, idx) => (
          <CrossCard key={idx} item={item} index={idx + 1} />
        ))}
      </div>
    </div>
  );
}

function CrossCard({ item, index }: { item: CrossAnalysisResult; index: number }) {
  const maxPct = Math.max(
    ...item.crosstab.flatMap((r) => r.values.map((v) => v.percentage))
  );

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-xs font-bold flex items-center justify-center mt-0.5">
              {index}
            </span>
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{item.title}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.description}</p>
            </div>
          </div>
          <SignificanceBadge significant={item.is_significant} pValue={item.p_value} />
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-400 dark:text-gray-500">
          <span>样本: {item.sample_size}</span>
          <span>χ² = {item.chi2}</span>
          <span>p = {item.p_value}</span>
          <span>Cram&eacute;r&apos;s V = {item.cramers_v}</span>
        </div>
      </div>

      {/* Insight */}
      {item.insight && (
        <div className="px-5 py-3 bg-amber-50/50 dark:bg-amber-950/20 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-start gap-2">
            <TrendingUp className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <MarkdownRenderer content={item.insight} />
            </div>
          </div>
        </div>
      )}

      {/* Crosstab Heatmap */}
      <div className="px-5 py-4 overflow-x-auto">
        <CrossHeatmap crosstab={item.crosstab} maxPct={maxPct} varBLabel={item.var_b.label} />
      </div>
    </div>
  );
}

function SignificanceBadge({
  significant,
  pValue,
}: {
  significant: boolean;
  pValue: number;
}) {
  if (significant) {
    return (
      <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400">
        显著相关
      </span>
    );
  }
  return (
    <span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
      不显著 (p={pValue})
    </span>
  );
}

function CrossHeatmap({
  crosstab,
  maxPct,
  varBLabel,
}: {
  crosstab: CrossAnalysisResult["crosstab"];
  maxPct: number;
  varBLabel: string;
}) {
  const bLabels = crosstab[0]?.values.map((v) => v.label) || [];

  return (
    <div className="min-w-[400px]">
      <div className="text-xs text-gray-400 dark:text-gray-500 mb-2">行: 分组变量 · 列: {varBLabel}</div>
      <div className="grid" style={{ gridTemplateColumns: `120px repeat(${bLabels.length}, minmax(80px, 1fr))` }}>
        {/* Header row */}
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 p-2"></div>
        {bLabels.map((b) => (
          <div key={`h-${b}`} className="text-xs font-medium text-gray-600 dark:text-gray-300 p-2 text-center truncate">
            {b}
          </div>
        ))}

        {/* Data rows */}
        {crosstab.map((row) => (
          <div key={`r-${row.label}`} className="contents">
            <div className="text-xs text-gray-700 dark:text-gray-300 p-2 font-medium flex items-center truncate">
              {row.label}
              <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">(n={row.total})</span>
            </div>
            {row.values.map((v) => {
              const intensity = maxPct > 0 ? v.percentage / maxPct : 0;
              const bgOpacity = 0.1 + intensity * 0.5; // 0.1 ~ 0.6
              return (
                <div
                  key={`${row.label}-${v.label}`}
                  className="p-2 text-center rounded-md transition-colors"
                  style={{
                    backgroundColor: `rgba(59, 130, 246, ${bgOpacity})`,
                  }}
                >
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{v.percentage}%</span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 ml-1">({v.count})</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
