"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { QuickOverviewResult } from "@/lib/types";
import { TheoryMappingPanel, type TheoryMappingData } from "@/components/analysis/TheoryMappingPanel";
import { ActionableInsightPanel, type ActionableInsightData } from "@/components/analysis/ActionableInsightPanel";
import { ResearchGapPanel, type ResearchGapData } from "@/components/analysis/ResearchGapPanel";
import { CausalInferencePanel, type CausalInferenceData } from "@/components/analysis/CausalInferencePanel";
import { SampleBiasPanel, type SampleBiasData } from "@/components/analysis/SampleBiasPanel";
import { ResearchReport } from "@/components/analysis/ResearchReport";
import { StandardReport } from "@/components/analysis/StandardReport";
import { UsagePanel } from "@/components/analysis/UsagePanel";
import { Loader2, AlertCircle } from "lucide-react";
import type { HistoryRecord } from "@/lib/history";

function UploadedResultContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") || "";

  // URL states — 优先从 query params 初始化，可被 history record 覆盖
  const [resultUrl, setResultUrl] = useState(searchParams.get("url") || "");
  const [reportsParam, setReportsParam] = useState(searchParams.get("reports") || "");
  const [deepReportUrl, setDeepReportUrl] = useState(searchParams.get("deepReport") || "");
  const [likertReportsParam, setLikertReportsParam] = useState(searchParams.get("likertReports") || "");
  const [theoryUrl, setTheoryUrl] = useState(searchParams.get("theory") || "");
  const [actionableUrl, setActionableUrl] = useState(searchParams.get("actionable") || "");
  const [gapUrl, setGapUrl] = useState(searchParams.get("gap") || "");
  const [causalUrl, setCausalUrl] = useState(searchParams.get("causal") || "");
  const [biasUrl, setBiasUrl] = useState(searchParams.get("bias") || "");

  const [data, setData] = useState<QuickOverviewResult | null>(null);

  const [deepReport, setDeepReport] = useState("");
  const [likertJson, setLikertJson] = useState<Record<string, unknown> | null>(null);
  const [theoryData, setTheoryData] = useState<TheoryMappingData | null>(null);
  const [actionableData, setActionableData] = useState<ActionableInsightData | null>(null);
  const [gapData, setGapData] = useState<ResearchGapData | null>(null);
  const [causalData, setCausalData] = useState<CausalInferenceData | null>(null);
  const [biasData, setBiasData] = useState<SampleBiasData | null>(null);
  const hasUrl = !!searchParams.get("url") || !!searchParams.get("deepReport") || !!id;
  const [loading, setLoading] = useState(hasUrl);
  const [error, setError] = useState(hasUrl ? "" : "未提供分析结果URL");
  const [analysisMode, setAnalysisMode] = useState<string>("quick_overview");

  // LLM report contents
  const [llmContents, setLlmContents] = useState<string[]>([]);
  const [inlineTextContents, setInlineTextContents] = useState<{ label: string; content: string }[]>([]);

  // 如果提供了 id，从历史记录获取全部 URL（覆盖 query params）
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/history/${id}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((rec: HistoryRecord | null) => {
        if (!rec) return;
        if (rec.resultUrl) setResultUrl(rec.resultUrl);
        if (rec.deepReportUrl) setDeepReportUrl(rec.deepReportUrl);
        if (rec.llmReports?.length) setReportsParam(rec.llmReports.join(","));
        if (rec.likertReports?.length) setLikertReportsParam(rec.likertReports.join(","));
        if (rec.theoryMappingUrl) setTheoryUrl(rec.theoryMappingUrl);
        if (rec.actionableInsightsUrl) setActionableUrl(rec.actionableInsightsUrl);
        if (rec.researchGapsUrl) setGapUrl(rec.researchGapsUrl);
        if (rec.causalHintsUrl) setCausalUrl(rec.causalHintsUrl);
        if (rec.sampleBiasUrl) setBiasUrl(rec.sampleBiasUrl);
        if (rec.mode) setAnalysisMode(rec.mode);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        console.error("History record fetch error:", e);
      });
    return () => controller.abort();
  }, [id]);

  function getLlmReportLabel(file: string): string {
    const name = decodeURIComponent(file).replace(/\.md$/i, "");
    if (name.includes("comprehensive")) return "综合洞察报告";
    // 匹配 {base}_llm_{序号} 格式，显示为 "逐题深度分析 {序号}"
    const m = name.match(/_llm_(\d+)$/);
    if (m) return `逐题深度分析 ${Number(m[1])}`;
    return name.replace(/_/g, " ");
  }

  const llmReports = reportsParam
    ? reportsParam.split(",").map((f) => ({ label: getLlmReportLabel(f), file: f }))
    : [];

  // 分离逐题文本洞察（内联到文本分析后面）和综合报告（独立章节）
  const inlineTextReports = llmReports.filter((r) => !r.file.toLowerCase().includes("comprehensive"));
  const comprehensiveReport = llmReports.find((r) => r.file.toLowerCase().includes("comprehensive"));

  const likertReports = likertReportsParam
    ? likertReportsParam.split(",").map((f) => ({ label: getLlmReportLabel(f), file: f }))
    : [];

  const hasJsonData = !!data;
  const hasDeepReport = !!deepReportUrl || !!deepReport;
  const hasLlmReports = llmReports.length > 0;
  const hasComprehensiveReport = !!comprehensiveReport;
  const hasInlineTextLlm = inlineTextReports.length > 0;
  const hasLikertLlm = likertReports.length > 0;
  const hasCrossAnalysis = data?.cross_analysis && data.cross_analysis.length > 0;
  const hasDemographics = data?.demographics && Object.keys(data.demographics).length > 0;
  const hasUsage = data?.genai_usage && Object.keys(data.genai_usage).length > 0;
  const hasLikert = data?.likert_scales && Object.keys(data.likert_scales).length > 0;
  const hasText = data?.text_analysis && Object.keys(data.text_analysis).length > 0;
  const hasQuality = data?.quality_metrics && data.quality_metrics.per_question.length > 0;
  const hasStructureMeta = data?.structure_meta && data.structure_meta.length > 0;
  const hasTheory = !!theoryUrl || !!theoryData;
  const hasActionable = !!actionableUrl || !!actionableData;
  const hasGap = !!gapUrl || !!gapData;
  const hasCausal = !!causalUrl || !!causalData;
  const hasBias = !!biasUrl || !!biasData;

  useEffect(() => {
    if (!resultUrl && !deepReportUrl) {
      return;
    }

    const controller = new AbortController();
    const promises: Promise<void>[] = [];

    if (resultUrl && !resultUrl.endsWith(".md")) {
      promises.push(
        fetch(resultUrl, { signal: controller.signal, cache: "no-store" })
          .then(r => {
            if (!r.ok) throw new Error("加载失败");
            return r.json();
          })
          .then((json) => {
            setData(json);
          })
          .catch(e => {
            if ((e as Error).name === "AbortError") return;
            console.error("JSON fetch error:", e);
          })
      );
    }

    if (resultUrl && resultUrl.endsWith(".md")) {
      promises.push(
        fetch(resultUrl, { signal: controller.signal })
          .then(r => {
            if (!r.ok) throw new Error("加载失败");
            return r.text();
          })
          .then(setDeepReport)
          .catch(e => {
            if ((e as Error).name === "AbortError") return;
            console.error("Markdown fetch error:", e);
            setError(e.message);
          })
      );
    }

    if (deepReportUrl) {
      promises.push(
        fetch(deepReportUrl, { signal: controller.signal })
          .then(r => {
            if (!r.ok) throw new Error("加载深度研究报告失败");
            return r.text();
          })
          .then(setDeepReport)
          .catch(e => {
            if ((e as Error).name === "AbortError") return;
            console.error("Deep report fetch error:", e);
            setError(e.message);
          })
      );
    }

    Promise.all(promises).finally(() => setLoading(false));
    return () => controller.abort();
  }, [resultUrl, deepReportUrl]);

  useEffect(() => {
    const jsonReport = likertReports.find((r) => r.file.endsWith("_likert_analysis.json"));
    if (!jsonReport) return;
    const controller = new AbortController();
    fetch(`/llm-reports/${encodeURIComponent(jsonReport.file)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("加载量表洞察数据失败");
        return r.json();
      })
      .then((json) => setLikertJson(json as Record<string, unknown>))
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        console.error("Likert JSON fetch error:", e);
      });
    return () => controller.abort();
  }, [likertReportsParam, likertReports]);

  // Load LLM report contents for inline display
  useEffect(() => {
    if (llmReports.length === 0) return;
    const controller = new AbortController();
    const fetchers = llmReports.map((r) =>
      fetch(`/llm-reports/${encodeURIComponent(r.file)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.text() : `*${r.label}: 加载失败*`))
        .catch((e) => {
          if ((e as Error).name === "AbortError") return "";
          return `*${r.label}: 加载失败*`;
        })
    );
    Promise.all(fetchers)
      .then((contents) => setLlmContents(contents.filter(Boolean)));
    return () => controller.abort();
  }, [reportsParam, llmReports]);

  // Load inline text LLM contents (逐题洞察，不含综合报告)
  useEffect(() => {
    if (inlineTextReports.length === 0) return;
    const controller = new AbortController();
    const fetchers = inlineTextReports.map((r) =>
      fetch(`/llm-reports/${encodeURIComponent(r.file)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.text() : `*加载失败*`))
        .then((content) => ({ label: r.label, content }))
        .catch(() => ({ label: r.label, content: "*加载失败*" }))
    );
    Promise.all(fetchers)
      .then((results) => setInlineTextContents(results));
    return () => controller.abort();
  }, [inlineTextReports]);

  // Load Mode 3 extension data
  useEffect(() => {
    const controller = new AbortController();
    const loadJson = (paramUrl: string, setter: (d: unknown) => void) => {
      if (!paramUrl) return;
      fetch(paramUrl, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => { if (json) setter(json); })
        .catch((e) => {
          if ((e as Error).name === "AbortError") return;
          console.error("Extension data fetch error:", e);
        });
    };
    loadJson(theoryUrl, (d) => setTheoryData(d as TheoryMappingData));
    loadJson(actionableUrl, (d) => setActionableData(d as ActionableInsightData));
    loadJson(gapUrl, (d) => setGapData(d as ResearchGapData));
    loadJson(causalUrl, (d) => setCausalData(d as CausalInferenceData));
    loadJson(biasUrl, (d) => setBiasData(d as SampleBiasData));
    return () => controller.abort();
  }, [theoryUrl, actionableUrl, gapUrl, causalUrl, biasUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
        <span className="text-gray-500 dark:text-gray-400">加载分析结果...</span>
      </div>
    );
  }

  if (error && !data && !deepReport) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <p className="text-red-700 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!data && !deepReport) {
    return (
      <div className="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-xl border border-yellow-200 dark:border-yellow-800">
        <AlertCircle className="w-5 h-5 text-yellow-500" />
        <p className="text-yellow-700 dark:text-yellow-400">未找到分析结果数据</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Mode 3: 研究报告布局 */}
      {analysisMode === "deep_research" && data ? (
        <ResearchReport
          data={data}
          deepReport={deepReport}
          inlineTextContents={inlineTextContents}
          comprehensiveContent={llmContents[llmReports.findIndex(r => r.file.toLowerCase().includes("comprehensive"))] || ""}
          likertLlmData={likertJson as unknown as import("@/components/analysis/LikertLlmPanel").LikertLlmData | null}
          theoryData={theoryData}
          actionableData={actionableData}
          gapData={gapData}
          causalData={causalData}
          biasData={biasData}
          historyId={id || undefined}
        />
      ) : data ? (
        <>
          <StandardReport
            mode={analysisMode === "ai_insights" ? "mode2" : "mode1"}
            data={data}
            likertLlmData={likertJson as unknown as import("@/components/analysis/LikertLlmPanel").LikertLlmData | null}
            inlineTextContents={inlineTextContents}
            comprehensiveContent={llmContents[llmReports.findIndex(r => r.file.toLowerCase().includes("comprehensive"))] || ""}
            theoryData={theoryData}
            actionableData={actionableData}
            gapData={gapData}
            causalData={causalData}
            biasData={biasData}
          />
        </>
      ) : (
        <div className="flex items-center justify-center py-20">
          <span className="text-gray-500 dark:text-gray-400">未找到分析数据</span>
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
          <span className="text-gray-500 dark:text-gray-400">加载中...</span>
        </div>
      }>
        <UploadedResultContent />
      </Suspense>
    </div>
  );
}
