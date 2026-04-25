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

export async function POST(request: NextRequest): Promise<Response> {
  const body = await request.json();
  const {
    filePath,
    mode = "quick_overview" as AnalysisMode,
    datasetName,
  } = body;

  if (!filePath) {
    return NextResponse.json({ error: "未指定文件路径" }, { status: 400 });
  }

  // 验证 mode
  const validModes: AnalysisMode[] = [
    "quick_overview",
    "ai_insights",
    "deep_research",
  ];
  if (!validModes.includes(mode)) {
    return NextResponse.json(
      { error: `无效的分析模式: ${mode}` },
      { status: 400 }
    );
  }

  try {
    // 委托给编排引擎 — 返回 SSE Response
    return await orchestrator.run(filePath, mode, datasetName);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "分析引擎启动失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
