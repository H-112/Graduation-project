"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadAnalysisData, getDatasetMeta, type DatasetMeta } from "@/lib/data";
import type { QuickOverviewResult } from "@/lib/types";
import { SummaryCards } from "@/components/analysis/SummaryCards";
import { DemographicsPanel } from "@/components/analysis/DemographicsPanel";
import { UsagePanel } from "@/components/analysis/UsagePanel";
import { LikertPanel } from "@/components/analysis/LikertPanel";
import { KeywordsPanel } from "@/components/analysis/KeywordsPanel";
import { LlmInsightsPanel, LLM_REPORTS } from "@/components/analysis/LlmInsightsPanel";
import { DataQualityPanel } from "@/components/analysis/DataQualityPanel";
import { StructureMetaPanel } from "@/components/analysis/StructureMetaPanel";
import { TableOfContents } from "@/components/analysis/TableOfContents";
import { Loader2, Printer } from "lucide-react";
import { TheoryMappingPanel, type TheoryMappingData } from "@/components/analysis/TheoryMappingPanel";
import { ActionableInsightPanel, type ActionableInsightData } from "@/components/analysis/ActionableInsightPanel";
import { ResearchGapPanel, type ResearchGapData } from "@/components/analysis/ResearchGapPanel";
import { CausalInferencePanel, type CausalInferenceData } from "@/components/analysis/CausalInferencePanel";
import { SampleBiasPanel, type SampleBiasData } from "@/components/analysis/SampleBiasPanel";

