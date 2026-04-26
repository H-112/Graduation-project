"use client";

import { ShieldAlert, ShieldCheck, AlertTriangle, AlertCircle, Info } from "lucide-react";

export interface BiasItem {
  type: string;
  severity: "high" | "medium" | "low";
  evidence: string;
  impact: string;
  mitigation: string;
}

export interface SampleBiasData {
  overall_risk: "high" | "medium" | "low";
  overall_reasoning: string;
  biases: BiasItem[];
  generalizability_note: string;
}

const RISK_CONFIG = {
  high: { label: "高风险", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", icon: ShieldAlert },
  medium: { label: "中风险", color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", icon: AlertTriangle },
  low: { label: "低风险", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", icon: ShieldCheck },
};

const SEVERITY_CONFIG = {
  high: { label: "高", dot: "bg-red-500", border: "border-red-200 dark:border-red-800", bg: "bg-red-50 dark:bg-red-950/30" },
  medium: { label: "中", dot: "bg-amber-500", border: "border-amber-200 dark:border-amber-800", bg: "bg-amber-50 dark:bg-amber-950/30" },
  low: { label: "低", dot: "bg-green-500", border: "border-green-200 dark:border-green-800", bg: "bg-green-50 dark:bg-green-950/30" },
};

export function SampleBiasPanel({ data }: { data: SampleBiasData | null }) {
  if (!data) {
    return (
      <div className="text-center py-12">
        <ShieldCheck className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">暂无样本偏差诊断数据</p>
      </div>
    );
  }

  const riskConfig = RISK_CONFIG[data.overall_risk] || RISK_CONFIG.low;
  const RiskIcon = riskConfig.icon;

  return (
    <div className="space-y-6">
      {/* Overall Risk */}
      <div className={`rounded-xl border p-6 ${riskConfig.bg} ${riskConfig.border}`}>
        <div className="flex items-center gap-3 mb-3">
          <RiskIcon className={`w-8 h-8 ${riskConfig.color}`} />
          <div>
            <div className={`text-lg font-bold ${riskConfig.color}`}>{riskConfig.label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">样本偏差总体评估</div>
          </div>
        </div>
        {data.overall_reasoning && (
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{data.overall_reasoning}</p>
        )}
      </div>

      {/* Bias List */}
      {data.biases.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">偏差详情</h4>
          {data.biases.map((bias, idx) => {
            const sev = SEVERITY_CONFIG[bias.severity] || SEVERITY_CONFIG.low;
            return (
              <div key={idx} className={`rounded-xl border p-4 ${sev.bg} ${sev.border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{bias.type}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                    {sev.label}
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{bias.evidence}</p>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 space-y-1">
                  <div><span className="font-medium">影响:</span> {bias.impact}</div>
                  <div><span className="font-medium">缓解:</span> {bias.mitigation}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generalizability */}
      {data.generalizability_note && (
        <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-blue-800 dark:text-blue-400 mb-1">可推广性说明</div>
            <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">{data.generalizability_note}</p>
          </div>
        </div>
      )}
    </div>
  );
}
