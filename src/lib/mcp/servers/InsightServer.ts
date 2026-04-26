// ============================================
// InsightServer — 模式3扩展洞察服务 MCP Server
// 提供5个tool：理论映射、可操作建议、研究缺口、因果推断提示、样本偏差诊断
// ============================================

import { McpServer } from "../McpServer";
import type { ServerManifest, ToolCallResult } from "../protocol";
import { spawnPython, resolveScript } from "../spawnPython";

export class InsightServer extends McpServer {
  readonly manifest: ServerManifest = {
    name: "insight-server",
    version: "1.0.0",
    description:
      "模式3扩展洞察服务：理论映射、可操作建议、研究缺口识别、因果推断提示、样本偏差诊断",
    capabilities: {
      tools: [
        {
          name: "map_theories",
          description:
            "将分析结果自适应映射到对应领域的经典理论框架。自动识别问卷主题领域，加载对应理论库，评估数据对理论的支持/反驳/扩展关系。",
          inputSchema: {
            type: "object",
            properties: {
              mode1ResultPath: {
                type: "string",
                description: "Mode 1 analyze_generic.py 输出的 JSON 文件路径",
              },
              deepResearchDir: {
                type: "string",
                description: "DeepResearch 输出目录（含 round_*.json 和 deep_research_report.md）",
              },
              outputDir: {
                type: "string",
                description: "报告输出目录（绝对路径）",
              },
            },
            required: ["mode1ResultPath", "deepResearchDir", "outputDir"],
          },
        },
        {
          name: "generate_actionable_insights",
          description:
            "基于深度分析结果生成具体、可操作的干预/改进建议。按场景分类，每条建议追溯关联的数据证据。",
          inputSchema: {
            type: "object",
            properties: {
              mode1ResultPath: { type: "string", description: "Mode 1 分析结果 JSON 路径" },
              deepResearchDir: { type: "string", description: "DeepResearch 输出目录" },
              outputDir: { type: "string", description: "输出目录" },
            },
            required: ["mode1ResultPath", "deepResearchDir", "outputDir"],
          },
        },
        {
          name: "analyze_research_gaps",
          description:
            "识别当前研究未覆盖的维度、方法局限和理论盲区。生成未来研究方向建议。",
          inputSchema: {
            type: "object",
            properties: {
              mode1ResultPath: { type: "string", description: "Mode 1 分析结果 JSON 路径" },
              deepResearchDir: { type: "string", description: "DeepResearch 输出目录" },
              outputDir: { type: "string", description: "输出目录" },
            },
            required: ["mode1ResultPath", "deepResearchDir", "outputDir"],
          },
        },
        {
          name: "generate_causal_hints",
          description:
            "从截面相关数据中发现具有因果研究潜力的关联方向。评估因果可能性，指出混淆风险，建议后续验证方法。",
          inputSchema: {
            type: "object",
            properties: {
              mode1ResultPath: { type: "string", description: "Mode 1 分析结果 JSON 路径" },
              deepResearchDir: { type: "string", description: "DeepResearch 输出目录" },
              outputDir: { type: "string", description: "输出目录" },
            },
            required: ["mode1ResultPath", "deepResearchDir", "outputDir"],
          },
        },
        {
          name: "assess_sample_bias",
          description:
            "诊断问卷样本的各类偏差风险：选择偏差、无应答偏差、覆盖偏差、缺失模式偏差。评估偏差对研究结论的潜在影响。",
          inputSchema: {
            type: "object",
            properties: {
              mode1ResultPath: { type: "string", description: "Mode 1 分析结果 JSON 路径" },
              rawFile: { type: "string", description: "原始问卷数据文件（CSV/Excel）路径" },
              outputDir: { type: "string", description: "输出目录" },
            },
            required: ["mode1ResultPath", "rawFile", "outputDir"],
          },
        },
      ],
    },
  };

  protected async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult> {
    switch (name) {
      case "map_theories":
        return this._runPythonScript(
          "analysis_engine/theory_mapping.py",
          [args.mode1ResultPath as string, args.deepResearchDir as string, args.outputDir as string],
          name
        );
      case "generate_actionable_insights":
        return this._runPythonScript(
          "analysis_engine/generate_actionable_insights.py",
          [args.mode1ResultPath as string, args.deepResearchDir as string, args.outputDir as string],
          name
        );
      case "analyze_research_gaps":
        return this._runPythonScript(
          "analysis_engine/research_gap.py",
          [args.mode1ResultPath as string, args.deepResearchDir as string, args.outputDir as string],
          name
        );
      case "generate_causal_hints":
        return this._runPythonScript(
          "analysis_engine/causal_inference_hint.py",
          [args.mode1ResultPath as string, args.deepResearchDir as string, args.outputDir as string],
          name
        );
      case "assess_sample_bias":
        return this._runPythonScript(
          "analysis_engine/sample_bias_assessment.py",
          [args.mode1ResultPath as string, args.rawFile as string, args.outputDir as string],
          name
        );
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  private async _runPythonScript(
    scriptPath: string,
    args: string[],
    toolName: string
  ): Promise<ToolCallResult> {
    const result = await spawnPython(
      resolveScript(scriptPath),
      args,
      (msg) => this.reportProgress(msg)
    );

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: `${scriptPath} failed: ${result.error} — ${result.detail || ""}`,
          },
        ],
        isError: true,
      };
    }

    // 查找 JSON 输出文件路径（从 resultPaths 或 stdout 解析）
    const jsonPath = result.resultPaths.find((p) => p.endsWith(".json"));
    const reportPath = result.resultPaths.find((p) => p.endsWith(".md"));

    const data: Record<string, unknown> = {};
    if (jsonPath) {
      data.jsonPath = jsonPath;
      data.reportFile = jsonPath.split("/").pop() || jsonPath;
      // 设置语义化 key，与 AnalysisOrchestrator 中的 context.get() 对应
      const contextKey = this._getContextKey(toolName);
      if (contextKey) {
        data[contextKey] = jsonPath;
      }
    }
    if (reportPath) {
      data.reportPath = reportPath;
    }

    return {
      content: [
        { type: "json", data },
        {
          type: "text",
          text: `Insight generated. JSON: ${jsonPath || "none"}, Report: ${reportPath || "none"}`,
        },
      ],
      tokenUsage: result.tokenUsage,
    };
  }

  /** 将工具名映射为 AnalysisOrchestrator 中 context.get() 使用的 key */
  private _getContextKey(toolName: string): string {
    switch (toolName) {
      case "map_theories":
        return "theoryMapping";
      case "generate_actionable_insights":
        return "actionableInsights";
      case "analyze_research_gaps":
        return "researchGaps";
      case "generate_causal_hints":
        return "causalHints";
      case "assess_sample_bias":
        return "sampleBias";
      default:
        return "";
    }
  }
}
