"use client";

import { useMemo } from "react";
import type { QuickOverviewResult } from "@/lib/types";
import { SummaryCards } from "./SummaryCards";
import { DemographicsPanel } from "./DemographicsPanel";
import { UsagePanel } from "./UsagePanel";
import { LikertPanel } from "./LikertPanel";
import { LikertLlmPanel, type LikertLlmData } from "./LikertLlmPanel";
import { KeywordsPanel } from "./KeywordsPanel";
import { CrossAnalysisPanel } from "./CrossAnalysisPanel";
import { DataQualityPanel } from "./DataQualityPanel";
import { StructureMetaPanel } from "./StructureMetaPanel";
import { TheoryMappingPanel, type TheoryMappingData } from "./TheoryMappingPanel";
import { ActionableInsightPanel, type ActionableInsightData } from "./ActionableInsightPanel";
import { CausalInferencePanel, type CausalInferenceData } from "./CausalInferencePanel";
import { ResearchGapPanel, type ResearchGapData } from "./ResearchGapPanel";
import { SampleBiasPanel, type SampleBiasData } from "./SampleBiasPanel";
import { TableOfContents, type TocGroup } from "./TableOfContents";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import {
  BookOpen, BarChart3, MessageSquare, Network, Lightbulb,
  Printer, Search, ShieldAlert, Sparkles,
} from "lucide-react";
import { EvidenceBlock } from "./shared/EvidenceBlock";

export interface StandardReportProps {
  mode: "mode1" | "mode2";
  data: QuickOverviewResult;
  likertLlmData?: LikertLlmData | null;
  inlineTextContents?: { label: string; content: string }[];
  comprehensiveContent?: string;
  theoryData?: TheoryMappingData | null;
  actionableData?: ActionableInsightData | null;
  gapData?: ResearchGapData | null;
  causalData?: CausalInferenceData | null;
  biasData?: SampleBiasData | null;
}

function buildTocGroups(props: StandardReportProps): TocGroup[] {
  const { mode, data } = props;
  const hasDemographics = !!(data.demographics && Object.keys(data.demographics).length > 0);
  const hasUsage = !!(data.genai_usage && Object.keys(data.genai_usage).length > 0);
  const hasLikert = !!(data.likert_scales && Object.keys(data.likert_scales).length > 0);
  const hasLikertLlm = !!props.likertLlmData?.scale_groups?.length;
  const hasText = !!(data.text_analysis && Object.keys(data.text_analysis).length > 0);
  const hasInlineText = (props.inlineTextContents?.length ?? 0) > 0;
  const hasCross = !!(data.cross_analysis && data.cross_analysis.length > 0);
  const hasQuality = !!(data.quality_metrics && data.quality_metrics.per_question.length > 0);
  const hasStructure = !!(data.structure_meta && data.structure_meta.length > 0);
  const hasComprehensive = !!props.comprehensiveContent;
  const hasTheory = !!props.theoryData;
  const hasCausal = !!props.causalData;
  const hasGap = !!props.gapData;
  const hasBias = !!props.biasData;
  const hasActionable = !!props.actionableData;

  const groups: TocGroup[] = [
    {
      label: "报告",
      items: [
        { id: "summary", label: "研究概要", available: true },
        { id: "findings", label: "核心发现", available: hasDemographics || hasUsage || hasLikert || hasText || hasCross },
      ],
    },
  ];

  if (mode === "mode2") {
    groups[0].items.push(
      { id: "ai-insights", label: "AI 洞察", available: hasComprehensive || hasLikertLlm || hasInlineText },
      { id: "extended", label: "扩展洞察", available: hasActionable || hasCausal || hasGap || hasBias || hasTheory }
    );
  }

  groups.push({
    label: "附录",
    items: [
      { id: "appendix-quality", label: "数据质量", available: hasQuality },
      { id: "appendix-structure", label: "识别详情", available: hasStructure },
    ],
  });

  return groups;
}

