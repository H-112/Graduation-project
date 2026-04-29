// ============================================
// StatsServer — 统计分析 MCP Server
// 封装 analyze_generic.py，提供数据集分析工具
// ============================================

import { McpServer } from "../McpServer";
import type { ServerManifest, ToolCallResult } from "../protocol";
import { spawnPython, resolveScript } from "../spawnPython";
import fs from "fs/promises";

export class StatsServer extends McpServer {
  readonly manifest: ServerManifest = {
    name: "stats-server",
    version: "1.0.0",
    description:
      "统计分析服务：自动检测题型、数据清洗、描述性统计、Likert 量表、多选题、文本 NLP 分析",
    capabilities: {
      tools: [
        {
          name: "analyze_dataset",
          description:
            "对问卷数据集运行完整的模式1统计分析流水线：数据清洗 → 题型检测 → 人口学分布 → 选择题统计 → Likert 量表分析 → 多选题分析 → 中文文本 NLP 分析。可选接收 LLM 结构分类映射以纠正规则引擎的语义盲区。",
          inputSchema: {
            type: "object",
            properties: {
              filePath: {
                type: "string",
                description: "CSV 或 Excel 文件的绝对路径",
              },
              outputDir: {
                type: "string",
                description: "分析结果 JSON 的输出目录（绝对路径）",
              },
              llmMap: {
                type: "string",
                description:
                  "可选。LLM 结构分类 JSON 的文件路径或 JSON 字符串，用于纠正规则引擎的题型判定",
              },
              datasetName: {
                type: "string",
                description: "可选。数据集的展示名称，覆盖文件名的 stem",
              },
              crossAnalysis: {
                type: "boolean",
                description: "可选。是否启用 LLM-guided 交叉分析（模式2/3 默认开启）",
              },
            },
            required: ["filePath", "outputDir"],
          },
        },
      ],
    },
  };

  protected async executeTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ToolCallResult> {
    switch (name) {
      case "analyze_dataset":
        return this._analyzeDataset(
          args.filePath as string,
          args.outputDir as string,
          args.llmMap as string | undefined,
          args.datasetName as string | undefined,
          args.crossAnalysis as boolean | undefined,
          signal
        );
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  private async _analyzeDataset(
    filePath: string,
    outputDir: string,
    llmMap?: string,
    datasetName?: string,
    crossAnalysis?: boolean,
    signal?: AbortSignal
  ): Promise<ToolCallResult> {
    if (!filePath || !outputDir) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required parameters: filePath and outputDir",
          },
        ],
        isError: true,
      };
    }

    const args = [filePath, outputDir];
    if (llmMap) args.push("--llm-map", llmMap);
    if (datasetName) args.push("--dataset-name", datasetName);
    if (crossAnalysis) args.push("--cross-analysis");

    const result = await spawnPython(
      resolveScript("analysis_engine/analyze_generic.py"),
      args,
      undefined,
      undefined,
      signal
    );

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: `Statistical analysis failed: ${result.error} — ${result.detail || ""}`,
          },
        ],
        isError: true,
      };
    }

    // 分析结果写入 [RESULT] 标记的文件路径
    const resultPath =
      result.resultPaths.find((p) => p.endsWith("_analysis.json")) ||
      result.resultPaths[0];

    if (!resultPath) {
      return {
        content: [
          {
            type: "text",
            text: "Analysis completed but no result file path found in output",
          },
        ],
        isError: true,
      };
    }

    try {
      const jsonStr = await fs.readFile(resultPath, "utf-8");
      const data = JSON.parse(jsonStr);
      return {
        content: [
          { type: "json", data },
          { type: "text", text: resultPath },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to read analysis result: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }
  }
}
