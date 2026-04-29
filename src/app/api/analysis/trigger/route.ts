// ============================================
// POST /api/analysis/trigger
// 触发问卷分析流水线 — 通过 AnalysisOrchestrator
// 返回 SSE 流（与前端 EventSource 兼容）
//
// 架构: API Route → Orchestrator → PipelineExecutor(DAG)
//         → Skill (.md) → MCP Client (JSON-RPC) → Python Scripts
// ============================================

import { NextRequest, NextResponse } from "next/server";
import { orchestrator } from "@/lib/agent/AnalysisOrchestrator";
import type { AnalysisMode } from "@/lib/types";

export const ANALYSIS_MODES: AnalysisMode[] = [
  "quick_overview",
  "ai_insights",
  "deep_research",
];

export async function POST(request: NextRequest): Promise<Response> {
  let body: { filePath?: string; mode?: string; datasetName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的请求数据" }, { status: 400 });
  }

  const {
    filePath,
    mode = "quick_overview" as AnalysisMode,
    datasetName,
  } = body;

  if (!filePath) {
    return NextResponse.json({ error: "未指定文件路径" }, { status: 400 });
  }

  // 验证 mode
  if (!ANALYSIS_MODES.includes(mode as AnalysisMode)) {
    return NextResponse.json(
      { error: `无效的分析模式: ${mode}` },
      { status: 400 }
    );
  }

  try {
    // 委托给编排引擎 — 返回 SSE Response，传递 request.signal 以支持客户端断开
    return await orchestrator.run(filePath, mode as AnalysisMode, datasetName, request.signal);
  } catch (err) {
    const message = process.env.NODE_ENV === "production"
      ? "分析引擎启动失败"
      : err instanceof Error ? err.message : "分析引擎启动失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
