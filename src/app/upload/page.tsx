"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle,
  BarChart3, Sparkles, Terminal, ChevronDown, Search,
} from "lucide-react";
import { useAnalysis } from "@/components/analysis/AnalysisProvider";
import { AnalysisPipeline } from "@/components/analysis/AnalysisPipeline";

type UploadStatus = "idle" | "uploading" | "uploaded";

interface Preview {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

interface AnalysisResult {
  resultUrl: string;
  mode: string;
  summary: {
    records: number;
    fields: number;
    demographics: number;
    usageItems: number;
    likertGroups: number;
    textFields: number;
  };
  llmReports?: { file: string; url: string }[];
  likertReports?: { file: string; url: string }[];
  deepResearchReport?: string;
  theoryMapping?: string;
  actionableInsights?: string;
  researchGaps?: string;
  causalHints?: string;
  sampleBias?: string;
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [filePath, setFilePath] = useState<string>("");
  const [originalName, setOriginalName] = useState<string>("");
  const [mode, setMode] = useState<"quick_overview" | "ai_insights" | "deep_research">("quick_overview");
  const [showLog, setShowLog] = useState(false);

  const { activeJob, startAnalysis, dismissJob } = useAnalysis();
  const router = useRouter();
  const dropRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Determine effective analysis status from activeJob
  const analysisStatus = activeJob?.status ?? "idle";

  // Auto-scroll log
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeJob?.progressLog]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleFile = async (f: File) => {
    setFile(f);
    setUploadStatus("uploading");

    const formData = new FormData();
    formData.append("file", f);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setUploadStatus("idle");
        return;
      }

