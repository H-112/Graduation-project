"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";

// Map of dataset ID to LLM report filename
export const LLM_REPORTS: Record<string, { label: string; file: string }[]> = {
  "5": [
    { label: "综合洞察报告", file: "d5_comprehensive_report.md" },
    { label: "GenAI任务示例分析", file: "d5_llm_25、请举例说明GenAI是如何帮助您完成某项具体任务的？效果如何？.md" },
    { label: "解决方法分析", file: "d5_llm_26、在遇到学习或生活难题时，您通常会采取哪些解决方法？.md" },
    { label: "场景与局限分析", file: "d5_llm_27、基于您的经历，您认为GenAI在哪些具体场景下最有帮助？哪些场景下可能存在局限？.md" },
  ],
  "4": [
    { label: "综合洞察报告", file: "d4_comprehensive_report.md" },
    { label: "GenAI影响观点分析", file: "d4_llm_1.您认为生成式人工智能对大学生学习方式有哪些影响？.md" },
    { label: "改革建议分析", file: "d4_llm_2.对于使用生成式人工智能改革学习方式，您有什么建议？.md" },
  ],
};

export function LlmInsightsPanel({ datasetId }: { datasetId: string }) {
  const reports = LLM_REPORTS[datasetId] || [];
  const [activeReport, setActiveReport] = useState<string>(reports[0]?.file || "");
  const [content] = useState("");

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <Sparkles className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">该数据集暂无 LLM 分析报告</p>
      </div>
    );
  }

  const currentLabel = reports.find(r => r.file === activeReport)?.label || "";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          AI 深度洞察 (DeepSeek)
        </h3>
      </div>

      {/* Report selector */}
      <div className="flex gap-2 flex-wrap">
        {reports.map(({ label, file }) => (
          <button
            key={file}
            onClick={() => setActiveReport(file)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
              activeReport === file
                ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Report content */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">{currentLabel}</h4>
        <MarkdownRenderer content={content} />
      </div>
    </div>
  );
}
