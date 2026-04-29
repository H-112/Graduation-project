// ============================================
// AnalysisOrchestrator — 主编排入口
// 1. 注册 MCP Servers
// 2. 加载 Skill 注册表（skills/*.md）
// 3. 运行流水线
// 4. 返回 SSE Response
// ============================================

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { AnalysisMode } from "../types";
import { mcpClient } from "../mcp/McpClient";
import { addAnalysisRecord } from "../history";
import type { HistoryRecord } from "../history";
import { FileServer } from "../mcp/servers/FileServer";
import { StatsServer } from "../mcp/servers/StatsServer";
import { LlmGatewayServer } from "../mcp/servers/LlmGatewayServer";
// NlpServer 已迁移为 stdio 模式（官方 MCP SDK PoC），见下方 _registerMcpServers
// import { NlpServer } from "../mcp/servers/NlpServer";
import { DeepResearchServer } from "../mcp/servers/DeepResearchServer";
import { InsightServer } from "../mcp/servers/InsightServer";
import { SkillRegistry } from "./SkillRegistry";
import { AnalysisContext } from "./AnalysisContext";
import { ProgressEmitter } from "./ProgressEmitter";
import { PipelineExecutor } from "./PipelineExecutor";
import type { SkillInput } from "./types";
import {
  computeFileHash,
  getCachedAnalysis,
  setCachedAnalysis,
} from "../cache";

export class AnalysisOrchestrator {
  private registry: SkillRegistry;
  private initialized = false;
  private serversRegistered = false;

  constructor() {
    this.registry = new SkillRegistry();
    // MCP Server 注册延迟到 initialize()，以便支持异步 stdio 连接
  }

  /** 初始化：注册 MCP Servers → 加载 skills/*.md */
  async initialize(skillsDir?: string): Promise<number> {
    await this._registerMcpServers();

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
    datasetName?: string,
    signal?: AbortSignal,
    force: boolean = false
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

    const analysisId = crypto.randomBytes(6).toString("hex");

    // 计算文件哈希（用于缓存检查和后续写入）
    const fileHash = await computeFileHash(filePath);

    // ── 缓存检查（force=true 时跳过缓存，强制重新分析）──
    if (!force) {
      const cached = await getCachedAnalysis(fileHash, mode);
      if (cached) {
        // 缓存命中：直接返回 SSE 结果（复用已有分析）
        return new Response(
          new ReadableStream({
            start: async (controller) => {
              const emitter = new ProgressEmitter(controller);
              emitter.progress("缓存命中，直接返回已有分析结果", "cache");
              emitter.result({
                id: analysisId,
                mode,
                resultPath: "",
                resultUrl: cached.resultUrl || "",
                cleaning: {},
                summary: cached.summary || {},
                ...(cached.llmReports?.length ? { llmReports: cached.llmReports.map((f) => ({ file: f, url: `/llm-reports/${encodeURIComponent(f)}` })) } : {}),
                ...(cached.likertReports?.length ? { likertReports: cached.likertReports.map((f) => ({ file: f, url: `/llm-reports/${encodeURIComponent(f)}` })) } : {}),
                ...(cached.deepReportUrl ? { deepResearchReport: cached.deepReportUrl } : {}),
                ...(cached.theoryMappingUrl ? { theoryMapping: cached.theoryMappingUrl } : {}),
                ...(cached.actionableInsightsUrl ? { actionableInsights: cached.actionableInsightsUrl } : {}),
                ...(cached.researchGapsUrl ? { researchGaps: cached.researchGapsUrl } : {}),
                ...(cached.causalHintsUrl ? { causalHints: cached.causalHintsUrl } : {}),
                ...(cached.sampleBiasUrl ? { sampleBias: cached.sampleBiasUrl } : {}),
                ...(cached.tokenUsage ? { tokenUsage: cached.tokenUsage } : {}),
              });
              emitter.done();
              controller.close();
            },
          }),
          {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
              "X-Cache": "HIT",
            },
          }
        );
      }
    }

    // SSE 最大连接时长（15 分钟）
    const SSE_MAX_DURATION_MS = 15 * 60 * 1000;

    const abortController = new AbortController();