      setPreview(data.preview);
      setFilePath(data.savedPath);
      setOriginalName(data.originalName || data.filename || "");
      setUploadStatus("uploaded");
    } catch {
      setUploadStatus("idle");
    }
  };

  const handleAnalyze = () => {
    if (!filePath) return;
    startAnalysis(filePath, mode, originalName || file?.name || "");
  };

  const handleViewResults = () => {
    if (!activeJob?.result) return;
    const result = activeJob.result;
    // 优先使用 analysis ID 生成短 URL
    if (result.id) {
      router.push(`/datasets/uploaded?id=${result.id}`);
      return;
    }
    // Fallback: 使用长 query string（向后兼容）
    const params = new URLSearchParams();
    if (result.resultUrl) params.set("url", result.resultUrl);
    if (result.llmReports && result.llmReports.length > 0) {
      params.set("reports", result.llmReports.map(r => encodeURIComponent(r.file)).join(","));
    }
    if (result.deepResearchReport) params.set("deepReport", result.deepResearchReport);
    if (result.likertReports && result.likertReports.length > 0) {
      params.set("likertReports", result.likertReports.map(r => encodeURIComponent(r.file)).join(","));
    }
    if (result.theoryMapping) params.set("theory", result.theoryMapping);
    if (result.actionableInsights) params.set("actionable", result.actionableInsights);
    if (result.researchGaps) params.set("gap", result.researchGaps);
    if (result.causalHints) params.set("causal", result.causalHints);
    if (result.sampleBias) params.set("bias", result.sampleBias);
    router.push(`/datasets/uploaded?${params.toString()}`);
  };

  const stageLabel = (stage: string) => {
    switch (stage) {
      case "mode1": return "统计";
      case "mode2": return "LLM";
      case "running": return "分析";
      case "stderr": return "系统";
      default: return "日志";
    }
  };

  const stageColor = (stage: string) => {
    switch (stage) {
      case "mode1": return "text-blue-600";
      case "mode2": return "text-purple-600";
      case "stderr": return "text-yellow-500";
      default: return "text-gray-500";
    }
  };

  const isAnalyzing = analysisStatus === "analyzing";
  const isDone = analysisStatus === "done";
  const isError = analysisStatus === "error";
  const hasJob = activeJob !== null;

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">上传新问卷</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          支持 CSV 和 Excel (.xlsx) 格式。上传后自动检测题型并运行分析。
        </p>
      </div>

      {/* ── Upload area ── */}
      {uploadStatus === "idle" && (
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-16 text-center hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all cursor-pointer"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".csv,.xlsx,.xls";
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) handleFile(f);
            };
            input.click();
          }}
        >
          <Upload className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 font-medium">拖拽 CSV/Excel 文件到此处</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">或点击选择文件</p>
        </div>
      )}

      {/* ── Uploading ── */}
      {uploadStatus === "uploading" && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
          <span className="text-gray-600 dark:text-gray-400">正在上传和解析...</span>
        </div>
      )}

      {/* ── File info (persistent after upload) ── */}
      {(uploadStatus === "uploaded" || hasJob) && preview && (
        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <div>
            <p className="font-medium text-green-800 dark:text-green-400">{file?.name}</p>
            <p className="text-xs text-green-600 dark:text-green-400">
              {preview.totalRows} 行 · {preview.headers.length} 列
            </p>
          </div>
        </div>
      )}

      {/* ── Preview table (only before analysis starts) ── */}
      {uploadStatus === "uploaded" && !hasJob && preview && (
        <details className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <summary className="px-4 py-2 cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
            <ChevronDown className="w-3 h-3" /> 数据预览 ({preview.headers.length} 列)
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="text-left p-2 text-gray-500 dark:text-gray-400 font-medium w-8">#</th>
                  {preview.headers.slice(0, 8).map((h, i) => (
                    <th key={i} className="text-left p-2 text-gray-700 dark:text-gray-300 font-medium max-w-[150px] truncate" title={h}>
                      {h.length > 20 ? h.slice(0, 20) + "…" : h}
                    </th>
                  ))}
                  {preview.headers.length > 8 && (
                    <th className="text-left p-2 text-gray-400 dark:text-gray-500">+{preview.headers.length - 8} 列</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="p-2 text-gray-400 dark:text-gray-500">{i + 1}</td>
                    {row.slice(0, 8).map((cell, j) => (
                      <td key={j} className="p-2 text-gray-600 dark:text-gray-400 max-w-[150px] truncate" title={cell}>
                        {cell?.length > 30 ? cell.slice(0, 30) + "…" : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* ── Mode selector (only before analysis starts) ── */}
      {uploadStatus === "uploaded" && !hasJob && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 space-y-4">
          <h4 className="font-semibold text-gray-800 dark:text-gray-200">选择分析模式</h4>
          <div className="flex gap-3">
            <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              mode === "quick_overview"
                ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
            }`}>
              <input
                type="radio"
                name="mode"
                value="quick_overview"
                checked={mode === "quick_overview"}
                onChange={() => setMode("quick_overview")}
                className="sr-only"
              />
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">模式1 · 快速概览</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">15-30秒 · 描述性统计+NLP</p>
            </label>

            <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              mode === "ai_insights"
                ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
            }`}>
              <input
                type="radio"
                name="mode"
                value="ai_insights"
                checked={mode === "ai_insights"}
                onChange={() => setMode("ai_insights")}
                className="sr-only"
              />
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">模式2 · AI洞察</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">1-2分钟 · 含LLM深度分析</p>
            </label>

            <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              mode === "deep_research"
                ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
            }`}>
              <input
                type="radio"
                name="mode"
                value="deep_research"
                checked={mode === "deep_research"}
                onChange={() => setMode("deep_research")}
                className="sr-only"
              />
              <div className="flex items-center gap-2 mb-1">
                <Search className="w-4 h-4 text-amber-600" />
                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">模式3 · 深度研究</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">2-5分钟 · 五轮探索循环</p>
            </label>
          </div>

          <button
            onClick={handleAnalyze}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            开始分析
          </button>
        </div>
      )}

      {/* ── Active / recovered analysis job ── */}
      {hasJob && (
        <div className="space-y-4">
          {/* Visual Pipeline Stepper */}
          {(isAnalyzing || activeJob!.progressLog.length > 0) && (
            <AnalysisPipeline
              mode={activeJob!.mode}
              logs={activeJob!.progressLog}
              isAnalyzing={isAnalyzing}
              roundProgress={activeJob!.roundProgress}
            />
          )}

          {/* Detailed log (collapsible) */}
          {(isAnalyzing || activeJob!.progressLog.length > 0) && (
            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-gray-300 font-medium">
                    {isAnalyzing ? "详细日志" : "分析日志"}
                  </span>
                  {activeJob!.progressLog.length > 0 && (
                    <span className="text-xs text-gray-500">
                      ({activeJob!.progressLog.length} 条)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isDone && (
                    <span className="text-xs text-green-400 font-medium">已完成</span>
                  )}
                  {isError && (
                    <span className="text-xs text-red-400 font-medium">失败</span>
                  )}
                  <button
                    onClick={() => setShowLog(!showLog)}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    {showLog ? "收起" : "展开"}
                  </button>
                </div>
              </div>

              {showLog && (
                <div className="p-3 space-y-1 max-h-60 overflow-y-auto font-mono text-xs">
                  {activeJob!.progressLog.length === 0 && isAnalyzing && (
                    <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>等待分析引擎启动...</span>
                    </div>
                  )}
                  {activeJob!.progressLog.map((entry, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-gray-600 shrink-0 w-12 text-right">
                        {new Date(entry.timestamp).toLocaleTimeString("zh-CN", { hour12: false })}
                      </span>
                      <span className={`shrink-0 w-14 text-right text-xs ${stageColor(entry.stage)}`}>
                        [{stageLabel(entry.stage)}]
                      </span>
                      <span className={`${entry.stage === "stderr" ? "text-yellow-300" : "text-gray-300"}`}>
                        {entry.text}
                      </span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              )}
            </div>
          )}

          {/* ── Done ── */}
          {isDone && activeJob!.result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800 dark:text-green-400">
                    分析完成 ({activeJob!.result.mode === "deep_research"
                      ? "模式3 · 深度研究"
                      : activeJob!.result.mode === "ai_insights"
                      ? "模式2 · AI洞察"
                      : "模式1 · 快速概览"})
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {activeJob!.result.summary.records} 条记录 · {activeJob!.result.summary.fields} 个字段
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <StatBadge label="人口学维度" value={activeJob!.result.summary.demographics} color="blue" />
                <StatBadge label="量表题组" value={activeJob!.result.summary.likertGroups} color="purple" />
                <StatBadge label="文本分析" value={activeJob!.result.summary.textFields} color="green" />
              </div>

              {/* Token Usage */}
              {activeJob!.result.tokenUsage && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                    LLM Token 用量
                  </h4>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{activeJob!.result.tokenUsage.total_tokens.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">总计</p>
                    </div>
                    <div className="w-px bg-gray-200 dark:bg-gray-700" />
                    <div>
                      <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{activeJob!.result.tokenUsage.prompt_tokens.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">输入 (Prompt)</p>
                    </div>
                    <div className="w-px bg-gray-200 dark:bg-gray-700" />
                    <div>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">{activeJob!.result.tokenUsage.completion_tokens.toLocaleString()}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">输出 (Completion)</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Deep Research Report */}
              {activeJob!.result.deepResearchReport && (
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-4 border border-amber-200 dark:border-amber-800">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-2 flex items-center gap-2">
                    <Search className="w-4 h-4" />
                    深度研究报告
                  </h4>
                  <a
                    href={activeJob!.result.deepResearchReport}
                    target="_blank"
                    className="block text-sm text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 underline"
                  >
                    查看完整深度研究报告
                  </a>
                </div>
              )}

              {/* LLM Report links */}
              {activeJob!.result.llmReports && activeJob!.result.llmReports.length > 0 && (
                <div className="bg-purple-50 dark:bg-purple-950/30 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                  <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-400 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    AI 洞察报告 ({activeJob!.result.llmReports.length} 份)
                  </h4>
                  <div className="space-y-1">
                    {activeJob!.result.llmReports.map((r, i) => (
                      <a
                        key={i}
                        href={r.url}
                        target="_blank"
                        className="block text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 underline"
                      >
                        {r.file}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleViewResults}
                  className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
                >
                  查看分析结果
                </button>
                <button
                  onClick={dismissJob}
                  className="px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                  清除
                </button>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {isError && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
                <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-800 dark:text-red-400">分析失败</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{activeJob!.error}</p>
                  {activeJob!.errorDetail && (
                    <details className="mt-2">
                      <summary className="text-xs text-red-500 dark:text-red-400 cursor-pointer hover:text-red-600">
                        查看详细错误
                      </summary>
                      <pre className="mt-2 p-3 bg-red-100 dark:bg-red-900/40 rounded-lg text-xs text-red-700 dark:text-red-300 overflow-x-auto whitespace-pre-wrap max-h-60">
                        {activeJob!.errorDetail}
                      </pre>
                    </details>
                  )}
                </div>
              </div>

              {/* If error but we have a fallback result */}
              {activeJob!.result?.resultUrl && (
                <button
                  onClick={handleViewResults}
                  className="w-full py-3 bg-gray-600 text-white font-medium rounded-xl hover:bg-gray-700 transition-colors"
                >
                  查看部分分析结果（仅模式1）
                </button>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setUploadStatus("idle");
                    setFile(null);
                    setPreview(null);
                    setFilePath("");
                    dismissJob();
                  }}
                  className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
                >
                  上传新文件
                </button>
                <button
                  onClick={dismissJob}
                  className="px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                  清除
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
    purple: "bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400",
    green: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400",
  };
  return (
    <div className={`rounded-xl p-4 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1">{label}</p>
    </div>
  );
}
