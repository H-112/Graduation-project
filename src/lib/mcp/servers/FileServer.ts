// ============================================
// FileServer — 文件操作 MCP Server
// 封装 preview_file.py，提供文件预览工具
// ============================================

import { McpServer } from "../McpServer";
import type { ServerManifest, ToolCallResult } from "../protocol";
import { spawnPython, resolveScript } from "../spawnPython";

export class FileServer extends McpServer {
  readonly manifest: ServerManifest = {
    name: "file-server",
    version: "1.0.0",
    description: "文件操作服务：预览 CSV/Excel 文件内容",
    capabilities: {
      tools: [
        {
          name: "preview_file",
          description:
            "预览 CSV 或 Excel 文件，返回表头、前 5 行数据以及总行数。支持 .csv / .xlsx / .xls 格式。",
          inputSchema: {
            type: "object",
            properties: {
              filePath: {
                type: "string",
                description: "文件的绝对路径",
              },
            },
            required: ["filePath"],
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
      case "preview_file":
        return this._previewFile(args.filePath as string);
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  private async _previewFile(filePath: string): Promise<ToolCallResult> {
    if (!filePath) {
      return {
        content: [
          { type: "text", text: "Missing required parameter: filePath" },
        ],
        isError: true,
      };
    }

    const result = await spawnPython(
      resolveScript("analysis_engine/preview_file.py"),
      [filePath]
    );

    if (!result.success) {
      return {
        content: [
          {
            type: "text",
            text: `File preview failed: ${result.error} — ${result.detail || ""}`,
          },
        ],
        isError: true,
      };
    }

    try {
      const data = JSON.parse(result.stdout);
      return { content: [{ type: "json", data }] };
    } catch {
      return {
        content: [
          { type: "text", text: "Failed to parse preview output as JSON" },
        ],
        isError: true,
      };
    }
  }
}
