"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle,
  BarChart3, Sparkles, Terminal, ChevronDown,
} from "lucide-react";

type Status = "idle" | "uploading" | "uploaded" | "analyzing" | "done" | "error";

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
}

interface ProgressEntry {
  text: string;
  stage: string;
  timestamp: number;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [filePath, setFilePath] = useState<string>("");
  const [originalName, setOriginalName] = useState<string>("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [mode, setMode] = useState<"quick_overview" | "ai_insights">("quick_overview");
  const [progressLog, setProgressLog] = useState<ProgressEntry[]>([]);
  const [showLog, setShowLog] = useState(true);
  const router = useRouter();
  const dropRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [progressLog]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleFile = async (f: File) => {
    setFile(f);
    setStatus("uploading");
    setError("");
    setErrorDetail("");

    const formData = new FormData();
    formData.append("file", f);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "上传失败");
        setStatus("error");
        return;
      }

      setPreview(data.preview);
      setFilePath(data.savedPath);
      setOriginalName(data.originalName || data.filename || "");
      setStatus("uploaded");
    } catch {
      setError("网络错误");
      setStatus("error");
    }
  };

  const handleAnalyze = async () => {
    if (!filePath) return;
    setStatus("analyzing");
    setProgressLog([]);
    setShowLog(true);

    try {
      const response = await fetch("/api/analysis/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, mode, datasetName: originalName || file?.name || "" }),
      });

      if (!response.ok) {
        setError(`请求失败 (HTTP ${response.status})`);
        setStatus("error");
        return;
      }

      // Read SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split("\n\n");
        buffer = messages.pop() || "";

        for (const msg of messages) {
          const lines = msg.split("\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              handleSSEEvent(event);
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
      // Process remaining buffer
      if (buffer.trim()) {
        for (const line of buffer.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            handleSSEEvent(event);
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setError("分析请求失败，网络错误");
      setErrorDetail(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const handleSSEEvent = (event: Record<string, unknown>) => {
    switch (event.type) {
      case "progress":
        setProgressLog((prev) => [
          ...prev,
          {
            text: event.message as string,
            stage: event.stage as string,
            timestamp: Date.now(),
          },
        ]);
        break;

      case "log":
        setProgressLog((prev) => [
          ...prev,
          {
            text: event.message as string,
            stage: (event.level as string) === "stderr" ? "stderr" : "log",
            timestamp: Date.now(),
          },
        ]);
        break;

      case "result":
        setResult({
          resultUrl: event.resultUrl as string,
          mode: event.mode as string,
          summary: event.summary as AnalysisResult["summary"],
          llmReports: event.llmReports as AnalysisResult["llmReports"],
        });
        setStatus("done");
        break;

      case "error": {
        const errMsg = (event.error as string) || "分析失败";
        const errDetail = (event.detail as string) || "";
        setError(errMsg);
        setErrorDetail(errDetail);
        // If there's a fallback result, still show it
        if (event.fallbackResult) {
          setResult({
            resultUrl: (event.fallbackResult as Record<string, unknown>).resultUrl as string,
            mode: (event.fallbackResult as Record<string, unknown>).mode as string,
            summary: {} as AnalysisResult["summary"],
          });
        }
        setStatus("error");
        break;
      }

      case "done":
        break;
    }
  };

  const handleViewResults = () => {
    if (result?.resultUrl) {
      let navUrl = `/datasets/uploaded?url=${encodeURIComponent(result.resultUrl)}`;
      if (result.llmReports && result.llmReports.length > 0) {
        const reportNames = result.llmReports.map(r => encodeURIComponent(r.file)).join(",");
        navUrl += `&reports=${reportNames}`;
      }
      router.push(navUrl);
    }
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

  const rowColor = (stage: string) => {
    if (stage === "stderr") return "text-yellow-300";
    return "text-gray-300";
  };

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">上传新问卷</h2>
        <p className="text-sm text-gray-500 mt-1">
          支持 CSV 和 Excel (.xlsx) 格式。上传后自动检测题型并运行分析。
        </p>
      </div>

      {/* Upload area */}
      {status === "idle" && (
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-2xl p-16 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer"
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
          <Upload className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">拖拽 CSV/Excel 文件到此处</p>
          <p className="text-sm text-gray-400 mt-1">或点击选择文件</p>
        </div>
      )}

      {/* Uploading */}
      {status === "uploading" && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500 mr-3" />
          <span className="text-gray-600">正在上传和解析...</span>
        </div>
      )}

      {/* Preview + Mode select + Progress */}
      {(status === "uploaded" || status === "analyzing" || status === "done") && preview && (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">{file?.name}</p>
              <p className="text-xs text-green-600">
                {preview.totalRows} 行 · {preview.headers.length} 列
              </p>
            </div>
          </div>

          {/* Preview table (compact, collapsed when analyzing) */}
          {status !== "analyzing" && (
            <details className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <summary className="px-4 py-2 cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <ChevronDown className="w-3 h-3" /> 数据预览 ({preview.headers.length} 列)
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2 text-gray-500 font-medium w-8">#</th>
                      {preview.headers.slice(0, 8).map((h, i) => (
                        <th key={i} className="text-left p-2 text-gray-700 font-medium max-w-[150px] truncate" title={h}>
                          {h.length > 20 ? h.slice(0, 20) + "…" : h}
                        </th>
                      ))}
                      {preview.headers.length > 8 && (
                        <th className="text-left p-2 text-gray-400">+{preview.headers.length - 8} 列</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="p-2 text-gray-400">{i + 1}</td>
                        {row.slice(0, 8).map((cell, j) => (
                          <td key={j} className="p-2 text-gray-600 max-w-[150px] truncate" title={cell}>
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

          {/* Mode selector — only before analysis */}
          {status === "uploaded" && (
            <div className="bg-gray-50 rounded-xl p-5 space-y-4">
              <h4 className="font-semibold text-gray-800">选择分析模式</h4>
              <div className="flex gap-3">
                <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  mode === "quick_overview"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
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
                    <span className="font-medium text-sm text-gray-900">模式1 · 快速概览</span>
                  </div>
                  <p className="text-xs text-gray-500">10-30秒 · 描述性统计+NLP</p>
                </label>

                <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  mode === "ai_insights"
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
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
                    <span className="font-medium text-sm text-gray-900">模式2 · AI洞察</span>
                  </div>
                  <p className="text-xs text-gray-500">3-5分钟 · 含LLM深度分析</p>
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

          {/* ── Progress log during analysis ── */}
          {status === "analyzing" && (
            <div className="bg-gray-900 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-green-400" />
                  <span className="text-xs text-gray-300 font-medium">分析进度</span>
                  {progressLog.length > 0 && (
                    <span className="text-xs text-gray-500">
                      ({progressLog.length} 条消息)
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowLog(!showLog)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  {showLog ? "收起" : "展开"}
                </button>
              </div>

              {showLog && (
                <div className="p-3 space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
                  {progressLog.length === 0 && (
                    <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>等待分析引擎启动...</span>
                    </div>
                  )}
                  {progressLog.map((entry, i) => (
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

              {/* Live spinner */}
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-t border-gray-700">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                <span className="text-xs text-gray-400">
                  {mode === "quick_overview" ? "模式1 · 统计分析中..." : "模式2 · LLM 深度分析中..."}
                </span>
                <span className="text-xs text-gray-500 ml-auto">
                  {mode === "quick_overview" ? "预计 10-30 秒" : "预计 3-5 分钟"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Done ── */}
      {status === "done" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">
                分析完成 ({result.mode === "ai_insights" ? "模式2 · AI洞察" : "模式1 · 快速概览"})
              </p>
              <p className="text-xs text-green-600">
                {result.summary.records} 条记录 · {result.summary.fields} 个字段
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatBadge label="人口学维度" value={result.summary.demographics} color="blue" />
            <StatBadge label="量表题组" value={result.summary.likertGroups} color="purple" />
            <StatBadge label="文本分析" value={result.summary.textFields} color="green" />
          </div>

          {/* LLM Report links */}
          {result.llmReports && result.llmReports.length > 0 && (
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-200">
              <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI 洞察报告 ({result.llmReports.length} 份)
              </h4>
              <div className="space-y-1">
                {result.llmReports.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    className="block text-sm text-purple-600 hover:text-purple-800 underline"
                  >
                    {r.file}
                  </a>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleViewResults}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
          >
            查看分析结果
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {status === "error" && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-800">分析失败</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
              {errorDetail && (
                <details className="mt-2">
                  <summary className="text-xs text-red-500 cursor-pointer hover:text-red-600">
                    查看详细错误
                  </summary>
                  <pre className="mt-2 p-3 bg-red-100 rounded-lg text-xs text-red-700 overflow-x-auto whitespace-pre-wrap max-h-60">
                    {errorDetail}
                  </pre>
                </details>
              )}
            </div>
            <button
              onClick={() => { setStatus("idle"); setFile(null); setError(""); setErrorDetail(""); setProgressLog([]); }}
              className="text-sm text-red-600 hover:text-red-700 shrink-0"
            >
              重试
            </button>
          </div>

          {/* Show progress log even on error */}
          {progressLog.length > 0 && (
            <details className="bg-gray-50 rounded-xl border border-gray-200">
              <summary className="px-4 py-2 text-sm text-gray-500 cursor-pointer">
                查看分析日志 ({progressLog.length} 条)
              </summary>
              <div className="p-3 space-y-0.5 font-mono text-xs max-h-40 overflow-y-auto">
                {progressLog.map((entry, i) => (
                  <div key={i} className={`${entry.stage === "stderr" ? "text-red-500" : "text-gray-500"}`}>
                    [{entry.stage}] {entry.text}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* If error but we have a fallback result */}
          {result?.resultUrl && (
            <button
              onClick={handleViewResults}
              className="w-full py-3 bg-gray-600 text-white font-medium rounded-xl hover:bg-gray-700 transition-colors"
            >
              查看部分分析结果（仅模式1）
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number | string; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    green: "bg-green-50 text-green-700",
  };
  return (
    <div className={`rounded-xl p-4 text-center ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-1">{label}</p>
    </div>
  );
}
