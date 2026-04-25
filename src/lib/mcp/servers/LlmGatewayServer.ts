// ============================================
// LlmGatewayServer — LLM 网关 MCP Server
// 封装 llm_structure_analyzer.py + generic_llm_analysis.py
// 提供 LLM 驱动的问卷结构分析、文本洞察和综合报告生成
// ============================================

import { McpServer } from "../McpServer";
import type { ServerManifest, ToolCallResult } from "../protocol";
import { spawnPython, resolveScript } from "../spawnPython";
import fs from "fs/promises";

export class LlmGatewayServer extends McpServer {
  readonly manifest: ServerManifest = {
    name: "llm-gateway-server",
    version: "1.0.0",
    description:
      "LLM 网关服务：DeepSeek 驱动的问卷结构语义分析、逐题文本洞察和综合洞察报告生成",
    capabilities: {
      tools: [
        {
          name: "analyze_structure",
          description:
            "使用 DeepSeek LLM 对问卷列结构进行语义分类。识别每列的类型（demographic / single_choice / multi_select / likert / text / skip），并为 Likert 量表提供文本→分值的 value_map。输出可用于纠正规则引擎的语义盲区（如将高校名称误判为文本题）。",
          inputSchema: {
            type: "object",
            properties: {
              filePath: {
                type: "string",
                description: "CSV 或 Excel 文件的绝对路径",
              },
            },
            required: ["filePath"],
          },
        },
        {
          name: "run_llm_analysis",
          description:
            "对模式1统计分析结果运行 LLM 深度分析。包括：(1) 每道文本题的 LLM 主题/情感/洞察分析，(2) 基于全部数据的综合洞察报告。输出 Markdown 报告文件列表。",
          inputSchema: {
            type: "object",
            properties: {
              mode1ResultPath: {
                type: "string",
                description: "模式1 analyze_generic.py 输出的 JSON 文件路径",
              },
              outputDir: {
                type: "string",
                description: "报告输出目录（绝对路径）",
              },
            },
            required: ["mode1ResultPath", "outputDir"],
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
      case "analyze_structure":
        return this._analyzeStructure(args.filePath as string);
      case "run_llm_analysis":
        return this._runLlmAnalysis(
          args.mode1ResultPath as string,
          args.outputDir as string
        );
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  /** 调用 llm_structure_analyzer.py — LLM 语义分析问卷结构 */
  private async _analyzeStructure(filePath: string): Promise<ToolCallResult> {
    if (!filePath) {
      return {
        content: [
          { type: "text", text: "Missing required parameter: filePath" },
        ],
        isError: true,
      };
    }

    const result = await spawnPython(
      resolveScript("analysis_engine/llm_structure_analyzer.py"),
      [filePath]
    );

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: `LLM structure analysis failed: ${result.error} — ${result.detail || ""}`,
          },
        ],
        isError: true,
      };
    }

    // 输出格式: [PROGRESS] 行 ... + 最终 JSON。提取最后一个完整 JSON 对象。
    try {
      const jsonStart = result.stdout.lastIndexOf("\n{");
      const jsonEnd = result.stdout.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const jsonStr = result.stdout.slice(jsonStart + 1, jsonEnd + 1);
        const data = JSON.parse(jsonStr);
        return { content: [{ type: "json", data }] };
      }
      // 尝试将整个 stdout 作为 JSON 解析
      const data = JSON.parse(result.stdout);
      return { content: [{ type: "json", data }] };
    } catch {
      return {
        content: [
          {
            type: "text",
            text: "Failed to parse LLM structure analysis output as JSON",
          },
        ],
        isError: true,
      };
    }
  }

  /** 调用 generic_llm_analysis.py — LLM 文本洞察 + 综合报告 */
  private async _runLlmAnalysis(
    mode1ResultPath: string,
    outputDir: string
  ): Promise<ToolCallResult> {
    if (!mode1ResultPath || !outputDir) {
      return {
        content: [
          {
            type: "text",
            text: "Missing required parameters: mode1ResultPath and outputDir",
          },
        ],
        isError: true,
      };
    }

    const result = await spawnPython(
      resolveScript("analysis_engine/generic_llm_analysis.py"),
      [mode1ResultPath, outputDir]
    );

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: `LLM analysis failed: ${result.error} — ${result.detail || ""}`,
          },
        ],
        isError: true,
      };
    }

    // [RESULT] 行包含每个生成的报告文件路径
    // [DONE] 行包含报告清单 JSON
    const reports = result.resultPaths.map((p) => ({
      file: p.split("/").pop() || p,
      path: p,
    }));

    return {
      content: [
        { type: "json", data: { reports } },
        {
          type: "text",
          text: `LLM analysis complete. Generated ${reports.length} report(s).`,
        },
      ],
    };
  }
}
