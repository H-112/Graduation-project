"use client";

import type { QuickOverviewResult } from "@/lib/types";
import { Users, CheckCircle, Hash, Filter } from "lucide-react";

export function SummaryCards({ data }: { data: QuickOverviewResult }) {
  const totalQuestions = Object.keys(data.likert_scales || {}).reduce(
    (sum, k) => sum + (data.likert_scales[k]?.length || 0), 0
  );
  const totalKeywords = Object.values(data.text_analysis || {}).reduce(
    (sum, t) => sum + (t?.total_answers || 0), 0
  );
  const cleanRate = data.cleaning?.retention_rate;

  return (
    <div>
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={Users}
          label="有效样本"
          value={data.cleaning?.final_count || data.total_records}
          color="blue"
        />
        <SummaryCard
          icon={Hash}
          label="检测题型"
          value={totalQuestions + Object.keys(data.demographics || {}).length + Object.keys(data.genai_usage || {}).length}
          color="purple"
        />
        <SummaryCard
          icon={CheckCircle}
          label="文本答案"
          value={totalKeywords}
          color="green"
        />
        <SummaryCard
          icon={Filter}
          label="数据留存率"
          value={cleanRate ? `${cleanRate}%` : "100%"}
          color="orange"
        />
      </div>
      {/* 数据清洗详情 */}
      {data.cleaning && (data.cleaning.removed_empty + data.cleaning.removed_duplicates + data.cleaning.removed_low_quality + (data.cleaning.removed_skips || 0)) > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
          <div className="flex items-center gap-3">
            <Filter className="w-3 h-3" />
            <span>原始样本: {data.cleaning.original_count}</span>
            {data.cleaning.removed_empty > 0 && <span>· 空行: −{data.cleaning.removed_empty}</span>}
            {data.cleaning.removed_duplicates > 0 && <span>· 重复: −{data.cleaning.removed_duplicates}</span>}
            {data.cleaning.removed_low_quality > 0 && <span>· 低质: −{data.cleaning.removed_low_quality}</span>}
            <span className="text-gray-600 dark:text-gray-400 font-medium">→ 有效样本: {data.cleaning.final_count}</span>
          </div>
          {(data.cleaning.removed_skips || 0) > 0 && (
            <span className="text-gray-400 dark:text-gray-500 italic">
              （{(data.cleaning.removed_skips || 0)} 个单元格含「跳过」标记已置空）
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon, label, value, color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: string;
}) {
  const colorClasses: Record<string, { bg: string; text: string; iconBg: string }> = {
    blue: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-400", iconBg: "bg-blue-100 dark:bg-blue-900/40" },
    purple: { bg: "bg-purple-50 dark:bg-purple-950/30", text: "text-purple-700 dark:text-purple-400", iconBg: "bg-purple-100 dark:bg-purple-900/40" },
    green: { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-400", iconBg: "bg-green-100 dark:bg-green-900/40" },
    orange: { bg: "bg-orange-50 dark:bg-orange-950/30", text: "text-orange-700 dark:text-orange-400", iconBg: "bg-orange-100 dark:bg-orange-900/40" },
  };
  const c = colorClasses[color] || colorClasses.blue;

  return (
    <div className={`rounded-xl p-4 ${c.bg}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.iconBg}`}>
          <Icon className={`w-4 h-4 ${c.text}`} />
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className={`text-2xl font-bold ${c.text}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
