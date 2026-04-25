"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { QuickOverviewResult } from "@/lib/types";
import { SummaryCards } from "./SummaryCards";
import { DemographicsPanel } from "./DemographicsPanel";
import { UsagePanel } from "./UsagePanel";
import { LikertPanel } from "./LikertPanel";
import { KeywordsPanel } from "./KeywordsPanel";
import { generateMarkdownReport, downloadMarkdown } from "@/lib/report-md";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

interface LlmReportInfo {
  label: string;
  file: string;
}

export function CompleteReportPanel({
  data,
  llmReports = [],
}: {
  data: QuickOverviewResult;
  llmReports?: LlmReportInfo[];
}) {
  const [llmContents, setLlmContents] = useState<string[]>([]);
  const [llmLoading, setLlmLoading] = useState(false);

  // 并行加载所有 LLM 报告内容
  useEffect(() => {
    if (llmReports.length === 0) return;
    setLlmLoading(true);

    const fetchers = llmReports.map((r) =>
      fetch(`/llm-reports/${encodeURIComponent(r.file)}`)
        .then((res) => (res.ok ? res.text() : `*${r.label}: 加载失败*`))
        .catch(() => `*${r.label}: 加载失败*`)
    );

    Promise.all(fetchers)
      .then(setLlmContents)
      .finally(() => setLlmLoading(false));
  }, [llmReports]);

  const handleExport = () => {
    const md = generateMarkdownReport(data, llmContents);
    const safeName = (data.dataset || "分析报告").replace(/[\\/:*?"<>|]/g, "_");
    downloadMarkdown(md, `${safeName}_完整报告.md`);
  };

  const hasDemographics =
    data.demographics && Object.keys(data.demographics).length > 0;
  const hasUsage = data.genai_usage && Object.keys(data.genai_usage).length > 0;
  const hasLikert =
    data.likert_scales && Object.keys(data.likert_scales).length > 0;
  const hasText =
    data.text_analysis && Object.keys(data.text_analysis).length > 0;

  return (
    <div className="space-y-8">
      {/* ── 导出按钮 ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">完整分析报告</h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Download className="w-4 h-4" />
          导出 Markdown
        </button>
      </div>

      {/* ── 一、数据概览 ── */}
      <section>
        <h3 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b border-gray-100">
          一、数据概览
        </h3>
        <SummaryCards data={data} />
      </section>

      {/* ── 二、样本构成 ── */}
      {hasDemographics && (
        <section>
          <h3 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b border-gray-100">
            二、样本构成（人口学分析）
          </h3>
          <DemographicsPanel demographics={data.demographics} />
        </section>
      )}

      {/* ── 三、选择题分布 ── */}
      {hasUsage && (
        <section>
          <h3 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b border-gray-100">
            三、选择题分布
          </h3>
          <UsagePanel usage={data.genai_usage!} />
        </section>
      )}

      {/* ── 四、量表分析 ── */}
      {hasLikert && (
        <section>
          <h3 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b border-gray-100">
            四、量表分析
          </h3>
          <LikertPanel likert={data.likert_scales} />
        </section>
      )}

      {/* ── 五、文本关键词 ── */}
      {hasText && (
        <section>
          <h3 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b border-gray-100">
            五、开放题文本分析
          </h3>
          <KeywordsPanel textAnalysis={data.text_analysis} />
        </section>
      )}

      {/* ── 六、AI 深度洞察 ── */}
      {llmReports.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-gray-800 mb-3 pb-2 border-b border-gray-100">
            六、AI 深度洞察 (LLM)
          </h3>
          {llmLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-purple-500 mr-2" />
              <span className="text-sm text-gray-500">加载 LLM 报告...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {llmReports.map((report, idx) => {
                const content = llmContents[idx] || "";
                return (
                  <div
                    key={report.file}
                    className="bg-gray-50 rounded-xl p-6 prose prose-sm max-w-none"
                  >
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">
                      {report.label}
                    </h4>
                    <MarkdownRenderer content={content} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ── 页脚 ── */}
      <div className="text-center text-xs text-gray-400 py-4 border-t border-gray-100">
        报告由智能体辅助问卷分析系统自动生成 · 数据截止{" "}
        {new Date().toLocaleDateString("zh-CN")}
      </div>
    </div>
  );
}