export default function DatasetDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<QuickOverviewResult | null>(null);
  const [meta, setMeta] = useState<DatasetMeta | undefined>();
  const [loading, setLoading] = useState(true);

  // Mode 3 extension data
  const [theoryData, setTheoryData] = useState<TheoryMappingData | null>(null);
  const [actionableData, setActionableData] = useState<ActionableInsightData | null>(null);
  const [gapData, setGapData] = useState<ResearchGapData | null>(null);
  const [causalData, setCausalData] = useState<CausalInferenceData | null>(null);
  const [biasData, setBiasData] = useState<SampleBiasData | null>(null);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    Promise.all([
      loadAnalysisData(id),
      Promise.resolve(getDatasetMeta(id)),
    ]).then(([d, m]) => {
      setData(d);
      setMeta(m);
      setLoading(false);
    }).catch(err => {
      if ((err as Error).name === "AbortError") return;
      console.error(err);
      setLoading(false);
    });
    return () => controller.abort();
  }, [id]);

  // Load Mode 3 extension data from history record
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/history/${id}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((record) => {
        if (!record) return;
        const loadJson = (url: string, setter: (d: unknown) => void) => {
          if (!url) return;
          fetch(url, { signal: controller.signal })
            .then((r) => (r.ok ? r.json() : null))
            .then((json) => { if (json) setter(json); })
            .catch((e) => {
              if ((e as Error).name === "AbortError") return;
              console.error("Extension data fetch error:", e);
            });
        };
        loadJson(record.theoryMappingUrl, (d) => setTheoryData(d as TheoryMappingData));
        loadJson(record.actionableInsightsUrl, (d) => setActionableData(d as ActionableInsightData));
        loadJson(record.researchGapsUrl, (d) => setGapData(d as ResearchGapData));
        loadJson(record.causalHintsUrl, (d) => setCausalData(d as CausalInferenceData));
        loadJson(record.sampleBiasUrl, (d) => setBiasData(d as SampleBiasData));
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        console.error("History record fetch error:", e);
      });
    return () => controller.abort();
  }, [id]);

  const hasDemographics = data?.demographics && Object.keys(data.demographics).length > 0;
  const hasUsage = data?.genai_usage && Object.keys(data.genai_usage).length > 0;
  const hasLikert = data?.likert_scales && Object.keys(data.likert_scales).length > 0;
  const hasText = data?.text_analysis && Object.keys(data.text_analysis).length > 0;
  const hasLlm = !!LLM_REPORTS[id]?.length;
  const hasQuality = data?.quality_metrics && data.quality_metrics.per_question.length > 0;
  const hasStructureMeta = data?.structure_meta && data.structure_meta.length > 0;
  const hasTheory = !!theoryData;
  const hasActionable = !!actionableData;
  const hasGap = !!gapData;
  const hasCausal = !!causalData;
  const hasBias = !!biasData;

  const tocGroups = [
    {
      label: "分析",
      items: [
        { id: "overview", label: "数据概览", available: !!data },
        { id: "quality", label: "数据质量", available: !!hasQuality },
        { id: "demographics", label: "样本构成", available: !!hasDemographics },
        { id: "usage", label: "选择题统计", available: !!hasUsage },
        { id: "likert", label: "量表分析", available: !!hasLikert },
        { id: "text", label: "文本分析", available: !!hasText },
        { id: "llm", label: "AI 洞察", available: !!hasLlm },
        { id: "structure", label: "识别详情", available: !!hasStructureMeta },
      ],
    },
    {
      label: "深度研究",
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
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
          <div className="grid grid-cols-4 gap-4 mt-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data || !meta) {
    return (
      <div className="max-w-5xl mx-auto px-8 py-12">
        <p className="text-gray-500 dark:text-gray-400">数据未找到</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <div className="flex gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-12">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{meta.title}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span>样本: {meta.records} 份</span>
                <span>·</span>
                <span>字段: {meta.fields} 列</span>
                <span>·</span>
                <span>{meta.source}</span>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              导出 PDF
            </button>
          </div>

          {/* Overview */}
          <section id="overview">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              数据概览
            </h3>
            <SummaryCards data={data} />
          </section>

          {/* Data Quality */}
          {hasQuality && (
            <section id="quality">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                数据质量
              </h3>
              <DataQualityPanel metrics={data.quality_metrics} cleaning={data.cleaning} />
            </section>
          )}

          {/* Demographics */}
          {hasDemographics && (
            <section id="demographics">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                样本构成（人口学分析）
              </h3>
              <DemographicsPanel demographics={data.demographics || {}} />
            </section>
          )}

          {/* Usage */}
          {hasUsage && (
            <section id="usage">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                选择题统计
              </h3>
              <UsagePanel usage={data.genai_usage || {}} />
            </section>
          )}

          {/* Likert */}
          {hasLikert && (
            <section id="likert">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                Likert 量表分析
              </h3>
              <LikertPanel likert={data.likert_scales || {}} />
            </section>
          )}

          {/* Text */}
          {hasText && (
            <section id="text">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                开放题文本分析
              </h3>
              <KeywordsPanel textAnalysis={data.text_analysis || {}} />
            </section>
          )}

          {/* LLM Insights */}
          {hasLlm && (
            <section id="llm">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                AI 深度洞察
              </h3>
              <LlmInsightsPanel datasetId={id} />
            </section>
          )}

          {/* Structure Meta */}
          {hasStructureMeta && (
            <section id="structure">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                题型识别详情
              </h3>
              <StructureMetaPanel meta={data.structure_meta} />
            </section>
          )}

          {/* Actionable Insights */}
          {hasActionable && (
            <section id="actionable">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                可操作建议
              </h3>
              <ActionableInsightPanel data={actionableData} />
            </section>
          )}

          {/* Causal Inference */}
          {hasCausal && (
            <section id="causal">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                因果推断提示
              </h3>
              <CausalInferencePanel data={causalData} />
            </section>
          )}

          {/* Research Gap */}
          {hasGap && (
            <section id="gap">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                研究缺口
              </h3>
              <ResearchGapPanel data={gapData} />
            </section>
          )}

          {/* Sample Bias */}
          {hasBias && (
            <section id="bias">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                样本偏差诊断
              </h3>
              <SampleBiasPanel data={biasData} />
            </section>
          )}

          {/* Theory Mapping */}
          {hasTheory && (
            <section id="theory">
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
                理论映射
              </h3>
              <TheoryMappingPanel data={theoryData} />
            </section>
          )}
        </div>

        {/* Table of Contents */}
        <TableOfContents groups={tocGroups} />
      </div>
    </div>
  );
}
