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
import { LikertLlmPanel } from "@/components/analysis/LikertLlmPanel";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { BarChart3, PieChart, Sparkles, Activity, FileText, BookOpen, Loader2, AlertCircle, Search, TrendingUp } from "lucide-react";

type Tab = "demographics" | "usage" | "likert" | "text" | "llm" | "likertLlm" | "report" | "deep";

function UploadedResultContent() {
  const searchParams = useSearchParams();
  const url = searchParams.get("url") || "";
  const reportsParam = searchParams.get("reports") || "";
  const deepReportUrl = searchParams.get("deepReport") || "";
  const likertReportsParam = searchParams.get("likertReports") || "";
  const [data, setData] = useState<QuickOverviewResult | null>(null);
  const [deepReport, setDeepReport] = useState("");
  const [likertJson, setLikertJson] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("demographics");

  const llmReports = reportsParam
    ? reportsParam.split(",").map((f) => ({ label: decodeURIComponent(f.replace(/_/g, " ")), file: f }))
    : [];

  const likertReports = likertReportsParam
    ? likertReportsParam.split(",").map((f) => ({ label: decodeURIComponent(f.replace(/_/g, " ")), file: f }))
    : [];

  // Determine available tabs based on what data we have
  const hasJsonData = !!data;
  const hasDeepReport = !!deepReportUrl || !!deepReport;
  const hasLlmReports = llmReports.length > 0;
  const hasLikertLlm = likertReports.length > 0;

  const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    ...(hasJsonData ? [
      { key: "demographics" as Tab, label: "人口学分布", icon: PieChart },
      { key: "usage" as Tab, label: "选择题统计", icon: Activity },
      { key: "likert" as Tab, label: "量表分析", icon: BarChart3 },
      { key: "text" as Tab, label: "文本分析", icon: FileText },
    ] : []),
    ...(hasLlmReports ? [{ key: "llm" as Tab, label: "LLM 洞察", icon: Sparkles }] : []),
    ...(hasLikertLlm ? [{ key: "likertLlm" as Tab, label: "量表洞察", icon: TrendingUp }] : []),
    ...(hasDeepReport ? [{ key: "deep" as Tab, label: "深度研究", icon: Search }] : []),
    ...(hasJsonData ? [{ key: "report" as Tab, label: "完整报告", icon: BookOpen }] : []),
  ];

  useEffect(() => {
    // If no URL at all and no deep report, error out
    if (!url && !deepReportUrl) {
      setError("未提供分析结果URL");
      setLoading(false);
      return;
    }

    const promises: Promise<void>[] = [];

    // Fetch JSON data if url is provided and looks like JSON
    if (url && !url.endsWith(".md")) {
      promises.push(
        fetch(url)
          .then(r => {
            if (!r.ok) throw new Error("加载失败");
            return r.json();
          })
          .then(setData)
          .catch(e => {
            console.error("JSON fetch error:", e);
            // Don't set global error - maybe we still have deep report
          })
      );
    }

    // If url IS a markdown file, fetch it as deep report text
    if (url && url.endsWith(".md")) {
      promises.push(
        fetch(url)
          .then(r => {
            if (!r.ok) throw new Error("加载失败");
            return r.text();
          })
          .then(setDeepReport)
          .catch(e => {
            console.error("Markdown fetch error:", e);
            setError(e.message);
          })
      );
    }

    // Fetch deep report if provided separately
    if (deepReportUrl) {
      promises.push(
        fetch(deepReportUrl)
          .then(r => {
            if (!r.ok) throw new Error("加载深度研究报告失败");
            return r.text();
          })
          .then(setDeepReport)
          .catch(e => {
            console.error("Deep report fetch error:", e);
            setError(e.message);
          })
      );
    }

    Promise.all(promises).finally(() => setLoading(false));
  }, [url, deepReportUrl]);

  // Fetch likert LLM JSON report separately (not blocking)
  useEffect(() => {
    const jsonReport = likertReports.find((r) => r.file.endsWith("_likert_analysis.json"));
    if (!jsonReport) return;
    fetch(`/llm-reports/${encodeURIComponent(jsonReport.file)}`)
      .then((r) => {
        if (!r.ok) throw new Error("加载量表洞察数据失败");
        return r.json();
      })
      .then((json) => setLikertJson(json as Record<string, unknown>))
      .catch((e) => console.error("Likert JSON fetch error:", e));
  }, [likertReportsParam]);

  // Auto-select first available tab if current tab is invalid

  // Auto-select first available tab if current tab is invalid
  useEffect(() => {
    const availableKeys = TABS.map(t => t.key);
    if (availableKeys.length > 0 && !availableKeys.includes(activeTab)) {
      setActiveTab(availableKeys[0]);
    }
  }, [TABS, activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
        <span className="text-gray-500">加载分析结果...</span>
      </div>
    );
  }

  if (error && !data && !deepReport) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  // Nothing to show at all
  if (!data && !deepReport) {
    return (
      <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
        <AlertCircle className="w-5 h-5 text-yellow-500" />
        <p className="text-yellow-700">未找到分析结果数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{data?.dataset || "分析结果"}</h2>
        {data && (
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span>样本: {data.total_records} 份</span>
            <span>·</span>
            <span>字段: {data.total_fields} 列</span>
          </div>
        )}
      </div>

      {data && <SummaryCards data={data} />}

      {TABS.length > 0 && (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
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
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {activeTab === "demographics" && data && (
          <DemographicsPanel demographics={data.demographics || {}} />
        )}
        {activeTab === "usage" && data?.genai_usage && (
          <UsagePanel usage={data.genai_usage} />
        )}
        {activeTab === "likert" && data && (
          <LikertPanel likert={data.likert_scales || {}} />
        )}
        {activeTab === "text" && data && (
          <KeywordsPanel textAnalysis={data.text_analysis || {}} />
        )}
        {activeTab === "llm" && (
          <DynamicLlmPanel reports={llmReports} />
        )}
        {activeTab === "likertLlm" && (
          <LikertLlmPanel data={likertJson as unknown as import("@/components/analysis/LikertLlmPanel").LikertLlmData | null} />
        )}
        {activeTab === "deep" && (
          <DeepResearchPanel content={deepReport} />
        )}
        {activeTab === "report" && data && (
          <CompleteReportPanel data={data} llmReports={llmReports} />
        )}
      </div>
    </div>
  );
}

function DeepResearchPanel({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-amber-500 mr-2" />
        <span className="text-sm text-gray-500">加载深度研究报告...</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-xl p-6">
      <MarkdownRenderer content={content} />
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
          <MarkdownRenderer content={content} />
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
