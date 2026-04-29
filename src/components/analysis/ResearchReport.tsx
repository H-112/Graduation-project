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
  Printer, Search, ShieldAlert, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { EvidenceBlock } from "./shared/EvidenceBlock";

interface ResearchReportProps {
  data: QuickOverviewResult;
  deepReport: string;
  inlineTextContents?: { label: string; content: string }[];
  comprehensiveContent?: string;
  likertLlmData?: LikertLlmData | null;
  theoryData?: TheoryMappingData | null;
  actionableData?: ActionableInsightData | null;
  gapData?: ResearchGapData | null;
  causalData?: CausalInferenceData | null;
  biasData?: SampleBiasData | null;
  historyId?: string;
}

type SectionKey = "一" | "二" | "三" | "四" | "五" | "六";

interface ParsedSections {
  title: string;
  sections: Partial<Record<SectionKey, string>>;
}

function parseDeepReportSections(markdown: string): ParsedSections {
  const result: Partial<Record<SectionKey, string>> = {};
  let title = "";

  // 提取标题（第一个 # 行）
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  if (titleMatch) title = titleMatch[1];

  // 按 ## 分割段落
  const sectionPattern = /^##\s+([一二三四五六七八九十])[、，]\s*(.+)$/gm;
  const splits: Array<{ key: SectionKey; label: string; start: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = sectionPattern.exec(markdown)) !== null) {
    splits.push({ key: match[1] as SectionKey, label: match[0], start: match.index });
  }

  for (let i = 0; i < splits.length; i++) {
    const current = splits[i];
    const nextStart = i + 1 < splits.length ? splits[i + 1].start : markdown.length;
    let content = markdown.slice(current.start + current.label.length, nextStart).trim();
    // 去掉开头的可能多余空行
    content = content.replace(/^\n+/, "");
    result[current.key] = content;
  }

  return { title, sections: result };
}

// TOC 分组
function buildTocGroups(props: ResearchReportProps): TocGroup[] {
  const hasDemographics = !!(props.data.demographics && Object.keys(props.data.demographics).length > 0);
  const hasUsage = !!(props.data.genai_usage && Object.keys(props.data.genai_usage).length > 0);
  const hasLikert = !!(props.data.likert_scales && Object.keys(props.data.likert_scales).length > 0);
  const hasText = !!(props.data.text_analysis && Object.keys(props.data.text_analysis).length > 0);
  const hasCross = !!(props.data.cross_analysis && props.data.cross_analysis.length > 0);
  const hasFindings = hasDemographics || hasUsage || hasLikert || hasText || hasCross;
  const hasDeep = !!props.deepReport;
  const hasTheory = !!props.theoryData;
  const hasCausal = !!props.causalData;
  const hasGap = !!props.gapData;
  const hasBias = !!props.biasData;
  const hasActionable = !!props.actionableData;
  const hasQuality = !!(props.data.quality_metrics && props.data.quality_metrics.per_question.length > 0);
  const hasStructure = !!(props.data.structure_meta && props.data.structure_meta.length > 0);

  return [
    {
      label: "报告",
      items: [
        { id: "summary", label: "研究概要", available: true },
        { id: "findings", label: "核心发现", available: hasFindings || hasDeep },
        { id: "insights", label: "深层洞察", available: hasDeep || hasTheory || hasCausal },
        { id: "reflections", label: "反思与局限", available: hasDeep || hasBias || hasGap },
        { id: "recommendations", label: "建议与行动", available: hasDeep || hasActionable },
      ],
    },
    {
      label: "附录",
      items: [
        { id: "appendix-quality", label: "数据质量", available: hasQuality },
        { id: "appendix-structure", label: "识别详情", available: hasStructure },
      ],
    },
  ];
}

