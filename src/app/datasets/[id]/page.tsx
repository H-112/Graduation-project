"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadAnalysisData, getDatasetMeta, type DatasetMeta } from "@/lib/data";
import type { QuickOverviewResult, DescriptiveStats, CategoricalResult, TextAnalysisResult } from "@/lib/types";
import { SummaryCards } from "@/components/analysis/SummaryCards";
import { DemographicsPanel } from "@/components/analysis/DemographicsPanel";
import { UsagePanel } from "@/components/analysis/UsagePanel";
import { LikertPanel } from "@/components/analysis/LikertPanel";
import { KeywordsPanel } from "@/components/analysis/KeywordsPanel";
import { LlmInsightsPanel, LLM_REPORTS } from "@/components/analysis/LlmInsightsPanel";
import { CompleteReportPanel } from "@/components/analysis/CompleteReportPanel";
import { BarChart3, PieChart, Sparkles, Activity, FileText, BookOpen } from "lucide-react";

type Tab = "demographics" | "usage" | "likert" | "text" | "llm" | "report";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "demographics", label: "人口学分布", icon: PieChart },
  { key: "usage", label: "选择题统计", icon: Activity },
  { key: "likert", label: "Likert 量表", icon: BarChart3 },
  { key: "text", label: "文本分析", icon: FileText },
  { key: "llm", label: "AI 洞察", icon: Sparkles },
  { key: "report", label: "完整报告", icon: BookOpen },
];

export default function DatasetDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<QuickOverviewResult | null>(null);
  const [meta, setMeta] = useState<DatasetMeta | undefined>();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("demographics");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadAnalysisData(id),
      Promise.resolve(getDatasetMeta(id)),
    ]).then(([d, m]) => {
      setData(d);
      setMeta(m);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-100 rounded w-1/3" />
          <div className="grid grid-cols-4 gap-4 mt-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data || !meta) {
    return (
      <div className="max-w-5xl mx-auto px-8 py-12">
        <p className="text-gray-500">数据未找到</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">{meta.title}</h2>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
          <span>样本: {meta.records} 份</span>
          <span>·</span>
          <span>字段: {meta.fields} 列</span>
          <span>·</span>
          <span>{meta.source}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards data={data} />

      {/* Tabs — only show tabs that have data */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {TABS.filter(tab => {
          if (tab.key === "demographics") return Object.keys(data.demographics || {}).length > 0;
          if (tab.key === "usage") return Object.keys(data.genai_usage || {}).length > 0;
          if (tab.key === "likert") return Object.keys(data.likert_scales || {}).length > 0;
          if (tab.key === "text") return Object.keys(data.text_analysis || {}).length > 0;
          if (tab.key === "llm") return true; // always show if available
          return true;
        }).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {activeTab === "demographics" && (
          <DemographicsPanel demographics={data.demographics || {}} />
        )}
        {activeTab === "usage" && (
          <UsagePanel usage={data.genai_usage || {}} />
        )}
        {activeTab === "likert" && (
          <LikertPanel likert={data.likert_scales || {}} />
        )}
        {activeTab === "text" && (
          <KeywordsPanel textAnalysis={data.text_analysis || {}} />
        )}
        {activeTab === "llm" && (
          <LlmInsightsPanel datasetId={id} />
        )}
        {activeTab === "report" && (
          <CompleteReportPanel data={data} llmReports={LLM_REPORTS[id] || []} />
        )}
      </div>
    </div>
  );
}