    const stream = new ReadableStream({
      start: async (controller) => {
        const emitter = new ProgressEmitter(controller);
        const context = new AnalysisContext();
        const startTime = Date.now();

        // SSE 连接上限
        let streamTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
          emitter.error("连接超时", "分析超过 15 分钟上限，连接已关闭");
          emitter.done();
          controller.close();
        }, SSE_MAX_DURATION_MS);

        // 初始化输入
        const input: SkillInput = {
          filePath,
          outputDir: outDir,
          datasetName: datasetName || path.basename(filePath),
          mode,
          crossAnalysis: mode !== "quick_overview", // 模式2/3 启用交叉分析
          context: {},
        };

        try {
          emitter.progress(`分析模式: ${mode}`, "init");
          emitter.progress(`文件: ${filePath}`, "init");

          // 推送动态 Skill 层级，供前端步骤条渲染
          const levels = this.registry.getLevels(mode);
          emitter.skills(levels);

          // 创建执行器并运行
          const executor = new PipelineExecutor(
            this.registry,
            context,
            mcpClient,
            emitter
          );

          const results = await executor.run(mode, input, abortController.signal);

          // 检查是否有成功的 DescriptiveAnalysis
          const descResult = results.find(
            (r) =>
              r.success &&
              context.has("resultPath")
          );

          if (!descResult) {
            // deep_research 模式下即使核心分析失败也不应返回空结果
            const failureMsg = mode === "deep_research"
              ? "深度研究模式下核心统计分析未完成"
              : "核心统计分析未成功完成";
            const duration_ms = Date.now() - startTime;
            const apiCalls = (context.get("__apiCalls") as number) || 0;
            const tokenUsage = context.get("__tokenUsage") as HistoryRecord["tokenUsage"] | undefined;
            await addAnalysisRecord({
              id: analysisId,
              datasetName: datasetName || path.basename(filePath),
              filePath,
              mode,
              status: "failed",
              error: failureMsg,
              duration_ms,
              apiCalls,
              tokenUsage,
            });
            emitter.error("分析失败", failureMsg);
            emitter.done();
            clearTimeout(streamTimeout);
            streamTimeout = null;
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
            } catch (copyErr) {
              emitter.log(`[warn] 复制结果文件失败: ${copyErr instanceof Error ? copyErr.message : String(copyErr)}`);
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

          // Mode 2/3 量表 LLM 分析报告
          const likertReportsRaw = context.get("likertReports") as
            | Array<{ file: string; path: string }>
            | undefined;
          const likertReports = likertReportsRaw?.map((r) => ({
            file: r.file,
            url: `/llm-reports/${encodeURIComponent(r.file)}`,
          }));

          // Mode 3 深度研究报告
          const deepResearchReport = context.get("deepResearchReport") as string | undefined;
          let deepResearchReportUrl = "";
          if (deepResearchReport) {
            try {
              const reportPublicDir = path.join(process.cwd(), "public", "data", "results");
              await fs.mkdir(reportPublicDir, { recursive: true });
              const destName = `deep_research_${path.basename(deepResearchReport)}`;
              await fs.copyFile(deepResearchReport, path.join(reportPublicDir, destName));
              deepResearchReportUrl = `/data/results/${destName}`;
            } catch (copyErr) {
              emitter.log(`[warn] 复制深度研究报告失败: ${copyErr instanceof Error ? copyErr.message : String(copyErr)}`);
            }
          }

          // Mode 3 扩展洞察报告
          async function copyInsightFile(contextKey: string, prefix: string): Promise<string> {
            const filePath = context.get(contextKey) as string | undefined;
            if (!filePath) return "";
            try {
              const reportPublicDir = path.join(process.cwd(), "public", "data", "results");
              await fs.mkdir(reportPublicDir, { recursive: true });
              const destName = `${prefix}_${path.basename(filePath)}`;
              await fs.copyFile(filePath, path.join(reportPublicDir, destName));
              return `/data/results/${destName}`;
            } catch (copyErr) {
              emitter.log(`[warn] 复制洞察文件 (${prefix}) 失败: ${copyErr instanceof Error ? copyErr.message : String(copyErr)}`);
              return "";
            }
          }

          const theoryMappingUrl = await copyInsightFile("theoryMapping", "theory");
          const actionableInsightsUrl = await copyInsightFile("actionableInsights", "actionable");
          const researchGapsUrl = await copyInsightFile("researchGaps", "gap");
          const causalHintsUrl = await copyInsightFile("causalHints", "causal");
          const sampleBiasUrl = await copyInsightFile("sampleBias", "bias");

          // 记录分析历史
          const duration_ms = Date.now() - startTime;
          const apiCalls = (context.get("__apiCalls") as number) || 0;
          const tokenUsage = context.get("__tokenUsage") as HistoryRecord["tokenUsage"] | undefined;
          await addAnalysisRecord({
            id: analysisId,
            datasetName: datasetName || path.basename(filePath),
            filePath,
            resultUrl: resultUrl || undefined,
            deepReportUrl: deepResearchReportUrl || undefined,
            llmReports: llmReports?.map((r) => r.file),
            likertReports: likertReportsRaw?.map((r) => r.file),
            theoryMappingUrl: theoryMappingUrl || undefined,
            actionableInsightsUrl: actionableInsightsUrl || undefined,
            researchGapsUrl: researchGapsUrl || undefined,
            causalHintsUrl: causalHintsUrl || undefined,
            sampleBiasUrl: sampleBiasUrl || undefined,
            mode,
            status: "completed",
            duration_ms,
            apiCalls,
            tokenUsage,
            summary: {
              records: total_records,
              fields: total_fields,
              demographics: Object.keys(demographics || {}).length,
              usageItems: Object.keys(genai_usage || {}).length,
              likertGroups: Object.keys(likert_scales || {}).length,
              textFields: Object.keys(text_analysis || {}).length,
            },
          });

          // 写入缓存（基于文件哈希 + 分析模式）
          await setCachedAnalysis(fileHash, mode, {
            resultUrl: resultUrl || undefined,
            deepReportUrl: deepResearchReportUrl || undefined,
            llmReports: llmReports?.map((r) => r.file),
            likertReports: likertReportsRaw?.map((r) => r.file),
            theoryMappingUrl: theoryMappingUrl || undefined,
            actionableInsightsUrl: actionableInsightsUrl || undefined,
            researchGapsUrl: researchGapsUrl || undefined,
            causalHintsUrl: causalHintsUrl || undefined,
            sampleBiasUrl: sampleBiasUrl || undefined,
            summary: {
              records: total_records,
              fields: total_fields,
              demographics: Object.keys(demographics || {}).length,
              usageItems: Object.keys(genai_usage || {}).length,
              likertGroups: Object.keys(likert_scales || {}).length,
              textFields: Object.keys(text_analysis || {}).length,
            },
            tokenUsage,
          });

          emitter.result({
            id: analysisId,
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
            ...(likertReports ? { likertReports } : {}),
            ...(deepResearchReportUrl ? { deepResearchReport: deepResearchReportUrl } : {}),
            ...(theoryMappingUrl ? { theoryMapping: theoryMappingUrl } : {}),
            ...(actionableInsightsUrl ? { actionableInsights: actionableInsightsUrl } : {}),
            ...(researchGapsUrl ? { researchGaps: researchGapsUrl } : {}),
            ...(causalHintsUrl ? { causalHints: causalHintsUrl } : {}),
            ...(sampleBiasUrl ? { sampleBias: sampleBiasUrl } : {}),
            ...(tokenUsage ? { tokenUsage } : {}),
          });

          emitter.done();
          if (streamTimeout) { clearTimeout(streamTimeout); streamTimeout = null; }
          controller.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const duration_ms = Date.now() - startTime;
          const apiCalls = (context.get("__apiCalls") as number) || 0;
          const tokenUsage = context.get("__tokenUsage") as HistoryRecord["tokenUsage"] | undefined;
          await addAnalysisRecord({
            id: analysisId,
            datasetName: datasetName || path.basename(filePath),
            filePath,
            mode,
            status: "failed",
            error: errorMsg,
            duration_ms,
            apiCalls,
            tokenUsage,
          });
          emitter.error("分析引擎异常", errorMsg);
          emitter.done();
          if (streamTimeout) { clearTimeout(streamTimeout); streamTimeout = null; }
          controller.close();
        }
      },
      // 当客户端断开连接时，cancel 被调用
      cancel() {
        // ReadableStream cancel — 客户端 disconnected
        console.log(`[AnalysisOrchestrator] Client disconnected for analysis ${analysisId}`);
        abortController.abort("客户端断开连接");
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

  private async _registerMcpServers(): Promise<void> {
    if (this.serversRegistered) return;
    this.serversRegistered = true;

    // 进程内 Server（原有实现）
    mcpClient.register(new FileServer());
    mcpClient.register(new StatsServer());
    mcpClient.register(new LlmGatewayServer());
    mcpClient.register(new DeepResearchServer());
    mcpClient.register(new InsightServer());

    // stdio Server（官方 MCP SDK PoC：NlpServer）
    await mcpClient.registerStdio({
      name: "nlp-server",
      command: "npx",
      args: ["tsx", "servers/nlp-stdio-server.ts"],
    });

    const tools = await mcpClient.listAllTools();
    console.log(
      "[AnalysisOrchestrator] MCP Servers registered: " +
        tools.map((t) => `${t.server}/${t.tool.name}`).join(", ")
    );
  }
}

/** 单例 */
export const orchestrator = new AnalysisOrchestrator();
