"use client";

import type { QualityMetrics, CleaningStats } from "@/lib/types";
import { Shield, AlertTriangle, AlertCircle, CheckCircle2, Copy, EyeOff } from "lucide-react";
import { EmptyState } from "./shared/EmptyState";
import { TypeBadge } from "./shared/TypeBadge";

interface DataQualityPanelProps {
  metrics?: QualityMetrics;
  cleaning?: CleaningStats;
}

export function DataQualityPanel({ metrics, cleaning }: DataQualityPanelProps) {
  if (!metrics || !cleaning) {
    return <EmptyState icon={Shield} message="暂无数据质量指标" />;
  }

  const { per_question, overall_missing_avg, high_missing_count, extreme_missing_count } = metrics;

  const getMissingRateColor = (rate: number) => {
    if (rate > 70) return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
    if (rate > 30) return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30";
    return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30";
  };

  const getMissingRateIcon = (rate: number) => {
    if (rate > 70) return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (rate > 30) return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  };

  const getMissingRateBarColor = (rate: number) => {
    if (rate > 70) return "bg-red-500";
    if (rate > 30) return "bg-amber-500";
    return "bg-emerald-500";
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QualityCard
          label="数据保留率"
          value={`${cleaning.retention_rate}%`}
          sub={`${cleaning.final_count} / ${cleaning.original_count}`}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
          bg="bg-emerald-50 dark:bg-emerald-950/30"
        />
        <QualityCard
          label="平均缺失率"
          value={`${overall_missing_avg}%`}
          sub="所有题目平均"
          icon={<Shield className="w-5 h-5 text-blue-500" />}
          bg="bg-blue-50 dark:bg-blue-950/30"
        />
        <QualityCard
          label="高缺失题目"
          value={`${high_missing_count}`}
          sub="缺失率 > 30%"
          icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
          bg="bg-amber-50 dark:bg-amber-950/30"
        />
        <QualityCard
          label="极端缺失题目"
          value={`${extreme_missing_count}`}
          sub="缺失率 > 70%"
          icon={<AlertCircle className="w-5 h-5 text-red-500" />}
          bg="bg-red-50 dark:bg-red-950/30"
        />
      </div>

      {/* Cleaning Details */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">数据清洗详情</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <CleaningItem label="原始记录" value={cleaning.original_count} />
          <CleaningItem label="去除空行" value={cleaning.removed_empty} color="text-gray-500" />
          <CleaningItem label="去除重复" value={cleaning.removed_duplicates} color="text-gray-500" />
          <CleaningItem label="去除低质量" value={cleaning.removed_low_quality} color="text-gray-500" />
          <CleaningItem label="跳过标记替换" value={cleaning.removed_skips || 0} color="text-gray-500" />
        </div>
      </div>

      {/* Cleaning Examples */}
      {cleaning.examples && (
        <div className="space-y-3">
          {cleaning.examples.duplicates.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-4 border border-amber-100 dark:border-amber-900/30">
              <div className="flex items-center gap-2 mb-2">
                <Copy className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">重复记录示例（前3组）</h4>
              </div>
              <div className="space-y-2">
                {cleaning.examples.duplicates.map((dup, i) => (
                  <div key={i} className="text-xs text-amber-700 dark:text-amber-400 bg-white dark:bg-gray-900/50 rounded-lg px-3 py-2">
                    <span className="font-medium">重复 {dup.count} 次</span>
                    <span className="text-gray-400 dark:text-gray-500 mx-1">·</span>
                    <span className="font-mono text-gray-600 dark:text-gray-400 truncate">{dup.sample}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cleaning.examples.low_quality.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-4 border border-red-100 dark:border-red-900/30">
              <div className="flex items-center gap-2 mb-2">
                <EyeOff className="w-4 h-4 text-red-600 dark:text-red-400" />
                <h4 className="text-sm font-semibold text-red-800 dark:text-red-300">低质量记录示例（缺失率 ≥ 80%）</h4>
              </div>
              <div className="space-y-2">
                {cleaning.examples.low_quality.map((ex, i) => (
                  <div key={i} className="text-xs text-red-700 dark:text-red-400 bg-white dark:bg-gray-900/50 rounded-lg px-3 py-2">
                    <span className="font-medium">缺失率 {ex.missing_rate}%</span>
                    <span className="text-gray-400 dark:text-gray-500 mx-1">·</span>
                    <span>仅填 {ex.non_empty_count}/{ex.total_fields} 列</span>
                    <span className="text-gray-400 dark:text-gray-500 mx-1">·</span>
                    <span className="text-gray-600 dark:text-gray-400">已填: {ex.filled_columns.join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-Question Table */}
      <div>
        <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">各题缺失率明细</h4>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">题目</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">识别类型</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">有效回答</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">缺失数</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">缺失率</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 w-32">可视化</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {per_question.map((q, idx) => (
                  <tr key={`${idx}-${q.column}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100 max-w-[200px] truncate" title={q.column}>
                      {q.column}
                    </td>
                    <td className="px-4 py-2.5">
                      <TypeBadge type={q.detected_type} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                      {q.valid}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                      {q.missing}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getMissingRateColor(q.missing_rate)}`}>
                        {getMissingRateIcon(q.missing_rate)}
                        {q.missing_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getMissingRateBarColor(q.missing_rate)}`}
                          style={{ width: `${Math.min(q.missing_rate, 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function QualityCard({
  label,
  value,
  sub,
  icon,
  bg,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

function CleaningItem({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-lg font-semibold ${color || "text-gray-900 dark:text-gray-100"}`}>{value}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500">{label}</div>
    </div>
  );
}
