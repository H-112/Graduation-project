// ============================================
// DeepResearchServer — Mode 3 深度研究 MCP Server
// 封装 deep_research.py，执行五轮探索循环
// ============================================

import { McpServer } from "../McpServer";
import type { ServerManifest, ToolCallResult } from "../protocol";
import { spawnPython, resolveScript } from "../spawnPython";

export class DeepResearchServer extends McpServer {
  readonly manifest: ServerManifest = {
    name: "deep-research-server",
    version: "1.0.0",
    description:
      "深度研究服务：执行五轮探索循环（人口学交叉分析 → 量表群体差异 → 开放题深度挖掘 → 关联规则挖掘 → LLM 综合洞察）",
    capabilities: {
      tools: [
        {
          name: "run_deep_research",
          description:
            "运行 Mode 3 深度研究 Agent。基于 Mode 1 分析结果和原始数据，执行五轮探索循环，最终生成深度研究报告。",
          inputSchema: {
            type: "object",
            properties: {
              inputJson: {
                type: "string",
                description: "Mode 1 分析结果 JSON 文件的绝对路径",
              },
              rawFile: {
                type: "string",
                description: "原始问卷数据文件（CSV/Excel）的绝对路径",
              },
              outputDir: {
                type: "string",
                description: "深度研究报告的输出目录（绝对路径）",
              },
            },
            required: ["inputJson", "rawFile", "outputDir"],
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
      case "run_deep_research":
        return this._runDeepResearch(
          args.inputJson as string,
          args.rawFile as string,
          args.outputDir as string
        );
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  private async _runDeepResearch(
    inputJson: string,
    rawFile: string,
    outputDir: string
  ): Promise<ToolCallResult> {
    if (!inputJson || !rawFile || !outputDir) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required parameters: inputJson, rawFile, outputDir",
          },
        ],
        isError: true,
      };
    }

    const result = await spawnPython(
      resolveScript("analysis_engine/deep_research.py"),
      [inputJson, rawFile, outputDir],
      (msg) => this.reportProgress(msg)
    );

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Deep research failed: ${result.error} — ${result.detail || ""}`,
          },
        ],
        isError: true,
      };
    }

    const reportPath =
      result.resultPaths.find((p) => p.endsWith("_report.md")) ||
      result.resultPaths[0];

    if (!reportPath) {
      return {
        content: [
          {
            type: "text",
            text: "Deep research completed but no report path found",
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        { type: "text", text: reportPath },
        { type: "json", data: { deepResearchReport: reportPath } },
      ],
      tokenUsage: result.tokenUsage,
    };
  }
}
