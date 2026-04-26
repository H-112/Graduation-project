"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { QuickOverviewResult } from "@/lib/types";
import { SummaryCards } from "@/components/analysis/SummaryCards";
import { DemographicsPanel } from "@/components/analysis/DemographicsPanel";
import { UsagePanel } from "@/components/analysis/UsagePanel";
import { LikertPanel } from "@/components/analysis/LikertPanel";
import { KeywordsPanel } from "@/components/analysis/KeywordsPanel";
import { LikertLlmPanel } from "@/components/analysis/LikertLlmPanel";
import { CrossAnalysisPanel } from "@/components/analysis/CrossAnalysisPanel";
import { DataQualityPanel } from "@/components/analysis/DataQualityPanel";
import { StructureMetaPanel } from "@/components/analysis/StructureMetaPanel";
import { TableOfContents, type TocGroup } from "@/components/analysis/TableOfContents";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { TheoryMappingPanel, type TheoryMappingData } from "@/components/analysis/TheoryMappingPanel";
import { ActionableInsightPanel, type ActionableInsightData } from "@/components/analysis/ActionableInsightPanel";
import { ResearchGapPanel, type ResearchGapData } from "@/components/analysis/ResearchGapPanel";
import { CausalInferencePanel, type CausalInferenceData } from "@/components/analysis/CausalInferencePanel";
import { SampleBiasPanel, type SampleBiasData } from "@/components/analysis/SampleBiasPanel";
import { Loader2, AlertCircle, Printer } from "lucide-react";

interface HistoryRecord {
  id: string;
  resultUrl?: string;
  deepReportUrl?: string;
  llmReports?: string[];
  likertReports?: string[];
  theoryMappingUrl?: string;
  actionableInsightsUrl?: string;
  researchGapsUrl?: string;
  causalHintsUrl?: string;
  sampleBiasUrl?: string;
  datasetName?: string;
}

function ChapterSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gradient-to-r from-gray-200 dark:from-gray-700 to-transparent" />
        <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">
          {title}
        </h3>
        <div className="h-px flex-1 bg-gradient-to-l from-gray-200 dark:from-gray-700 to-transparent" />
      </div>
      <div className="space-y-10">{children}</div>
    </section>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
      {children}
    </h4>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // LLM report contents
  const [llmContents, setLlmContents] = useState<string[]>([]);
  const [llmLoading, setLlmLoading] = useState(false);

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

  const likertReports = likertReportsParam
    ? likertReportsParam.split(",").map((f) => ({ label: getLlmReportLabel(f), file: f }))
    : [];

  const hasJsonData = !!data;
  const hasDeepReport = !!deepReportUrl || !!deepReport;
  const hasLlmReports = llmReports.length > 0;
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
      setError("未提供分析结果URL");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const promises: Promise<void>[] = [];

    if (resultUrl && !resultUrl.endsWith(".md")) {
      promises.push(
        fetch(resultUrl, { signal: controller.signal })
          .then(r => {
            if (!r.ok) throw new Error("加载失败");
            return r.json();
          })
          .then(setData)
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
  }, [likertReportsParam]);

  // Load LLM report contents for inline display
  useEffect(() => {
    if (llmReports.length === 0) return;
    setLlmLoading(true);
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
      .then((contents) => setLlmContents(contents.filter(Boolean)))
      .finally(() => setLlmLoading(false));
    return () => controller.abort();
  }, [reportsParam]);

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

  const tocGroups: TocGroup[] = [
    {
      label: "数据基础",
      items: [
        { id: "overview", label: "数据概览", available: !!hasJsonData },
        { id: "quality", label: "数据质量", available: !!hasQuality },
        { id: "structure", label: "识别详情", available: !!hasStructureMeta },
      ],
    },
    {
      label: "描述统计",
      items: [
        { id: "demographics", label: "样本构成", available: !!hasDemographics },
        { id: "usage", label: "选择题统计", available: !!hasUsage },
        { id: "likert", label: "量表分析", available: !!hasLikert },
        { id: "text", label: "文本分析", available: !!hasText },
        { id: "cross", label: "交叉分析", available: !!hasCrossAnalysis },
      ],
    },
    {
      label: "AI 洞察",
      items: [
        { id: "likertLlm", label: "量表洞察", available: !!hasLikertLlm },
        { id: "llm", label: "LLM 深度洞察", available: !!hasLlmReports },
      ],
    },
    {
      label: "深度研究",
      items: [
        { id: "deep", label: "深度研究报告", available: !!hasDeepReport },
      ],
    },
    {
      label: "扩展洞察",
      items: [
        { id: "actionable", label: "可操作建议", available: !!hasActionable },
        { id: "causal", label: "因果推断", available: !!hasCausal },
        { id: "gap", label: "研究缺口", available: !!hasGap },
        { id: "bias", label: "样本偏差", available: !!hasBias },
        { id: "theory", label: "理论映射", available: !!hasTheory },
      ],
    },
  ];

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
    <div className="flex gap-8">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-14">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{data?.dataset || "分析结果"}</h2>
            {data && (
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span>样本: {data.total_records} 份</span>
                <span>·</span>
                <span>字段: {data.total_fields} 列</span>
              </div>
            )}
          </div>
          <button
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            导出 PDF
          </button>
        </div>

        {/* Chapter 1: 数据基础 */}
        {(hasJsonData || hasQuality || hasStructureMeta) && (
          <ChapterSection id="data-foundation" title="数据基础">
            {data && (
              <div id="overview">
                <PanelHeading>数据概览</PanelHeading>
                <SummaryCards data={data} />
              </div>
            )}
            {hasQuality && data && (
              <div id="quality">
                <PanelHeading>数据质量</PanelHeading>
                <DataQualityPanel metrics={data.quality_metrics} cleaning={data.cleaning} />
              </div>
            )}
            {hasStructureMeta && (
              <div id="structure">
                <PanelHeading>题型识别详情</PanelHeading>
                <StructureMetaPanel meta={data.structure_meta} />
              </div>
            )}
          </ChapterSection>
        )}

        {/* Chapter 2: 描述统计 */}
        {(hasDemographics || hasUsage || hasLikert || hasText || hasCrossAnalysis) && (
          <ChapterSection id="descriptive-stats" title="描述统计">
            {hasDemographics && data && (
              <div id="demographics">
                <PanelHeading>样本构成（人口学分析）</PanelHeading>
                <DemographicsPanel demographics={data.demographics} />
              </div>
            )}
            {hasUsage && data && (
              <div id="usage">
                <PanelHeading>选择题统计</PanelHeading>
                <UsagePanel usage={data.genai_usage!} />
              </div>
            )}
            {hasLikert && data && (
              <div id="likert">
                <PanelHeading>量表分析</PanelHeading>
                <LikertPanel likert={data.likert_scales || {}} />
              </div>
            )}
            {hasText && data && (
              <div id="text">
                <PanelHeading>开放题文本分析</PanelHeading>
                <KeywordsPanel textAnalysis={data.text_analysis || {}} />
              </div>
            )}
            {hasCrossAnalysis && data && (
              <div id="cross">
                <PanelHeading>交叉分析</PanelHeading>
                <CrossAnalysisPanel crossAnalysis={data.cross_analysis || []} />
              </div>
            )}
          </ChapterSection>
        )}

        {/* Chapter 3: AI 洞察 */}
        {(hasLikertLlm || hasLlmReports) && (
          <ChapterSection id="ai-insights" title="AI 洞察">
            {hasLikertLlm && (
              <div id="likertLlm">
                <PanelHeading>量表洞察</PanelHeading>
                <LikertLlmPanel data={likertJson as unknown as import("@/components/analysis/LikertLlmPanel").LikertLlmData | null} />
              </div>
            )}
            {hasLlmReports && (
              <div id="llm">
                <PanelHeading>LLM 深度洞察</PanelHeading>
                {llmLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500 mr-2" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">加载 LLM 报告...</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {llmReports.map((report, idx) => {
                      const content = llmContents[idx] || "";
                      return (
                        <div
                          key={report.file}
                          className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 prose prose-sm max-w-none"
                        >
                          <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                            {report.label}
                          </h5>
                          <MarkdownRenderer content={content} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </ChapterSection>
        )}

        {/* Chapter 4: 深度研究 */}
        {hasDeepReport && (
          <ChapterSection id="deep-research" title="深度研究">
            <div id="deep">
              <PanelHeading>深度研究报告</PanelHeading>
              <DeepResearchPanel content={deepReport} />
            </div>
          </ChapterSection>
        )}

        {/* Chapter 5: 扩展洞察 */}
        {(hasActionable || hasCausal || hasGap || hasBias || hasTheory) && (
          <ChapterSection id="extended-insights" title="扩展洞察">
            {hasActionable && (
              <div id="actionable">
                <PanelHeading>可操作建议</PanelHeading>
                <ActionableInsightPanel data={actionableData} />
              </div>
            )}
            {hasCausal && (
              <div id="causal">
                <PanelHeading>因果推断提示</PanelHeading>
                <CausalInferencePanel data={causalData} />
              </div>
            )}
            {hasGap && (
              <div id="gap">
                <PanelHeading>研究缺口</PanelHeading>
                <ResearchGapPanel data={gapData} />
              </div>
            )}
            {hasBias && (
              <div id="bias">
                <PanelHeading>样本偏差诊断</PanelHeading>
                <SampleBiasPanel data={biasData} />
              </div>
            )}
            {hasTheory && (
              <div id="theory">
                <PanelHeading>理论映射</PanelHeading>
                <TheoryMappingPanel data={theoryData} />
              </div>
            )}
          </ChapterSection>
        )}
      </div>

      {/* Table of Contents */}
      <TableOfContents groups={tocGroups} />
    </div>
  );
}

function DeepResearchPanel({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-amber-500 mr-2" />
        <span className="text-sm text-gray-500 dark:text-gray-400">加载深度研究报告...</span>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
      <MarkdownRenderer content={content} />
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
