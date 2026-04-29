"use client";

import type { StructureMetaItem } from "@/lib/types";
import { Eye, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "./shared/EmptyState";
import { TypeBadge } from "./shared/TypeBadge";

interface StructureMetaPanelProps {
  meta?: StructureMetaItem[];
}

export function StructureMetaPanel({ meta }: StructureMetaPanelProps) {
  if (!meta || meta.length === 0) {
    return <EmptyState icon={Eye} message="暂无识别详情" />;
  }

  // 统计各类型数量
  const typeCounts: Record<string, number> = {};
  meta.forEach((m) => {
    typeCounts[m.detected_type] = (typeCounts[m.detected_type] || 0) + 1;
  });

  const llmOverrideCount = meta.filter((m) => m.llm_override).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="识别题目数" value={meta.length} />
        <SummaryCard label="LLM 校正" value={llmOverrideCount} highlight={llmOverrideCount > 0} />
        {Object.entries(typeCounts).map(([type, count]) => (
          <SummaryCard key={type} label={typeLabel(type)} value={count} />
        ))}
      </div>

      {/* Detail Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">题目</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">识别类型</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">样例值</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">唯一值</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">识别依据</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {meta.map((item, idx) => (
                <MetaRow key={`${idx}-${item.column}`} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${highlight ? "bg-blue-50 dark:bg-blue-950/30" : "bg-gray-50 dark:bg-gray-800/50"}`}>
      <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function MetaRow({ item }: { item: StructureMetaItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer ${
          item.llm_override ? "border-l-2 border-l-blue-400" : ""
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5 text-gray-900 dark:text-gray-100 max-w-[200px] truncate" title={item.column}>
          <div className="flex items-center gap-1.5">
            {item.llm_override && <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            <span>{item.column}</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <TypeBadge type={item.detected_type} />
        </td>
        <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
          {item.sample_values.slice(0, 3).join("、")}
          {item.sample_values.length > 3 && "..."}
        </td>
        <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">{item.unique_count}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{item.llm_override ? "LLM 校正" : "规则引擎"}</span>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="px-4 py-3 bg-gray-50 dark:bg-gray-800/30">
            <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">样例值：</span>
                <span>{item.sample_values.join("、") || "无"}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">非空回答数：</span>
                <span>{item.non_empty_count}</span>
              </div>
              {item.llm_override && (
                <div className="flex items-start gap-1.5 text-blue-600 dark:text-blue-400">
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>LLM 校正：规则识别为「{typeLabel(item.rule_type || "unknown")}」，校正为「{typeLabel(item.detected_type)}」。依据：{item.llm_reason || "语义分析"}</span>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    single_choice: "单选",
    multi_select_single_col: "多选",
    multi_select_column: "多选列",
    multi_select_columns: "多选列",
    likert: "量表",
    text: "文本",
    demographic: "人口学",
    unknown: "未知",
    skip: "跳过",
  };
  return map[type] || type;
}