export function ResearchReport(props: ResearchReportProps) {
  const { data, deepReport } = props;
  const parsed = useMemo(() => parseDeepReportSections(deepReport), [deepReport]);
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

  const hasFindingsSec = parsed.sections["二"];
  const hasInsightsSec = parsed.sections["三"] || !!props.theoryData || !!props.causalData;
  const hasReflectionSec = parsed.sections["六"] || !!props.biasData || !!props.gapData;
  const hasRecommendSec = parsed.sections["五"] || !!props.actionableData;

  const sectionOne = parsed.sections["一"];
  const sectionTwo = parsed.sections["二"];
  const sectionThree = parsed.sections["三"];
  const sectionFour = parsed.sections["四"];
  const sectionFive = parsed.sections["五"];
  const sectionSix = parsed.sections["六"];

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-12">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {parsed.title || data.dataset || "深度研究报告"}
            </h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
            <span>样本: {data.total_records} 份</span>
            <span>·</span>
            <span>字段: {data.total_fields} 列</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
              <BookOpen className="w-3 h-3" />
              深度研究模式
            </span>
          </div>
          {props.historyId && (
            <div className="mt-2">
              <Link
                href={`/datasets/${props.historyId}/deep-research`}
                className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 underline"
              >
                <ExternalLink className="w-3 h-3" />
                查看完整深度研究报告
              </Link>
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

        {/* Quick overview cards */}
        <SummaryCards data={data} />

        {/* ── §1 研究概要 ── */}
        <section id="summary">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
            一、研究概要
          </h3>
          {sectionOne ? (
            <div className="prose prose-sm max-w-none text-gray-600 dark:text-gray-300">
              <MarkdownRenderer content={sectionOne ?? ""} />
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">暂无概要数据</p>
          )}

          {/* 样本特征分布 — 紧接研究概要 */}
          {hasDemographics && (
            <div className="mt-6">
              <EvidenceBlock
                icon={BarChart3}
                title="样本特征分布"
                summary={`${Object.keys(data.demographics || {}).length} 个人口学维度`}
              >
                <DemographicsPanel demographics={data.demographics || {}} />
                {hasUsage && (
                  <div className="mt-6">
                    <UsagePanel usage={data.genai_usage!} />
                  </div>
                )}
              </EvidenceBlock>
            </div>
          )}
        </section>

        {/* ── §2 核心发现 ── */}
        {hasFindingsSec && (
          <section id="findings">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              二、核心发现
            </h3>

            {/* 叙事引言 */}
            <div className="prose prose-sm max-w-none text-gray-600 dark:text-gray-300 mb-6">
              <MarkdownRenderer content={sectionTwo ?? ""} />
            </div>

            {/* 证据卡片 */}
            <div className="space-y-3">
              {(hasLikert || hasLikertLlm) && (
                <EvidenceBlock
                  icon={BarChart3}
                  title="量表测量模式与态度评估"
                  summary={`${Object.keys(data.likert_scales || {}).length} 组量表${hasLikertLlm ? "，含 LLM 深度解读" : ""}`}
                >
                  {hasLikert && <LikertPanel likert={data.likert_scales || {}} />}
                  {hasLikertLlm && (
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
                  {hasInlineText && (props.inlineTextContents ?? []).map((item, idx) => (
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

        {/* ── §3 深层洞察 ── */}
        {hasInsightsSec && (
          <section id="insights">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              三、深层洞察
            </h3>

            {/* 叙事：§三 深层洞察 + §四 矛盾与张力 */}
            {sectionThree && (
              <div className="prose prose-sm max-w-none text-gray-600 dark:text-gray-300 mb-6">
                <MarkdownRenderer content={sectionThree ?? ""} />
              </div>
            )}

            {sectionFour && (
              <div className="prose prose-sm max-w-none text-gray-600 dark:text-gray-300 mb-6">
                <MarkdownRenderer content={sectionFour ?? ""} />
              </div>
            )}

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
            </div>
          </section>
        )}

        {/* ── §4 反思与局限 ── */}
        {hasReflectionSec && (
          <section id="reflections">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              四、反思与局限
            </h3>

            {sectionSix && (
              <div className="prose prose-sm max-w-none text-gray-600 dark:text-gray-300 mb-6">
                <MarkdownRenderer content={sectionSix ?? ""} />
              </div>
            )}

            <div className="space-y-3">
              {props.biasData && (
                <EvidenceBlock
                  icon={ShieldAlert}
                  title={`样本偏差诊断 — 风险等级: ${props.biasData.overall_risk === "high" ? "高" : props.biasData.overall_risk === "medium" ? "中" : "低"}`}
                  summary={props.biasData.overall_reasoning?.slice(0, 100)}
                >
                  <SampleBiasPanel data={props.biasData} />
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
            </div>
          </section>
        )}

        {/* ── §5 建议与行动 ── */}
        {hasRecommendSec && (
          <section id="recommendations">
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 pb-2 border-b border-gray-100 dark:border-gray-700">
              五、建议与行动
            </h3>

            {sectionFive && (
              <div className="prose prose-sm max-w-none text-gray-600 dark:text-gray-300 mb-6">
                <MarkdownRenderer content={sectionFive ?? ""} />
              </div>
            )}

            <div className="space-y-3">
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
