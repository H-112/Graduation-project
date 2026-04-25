import Link from "next/link";
import { DATASETS } from "@/lib/data";
import { Sparkles, BarChart3, ArrowRight } from "lucide-react";

export default function AnalysisHistoryPage() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">分析历史</h2>
        <p className="text-sm text-gray-500 mt-1">已完成的分析任务与报告</p>
      </div>

      <div className="space-y-3">
        {DATASETS.map((ds) => (
          <div key={ds.id} className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">{ds.title}</h3>
            <p className="text-sm text-gray-500 mb-4">样本量: {ds.records} 份 · 已完成模式1+模式2分析</p>

            <div className="flex gap-3">
              <Link
                href={`/datasets/${ds.id}`}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <BarChart3 className="w-4 h-4" />
                查看统计分析
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Cross-dataset comparison */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-100 p-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-gray-900">跨数据集对比分析</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          两份GenAI相关调查的对比分析，揭示共性与差异
        </p>
        <a
          href="/llm-reports/cross_dataset_comparison.md"
          target="_blank"
          className="text-sm font-medium text-purple-600 hover:text-purple-700"
        >
          查看对比报告 →
        </a>
      </div>
    </div>
  );
}