export function StandardReport(props: StandardReportProps) {
  const { mode, data } = props;
  const tocGroups = useMemo(() => buildTocGroups(props), [props]);

  const hasDemographics = data.demographics && Object.keys(data.demographics).length > 0;
  const hasUsage = data.genai_usage && Object.keys(data.genai_usage).length > 0;
  const hasLikert = data.likert_scales && Object.keys(data.likert_scales).length > 0;
  const hasLikertLlm = !!props.likertLlmData?.scale_groups?.length;
  const hasText = data.text_analysis && Object.keys(data.text_analysis).length > 0;
  const hasInlineText = (props.inlineTextContents?.length ?? 0) > 0;
  const hasCross = data.cross_analysis && data.cross_analysis.length > 0;
  const hasQuality = !!(data.quality_metrics && data.quality_metrics.per_question.length > 0);
  const hasStructure = !!(data.structure_meta && data.structure_meta.length > 0);

  const isMode2 = mode === "mode2";
  const modeLabel = isMode2 ? "AI 洞察模式" : "快速概览模式";
  const modeColor = isMode2 ? "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30" : "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30";
  const ModeIcon = isMode2 ? Sparkles : BookOpen;

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-12">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {data.dataset || "分析报告"}
            </h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
              <span>样本: {data.total_records} 份</span>
              <span>·</span>
              <span>字段: {data.total_fields} 列</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${modeColor}`}>
                <ModeIcon className="w-3 h-3" />
                {modeLabel}
              </span>
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

        {/* Quick overview cards */}
        <SummaryCards data={data} />

        {/* ── §1 研究概要 ── */}
        <section id="summary">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
            一、研究概要
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            本报告基于 {data.total_records} 份有效问卷数据，从 {data.total_fields} 个字段中提取关键信息，涵盖人口学特征、态度量表、开放题文本及变量间关联等多个维度。
          </p>

          {/* 样本特征分布 */}
          {hasDemographics && (
            <div className="mt-6">
              <EvidenceBlock
                icon={BarChart3}
                title="样本特征分布"
                summary={`${Object.keys(data.demographics || {}).length} 个人口学维度`}
              >
                <DemographicsPanel demographics={data.demographics || {}} />
              </EvidenceBlock>
            </div>
          )}
        </section>

        {/* ── §2 核心发现 ── */}
        {(hasDemographics || hasUsage || hasLikert || hasText || hasCross) && (
          <section id="findings">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              二、核心发现
            </h3>

            <div className="space-y-3">
              <EvidenceBlock
                icon={BarChart3}
                title="选择题统计 (FORCE)"
                summary={`${Object.keys(data.genai_usage || {}).length} 道选择题`}
              >
                <UsagePanel usage={data.genai_usage!} />
              </EvidenceBlock>

              {(hasLikert || hasLikertLlm) && (
                <EvidenceBlock
                  icon={BarChart3}
                  title="量表测量模式与态度评估"
                  summary={`${Object.keys(data.likert_scales || {}).length} 组量表${hasLikertLlm ? "，含 LLM 深度解读" : ""}`}
                >
                  {hasLikert && <LikertPanel likert={data.likert_scales || {}} />}
                  {isMode2 && hasLikertLlm && (
                    <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                      <LikertLlmPanel data={props.likertLlmData!} />
                    </div>
                  )}
                </EvidenceBlock>
              )}

              {(hasText || hasInlineText) && (
                <EvidenceBlock
                  icon={MessageSquare}
                  title="开放题文本洞察"
                  summary={`${Object.keys(data.text_analysis || {}).length} 道开放题${hasInlineText ? "，含 LLM 逐题解读" : ""}`}
                >
                  {hasText && <KeywordsPanel textAnalysis={data.text_analysis || {}} />}
                  {isMode2 && hasInlineText && (props.inlineTextContents ?? []).map((item, idx) => (
                    <div
                      key={idx}
                      className="mt-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl p-4 border border-purple-100 dark:border-purple-900/50 prose prose-sm max-w-none"
                    >
                      <h6 className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-2">
                        {item.label}
                      </h6>
                      <MarkdownRenderer content={item.content} />
                    </div>
                  ))}
                </EvidenceBlock>
              )}

              {hasCross && (
                <EvidenceBlock
                  icon={Network}
                  title="变量间关联模式"
                  summary={`${data.cross_analysis?.length ?? 0} 组交叉分析${data.cross_analysis?.filter(x => x.is_significant).length ? `，其中 ${data.cross_analysis.filter(x => x.is_significant).length} 组显著` : ""}`}
                >
                  <CrossAnalysisPanel crossAnalysis={data.cross_analysis || []} />
                </EvidenceBlock>
              )}
            </div>
          </section>
        )}

        {/* ── §3 AI 洞察（Mode 2 独有）── */}
        {isMode2 && props.comprehensiveContent && (
          <section id="ai-insights">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              三、AI 洞察
            </h3>

            <div className="space-y-3">
              <EvidenceBlock
                icon={Lightbulb}
                title="综合洞察报告"
                summary="基于全量数据的 LLM 综合分析"
              >
                <div className="bg-purple-50/50 dark:bg-purple-950/20 rounded-xl p-6 border border-purple-100 dark:border-purple-900/50 prose prose-sm max-w-none">
                  <MarkdownRenderer content={props.comprehensiveContent} />
                </div>
              </EvidenceBlock>
            </div>
          </section>
        )}

        {/* ── §4 扩展洞察（Mode 2 独有）── */}
        {isMode2 && (props.theoryData || props.causalData || props.gapData || props.biasData || props.actionableData) && (
          <section id="extended">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              四、扩展洞察
            </h3>

            <div className="space-y-3">
              {props.theoryData && (
                <EvidenceBlock
                  icon={Lightbulb}
                  title="理论映射"
                  summary={`${props.theoryData.primary_domain ? `聚焦领域: ${props.theoryData.primary_domain} · ` : ""}${props.theoryData.mappings?.length ?? 0} 条理论对照`}
                >
                  <TheoryMappingPanel data={props.theoryData} />
                </EvidenceBlock>
              )}

              {props.causalData && (
                <EvidenceBlock
                  icon={Network}
                  title="因果推断假设"
                  summary={`${props.causalData.hints?.length ?? 0} 条因果线索`}
                >
                  <CausalInferencePanel data={props.causalData} />
                </EvidenceBlock>
              )}

              {props.gapData && (
                <EvidenceBlock
                  icon={Search}
                  title={`研究缺口分析 — ${props.gapData.gaps?.length ?? 0} 个缺口`}
                  summary={props.gapData.gaps?.[0]?.description?.slice(0, 100)}
                >
                  <ResearchGapPanel data={props.gapData} />
                </EvidenceBlock>
              )}

              {props.biasData && (
                <EvidenceBlock
                  icon={ShieldAlert}
                  title={`样本偏差诊断 — 风险等级: ${props.biasData.overall_risk === "high" ? "高" : props.biasData.overall_risk === "medium" ? "中" : "低"}`}
                  summary={props.biasData.overall_reasoning?.slice(0, 100)}
                >
                  <SampleBiasPanel data={props.biasData} />
                </EvidenceBlock>
              )}

              {props.actionableData && (
                <EvidenceBlock
                  icon={Lightbulb}
                  title={`可操作建议 — ${props.actionableData.total ?? 0} 条`}
                  summary={`高优先 ${props.actionableData.priority_summary?.high ?? 0} · 中优先 ${props.actionableData.priority_summary?.medium ?? 0} · 低优先 ${props.actionableData.priority_summary?.low ?? 0}`}
                >
                  <ActionableInsightPanel data={props.actionableData} />
                </EvidenceBlock>
              )}
            </div>
          </section>
        )}

        {/* ── 附录 ── */}
        {(hasQuality || hasStructure) && (
          <section id="appendix">
            <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              附录 — 技术细节
            </h3>

            <div className="space-y-3">
              {hasQuality && (
                <EvidenceBlock
                  icon={BarChart3}
                  title="数据质量报告"
                  summary={`${data.quality_metrics!.per_question.length} 题，平均缺失率 ${Math.round(data.quality_metrics!.overall_missing_avg * 100) / 100}%`}
                >
                  <DataQualityPanel metrics={data.quality_metrics!} cleaning={data.cleaning} />
                </EvidenceBlock>
              )}

              {hasStructure && (
                <EvidenceBlock
                  icon={BarChart3}
                  title="题型识别详情"
                  summary={`${data.structure_meta!.length} 列的自动识别结果`}
                >
                  <StructureMetaPanel meta={data.structure_meta!} />
                </EvidenceBlock>
              )}
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-4 border-t border-gray-100 dark:border-gray-700">
          报告由智能体辅助问卷分析系统自动生成 · 数据截止{" "}
          {new Date().toLocaleDateString("zh-CN")}
        </div>
      </div>

      {/* Sidebar TOC */}
      <TableOfContents groups={tocGroups} />
    </div>
  );
}
