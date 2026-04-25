// ============================================
// AnalysisOrchestrator — 主编排入口
// 1. 注册 MCP Servers
// 2. 加载 Skill 注册表（skills/*.md）
// 3. 运行流水线
// 4. 返回 SSE Response
// ============================================

import fs from "fs/promises";
import path from "path";
import type { AnalysisMode } from "../types";
import { mcpClient } from "../mcp/McpClient";
import { FileServer } from "../mcp/servers/FileServer";
import { StatsServer } from "../mcp/servers/StatsServer";
import { LlmGatewayServer } from "../mcp/servers/LlmGatewayServer";
import { NlpServer } from "../mcp/servers/NlpServer";
import { SkillRegistry } from "./SkillRegistry";
import { AnalysisContext } from "./AnalysisContext";
import { ProgressEmitter } from "./ProgressEmitter";
import { PipelineExecutor } from "./PipelineExecutor";
import type { SkillInput } from "./types";

export class AnalysisOrchestrator {
  private registry: SkillRegistry;
  private initialized = false;

  constructor() {
    this.registry = new SkillRegistry();
    // 注册所有 MCP Server
    this._registerMcpServers();
  }

  /** 初始化：加载 skills/*.md */
  async initialize(skillsDir?: string): Promise<number> {
    const dir =
      skillsDir || path.join(process.cwd(), "skills");
    const count = await this.registry.loadAll(dir);
    this.initialized = true;
    return count;
  }

  /**
   * 运行分析流水线，返回 SSE Response
   * @param filePath 上传文件的绝对路径
   * @param mode 分析模式
   * @param datasetName 数据集展示名称
   */
  async run(
    filePath: string,
    mode: AnalysisMode,
    datasetName?: string
  ): Promise<Response> {
    // 延迟初始化
    if (!this.initialized) {
      await this.initialize();
    }

    // 验证文件存在
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const outDir = path.join(process.cwd(), "data", "results");
    await fs.mkdir(outDir, { recursive: true });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start: async (controller) => {
        const emitter = new ProgressEmitter(controller);
        const context = new AnalysisContext();

        // 初始化输入
        const input: SkillInput = {
          filePath,
          outputDir: outDir,
          datasetName: datasetName || path.basename(filePath),
          mode,
          context: {},
        };

        try {
          emitter.progress(`分析模式: ${mode}`, "init");
          emitter.progress(`文件: ${filePath}`, "init");

          // 创建执行器并运行
          const executor = new PipelineExecutor(
            this.registry,
            context,
            mcpClient,
            emitter
          );

          const results = await executor.run(mode, input);

          // 检查是否有成功的 DescriptiveAnalysis
          const descResult = results.find(
            (r) =>
              r.success &&
              context.has("resultPath")
          );

          if (!descResult && mode !== "deep_research") {
            emitter.error("分析失败", "核心统计分析未成功完成");
            emitter.done();
            controller.close();
            return;
          }

          // ── 构建最终结果 ──
          // Python 输出的键是 snake_case，直接从 context 读取
          const resultPath = context.get("resultPath") as string | undefined;
          const total_records = context.get("total_records") as number;
          const total_fields = context.get("total_fields") as number;
          const cleaning = context.get("cleaning") as Record<string, unknown> | undefined;
          const demographics = context.get("demographics") as Record<string, unknown> | undefined;
          const genai_usage = context.get("genai_usage") as Record<string, unknown> | undefined;
          const likert_scales = context.get("likert_scales") as Record<string, unknown> | undefined;
          const text_analysis = context.get("text_analysis") as Record<string, unknown> | undefined;

          const publicDir = path.join(process.cwd(), "public", "data", "results");
          await fs.mkdir(publicDir, { recursive: true });

          let resultUrl = "";
          if (resultPath) {
            try {
              await fs.copyFile(resultPath, path.join(publicDir, path.basename(resultPath)));
              resultUrl = `/data/results/${path.basename(resultPath)}`;
            } catch {
              // 复制失败不影响
            }
          }

          // Mode 2/3 LLM 报告
          const reports = context.get("reports") as
            | Array<{ file: string; path: string }>
            | undefined;
          const llmReports = reports?.map((r) => ({
            file: r.file,
            url: `/llm-reports/${encodeURIComponent(r.file)}`,
          }));

          emitter.result({
            mode,
            resultPath: resultPath || "",
            resultUrl,
            cleaning: cleaning || {},
            summary: {
              records: total_records,
              fields: total_fields,
              demographics: Object.keys(demographics || {}).length,
              usageItems: Object.keys(genai_usage || {}).length,
              likertGroups: Object.keys(likert_scales || {}).length,
              textFields: Object.keys(text_analysis || {}).length,
            },
            ...(llmReports ? { llmReports } : {}),
          });

          emitter.done();
          controller.close();
        } catch (err) {
          emitter.error(
            "分析引擎异常",
            err instanceof Error ? err.message : String(err)
          );
          emitter.done();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── MCP Server 注册 ──

  private _registerMcpServers(): void {
    mcpClient.register(new FileServer());
    mcpClient.register(new StatsServer());
    mcpClient.register(new LlmGatewayServer());
    mcpClient.register(new NlpServer());
    console.log(
      "[AnalysisOrchestrator] MCP Servers registered: " +
        mcpClient
          .listAllTools()
          .map((t) => `${t.server}/${t.tool.name}`)
          .join(", ")
    );
  }
}

/** 单例 */
export const orchestrator = new AnalysisOrchestrator();
