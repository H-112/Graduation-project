"use client";

import { TrendingUp, AlertTriangle, CheckCircle, Info, Lightbulb } from "lucide-react";

export interface LikertItem {
  column: string;
  mean: number;
  std: number;
  median: number;
  interpretation: string;
  concern_level: "low" | "medium" | "high";
  suggestion: string;
}

export interface ScaleGroup {
  group_name: string;
  overall_assessment: string;
  overall_mean: number;
  reliability_indicator?: string;
  strengths?: string[];
  concerns?: string[];
  items: LikertItem[];
  key_insight: string;
}

export interface LikertLlmData {
  scale_groups: ScaleGroup[];
  cross_scale_findings?: string[];
  overall_recommendation?: string;
}

const CONCERN_CONFIG = {
  low: { label: "良好", color: "text-green-700", bg: "bg-green-50", border: "border-green-200", icon: CheckCircle, dot: "bg-green-500" },
  medium: { label: "关注", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", icon: AlertTriangle, dot: "bg-amber-500" },
  high: { label: "需重视", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: AlertTriangle, dot: "bg-red-500" },
};

export function LikertLlmPanel({ data }: { data: LikertLlmData | null }) {
  if (!data || !data.scale_groups?.length) {
    return (
      <div className="text-center py-12">
        <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">暂无量表 LLM 洞察数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-purple-500" />
        <h3 className="text-lg font-bold text-gray-900">量表深度洞察 (DeepSeek)</h3>
      </div>

      {/* Scale Groups */}
      {data.scale_groups.map((group) => {
        const groupMeanColor =
          group.overall_mean >= 4 ? "text-green-600" :
          group.overall_mean >= 3 ? "text-amber-600" : "text-red-600";

        return (
          <div key={group.group_name} className="bg-gray-50 rounded-xl p-5 space-y-4">
            {/* Group header */}
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-gray-900">{group.group_name}</h4>
                <p className="text-xs text-gray-500 mt-1">{group.overall_assessment}</p>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${groupMeanColor}`}>
                  {group.overall_mean.toFixed(2)}
                </div>
                <div className="text-[10px] text-gray-400">组均值</div>
              </div>
            </div>

            {/* Reliability + strengths/concerns */}
            {(group.reliability_indicator || group.strengths?.length || group.concerns?.length) && (
              <div className="flex flex-wrap gap-2">
                {group.reliability_indicator && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                    <Info className="w-3 h-3" />
                    {group.reliability_indicator}
                  </span>
                )}
                {group.strengths?.map((s, i) => (
                  <span key={`s-${i}`} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-green-50 text-green-700 rounded-full border border-green-100">
                    <CheckCircle className="w-3 h-3" />
                    {s}
                  </span>
                ))}
                {group.concerns?.map((c, i) => (
                  <span key={`c-${i}`} className="inline-flex items-center gap-1 px-2 py-1 text-[11px] bg-red-50 text-red-700 rounded-full border border-red-100">
                    <AlertTriangle className="w-3 h-3" />
                    {c}
                  </span>
                ))}
              </div>
            )}

            {/* Items table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-600">
                    <th className="text-left px-3 py-2 font-medium">题项</th>
                    <th className="text-center px-2 py-2 font-medium w-14">均值</th>
                    <th className="text-center px-2 py-2 font-medium w-14">标准差</th>
                    <th className="text-center px-2 py-2 font-medium w-16">等级</th>
                    <th className="text-left px-3 py-2 font-medium">解读</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item, idx) => {
                    const config = CONCERN_CONFIG[item.concern_level] || CONCERN_CONFIG.medium;
                    const Icon = config.icon;
                    return (
                      <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-gray-700 font-medium max-w-[200px] truncate" title={item.column}>
                          {item.column}
                        </td>
                        <td className="px-2 py-2.5 text-center text-gray-900 font-semibold">
                          {item.mean.toFixed(2)}
                        </td>
                        <td className="px-2 py-2.5 text-center text-gray-500">
                          {item.std.toFixed(2)}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.bg} ${config.color} ${config.border} border`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 leading-relaxed">
                          {item.interpretation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Suggestions per item */}
            <div className="space-y-2">
              {group.items.filter((i) => i.suggestion).map((item, idx) => (
                <div key={`sg-${idx}`} className="flex items-start gap-2 text-xs text-gray-600 bg-white rounded-lg p-3 border border-gray-100">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium text-gray-700">{item.column}</span>
                    <span className="text-gray-400 mx-1">·</span>
                    {item.suggestion}
                  </div>
                </div>
              ))}
            </div>

            {/* Key insight */}
            {group.key_insight && (
              <div className="flex items-start gap-2 text-xs text-purple-700 bg-purple-50 rounded-lg p-3 border border-purple-100">
                <SparkleIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="font-medium">核心洞察:</span>
                <span>{group.key_insight}</span>
              </div>
            )}
          </div>
        );
      })}

      {/* Cross-scale findings */}
      {data.cross_scale_findings && data.cross_scale_findings.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="text-sm font-bold text-gray-900 mb-3">跨量表发现</h4>
          <ul className="space-y-2">
            {data.cross_scale_findings.map((finding, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Overall recommendation */}
      {data.overall_recommendation && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-100 p-5">
          <h4 className="text-sm font-bold text-purple-900 mb-2">总体建议</h4>
          <p className="text-sm text-gray-700 leading-relaxed">{data.overall_recommendation}</p>
        </div>
      )}
    </div>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em">
      <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
    </svg>
  );
}
