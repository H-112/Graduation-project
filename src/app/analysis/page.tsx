"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Sparkles, Search, ArrowRight, Loader2, AlertCircle, Clock, CheckCircle, XCircle } from "lucide-react";
import type { HistoryRecord } from "@/lib/history";

const modeLabel = (mode?: string) => {
  switch (mode) {
    case "quick_overview": return "模式1 · 快速概览";
    case "ai_insights": return "模式2 · AI洞察";
    case "deep_research": return "模式3 · 深度研究";
    default: return "分析";
  }
};

const modeIcon = (mode?: string) => {
  switch (mode) {
    case "deep_research": return Search;
    case "ai_insights": return Sparkles;
    default: return BarChart3;
  }
};

const modeColor = (mode?: string) => {
  switch (mode) {
    case "deep_research": return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    case "ai_insights": return "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800";
    default: return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
  }
};

/** 格式化毫秒为可读时长 */
const formatDuration = (ms?: number): string => {
  if (ms === undefined || ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}秒`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}分${secs > 0 ? `${secs}秒` : ""}`;
};

export default function AnalysisHistoryPage() {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/history", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setHistory(data.history || []);
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return;
        setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const analysisRecords = history.filter((r) => r.type === "analysis");

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">分析历史</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          已完成的分析任务与报告 · {analysisRecords.length} 条记录
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
          <span className="text-gray-500 dark:text-gray-400">加载历史记录...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && analysisRecords.length === 0 && (
        <div className="text-center py-16 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <BarChart3 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">暂无分析记录</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            上传问卷并运行分析后，记录将出现在这里
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            去上传问卷
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {analysisRecords.map((record) => {
          const Icon = modeIcon(record.mode);
          const colorClass = modeColor(record.mode);
          const isCompleted = record.status === "completed";
          const isFailed = record.status === "failed";
          const timeStr = new Date(record.timestamp).toLocaleString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <div
              key={record.id}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${colorClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {record.datasetName}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {isCompleted && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                          <CheckCircle className="w-3 h-3" />
                          成功
                        </span>
                      )}
                      {isFailed && (
                        <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                          <XCircle className="w-3 h-3" />
                          失败
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                        <Clock className="w-3 h-3" />
                        {timeStr}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {modeLabel(record.mode)}
                    {record.summary?.records !== undefined && (
                      <span> · {record.summary.records} 条记录</span>
                    )}
                    {record.summary?.fields !== undefined && (
                      <span> · {record.summary.fields} 个字段</span>
                    )}
                    {record.duration_ms !== undefined && record.duration_ms > 0 && (
                      <span> · 耗时 {formatDuration(record.duration_ms)}</span>
                    )}
                    {record.apiCalls !== undefined && record.apiCalls > 0 && (
                      <span> · {record.apiCalls} 次 API 调用</span>
                    )}
                    {record.tokenUsage && (
                      <span> · {record.tokenUsage.total_tokens.toLocaleString()} tokens</span>
                    )}
                  </p>

                  {isFailed && record.error && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-2 bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
                      {record.error}
                    </p>
                  )}

                  {isCompleted && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {record.resultUrl && (
                        <Link
                          href={`/datasets/uploaded?id=${record.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        >
                          <BarChart3 className="w-3 h-3" />
                          查看结果
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                      {record.deepReportUrl && (
                        <a
                          href={record.deepReportUrl}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                        >
                          <Search className="w-3 h-3" />
                          深度研究报告
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
