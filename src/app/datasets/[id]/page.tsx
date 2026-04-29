"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { loadAnalysisData, getDatasetMeta, type DatasetMeta } from "@/lib/data";
import type { QuickOverviewResult } from "@/lib/types";
import { StandardReport } from "@/components/analysis/StandardReport";
import { Loader2 } from "lucide-react";
import { type TheoryMappingData } from "@/components/analysis/TheoryMappingPanel";
import { type ActionableInsightData } from "@/components/analysis/ActionableInsightPanel";
import { type ResearchGapData } from "@/components/analysis/ResearchGapPanel";
import { type CausalInferenceData } from "@/components/analysis/CausalInferencePanel";
import { type SampleBiasData } from "@/components/analysis/SampleBiasPanel";
import { LLM_REPORTS } from "@/components/analysis/LlmInsightsPanel";

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

  // 内联 LLM 文本洞察
  const [inlineTextContents, setInlineTextContents] = useState<{ label: string; content: string }[]>([]);
  const [inlineTextLoading, setInlineTextLoading] = useState(false);
  const [comprehensiveContent, setComprehensiveContent] = useState("");
  const [comprehensiveLoading, setComprehensiveLoading] = useState(false);

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

  // 加载内联 LLM 文本洞察（逐题报告，不含综合报告）
  useEffect(() => {
    if (inlineTextLlmReports.length === 0) return;
    setInlineTextLoading(true);
    const controller = new AbortController();
    const fetchers = inlineTextLlmReports.map((r) =>
      fetch(`/llm-reports/${encodeURIComponent(r.file)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.text() : `*加载失败*`))
        .then((content) => ({ label: r.label, content }))
        .catch(() => ({ label: r.label, content: "*加载失败*" }))
    );
    Promise.all(fetchers)
      .then((results) => setInlineTextContents(results))
      .finally(() => setInlineTextLoading(false));
    return () => controller.abort();
  }, [id]);

  // 加载综合 LLM 报告
  useEffect(() => {
    if (!comprehensiveLlmReport) return;
    setComprehensiveLoading(true);
    const controller = new AbortController();
    fetch(`/llm-reports/${encodeURIComponent(comprehensiveLlmReport.file)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : ""))
      .then(setComprehensiveContent)
      .finally(() => setComprehensiveLoading(false));
    return () => controller.abort();
  }, [id]);

  const llmAllReports = LLM_REPORTS[id] || [];
  const inlineTextLlmReports = llmAllReports.filter((r) => !r.file.toLowerCase().includes("comprehensive"));
  const comprehensiveLlmReport = llmAllReports.find((r) => r.file.toLowerCase().includes("comprehensive"));
  const hasComprehensiveLlm = !!comprehensiveLlmReport;
  const hasInlineTextLlm = inlineTextLlmReports.length > 0;
  // 如果数据集有 LLM 报告，则以 mode2 渲染，否则 mode1
  const reportMode = hasComprehensiveLlm || hasInlineTextLlm ? "mode2" : "mode1";

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
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
      <StandardReport
        mode={reportMode}
        data={data}
        inlineTextContents={inlineTextContents}
        comprehensiveContent={comprehensiveContent}
        theoryData={theoryData}
        actionableData={actionableData}
        gapData={gapData}
        causalData={causalData}
        biasData={biasData}
      />
    </div>
  );
}
