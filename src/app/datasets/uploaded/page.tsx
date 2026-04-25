"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { QuickOverviewResult } from "@/lib/types";
import { SummaryCards } from "@/components/analysis/SummaryCards";
import { DemographicsPanel } from "@/components/analysis/DemographicsPanel";
import { UsagePanel } from "@/components/analysis/UsagePanel";
import { LikertPanel } from "@/components/analysis/LikertPanel";
import { KeywordsPanel } from "@/components/analysis/KeywordsPanel";
import { CompleteReportPanel } from "@/components/analysis/CompleteReportPanel";
import { BarChart3, PieChart, Sparkles, Activity, FileText, BookOpen, Loader2, AlertCircle, ChevronDown } from "lucide-react";

type Tab = "demographics" | "usage" | "likert" | "text" | "llm" | "report";

function UploadedResultContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") || "";
  const reportsParam = searchParams.get("reports") || "";
  const [data, setData] = useState<QuickOverviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("demographics");

  const llmReports = reportsParam
    ? reportsParam.split(",").map((f) => ({ label: decodeURIComponent(f.replace(/_/g, " ")), file: f }))
    : [];

  const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "demographics", label: "人口学分布", icon: PieChart },
    { key: "usage", label: "选择题统计", icon: Activity },
    { key: "likert", label: "量表分析", icon: BarChart3 },
    { key: "text", label: "文本分析", icon: FileText },
    ...(llmReports.length > 0 ? [{ key: "llm" as Tab, label: "LLM 洞察", icon: Sparkles }] : []),
    { key: "report", label: "完整报告", icon: BookOpen },
  ];

  useEffect(() => {
    if (!url) {
      setError("未提供分析结果URL");
      setLoading(false);
      return;
    }
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error("加载失败");
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
        <span className="text-gray-500">加载分析结果...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{data.dataset || "上传数据"}</h2>
        <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
          <span>样本: {data.total_records} 份</span>
          <span>·</span>
          <span>字段: {data.total_fields} 列</span>
        </div>
      </div>

      <SummaryCards data={data} />

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
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

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {activeTab === "demographics" && (
          <DemographicsPanel demographics={data.demographics || {}} />
        )}
        {activeTab === "usage" && data.genai_usage && (
          <UsagePanel usage={data.genai_usage} />
        )}
        {activeTab === "likert" && (
          <LikertPanel likert={data.likert_scales || {}} />
        )}
        {activeTab === "text" && (
          <KeywordsPanel textAnalysis={data.text_analysis || {}} />
        )}
        {activeTab === "llm" && (
          <DynamicLlmPanel reports={llmReports} />
        )}
        {activeTab === "report" && (
          <CompleteReportPanel data={data} llmReports={llmReports} />
        )}
      </div>
    </div>
  );
}

function DynamicLlmPanel({ reports }: { reports: { label: string; file: string }[] }) {
  const [active, setActive] = useState(reports[0]?.file || "");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    fetch(`/llm-reports/${encodeURIComponent(active)}`)
      .then(r => r.text())
      .then(setContent)
      .catch(() => setContent("报告加载失败"))
      .finally(() => setLoading(false));
  }, [active]);

  if (reports.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-8">暂无 LLM 报告</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {reports.map(({ label, file }) => (
          <button
            key={file}
            onClick={() => setActive(file)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
              active === file
                ? "bg-purple-100 text-purple-700"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-purple-500 mr-2" />
          <span className="text-sm text-gray-500">加载中...</span>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-xl p-6">
          <div className="text-sm text-gray-700 leading-relaxed space-y-3">
            {content.split("\n").map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={i} className="h-2" />;
              if (trimmed.startsWith("### ")) {
                return <h5 key={i} className="text-base font-bold text-gray-900 mt-4">{trimmed.replace("### ", "")}</h5>;
              }
              if (trimmed.startsWith("## ")) {
                return <h4 key={i} className="text-lg font-bold text-gray-900 mt-5">{trimmed.replace("## ", "")}</h4>;
              }
              if (trimmed.startsWith("# ")) {
                return <h3 key={i} className="text-xl font-bold text-gray-900">{trimmed.replace("# ", "")}</h3>;
              }
              if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                return <li key={i} className="ml-4 text-gray-600">{trimmed.replace(/^[*-] /, "").replace(/\*\*(.*?)\*\*/g, "$1")}</li>;
              }
              if (trimmed === "---") return <hr key={i} className="my-3 border-gray-200" />;
              const cleaned = trimmed
                .replace(/\*\*(.*?)\*\*/g, (_, t) => `<strong>${t}</strong>`)
                .replace(/\*(.*?)\*/g, (_, t) => `<em>${t}</em>`);
              return <p key={i} className="text-gray-600" dangerouslySetInnerHTML={{ __html: cleaned }} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function UploadedResultPage() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <Suspense fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
          <span className="text-gray-500">加载中...</span>
        </div>
      }>
        <UploadedResultContent />
      </Suspense>
    </div>
  );
}
