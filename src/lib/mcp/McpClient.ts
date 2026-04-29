// ============================================
// MCP Client — 进程内服务器注册中心 + stdio 服务器连接器
// 支持两种模式：
//   1. 进程内（in-process）：直接调用 McpServer 实例
//   2. stdio：通过官方 SDK 启动独立进程并通信
// ============================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import crypto from "crypto";
import type { ToolManifest, ToolCallResult, JsonRpcRequest } from "./protocol";
import { McpServer } from "./McpServer";

export interface ToolInfo {
  server: string;
  tool: ToolManifest;
}

export interface StdioServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export class McpClient {
  private servers: Map<string, McpServer> = new Map();
  private stdioClients: Map<string, Client> = new Map();
  private stdioTransports: Map<string, StdioClientTransport> = new Map();

  /** 注册一个进程内 MCP Server */
  register(server: McpServer): void {
    const name = server.manifest.name;
    if (this.servers.has(name)) {
      console.warn(`[McpClient] Server "${name}" already registered, replacing...`);
    }
    this.servers.set(name, server);
  }

  /** 注册一个 stdio MCP Server（启动独立子进程） */
  async registerStdio(config: StdioServerConfig): Promise<void> {
    const { name, command, args = [], env } = config;

    if (this.stdioClients.has(name)) {
      console.warn(`[McpClient] stdio Server "${name}" already registered, closing previous...`);
      await this._closeStdio(name);
    }

    const transport = new StdioClientTransport({
      command,
      args,
      env,
      stderr: "inherit",
    });

    const client = new Client(
      { name: "app-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.stdioClients.set(name, client);
    this.stdioTransports.set(name, transport);

    console.log(`[McpClient] stdio Server "${name}" connected (pid=${transport.pid ?? "?"})`);
  }

  private async _closeStdio(name: string): Promise<void> {
    const client = this.stdioClients.get(name);
    const transport = this.stdioTransports.get(name);
    try {
      await client?.close();
    } catch (err) {
      console.warn(`[McpClient] Error closing stdio client "${name}": ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await transport?.close();
    } catch (err) {
      console.warn(`[McpClient] Error closing stdio transport "${name}": ${err instanceof Error ? err.message : String(err)}`);
    }
    this.stdioClients.delete(name);
    this.stdioTransports.delete(name);
  }

  /** 列出所有已注册 Server 的全部工具（进程内 + stdio） */
  async listAllTools(): Promise<ToolInfo[]> {
    const result: ToolInfo[] = [];

    // 进程内 Server
    for (const server of this.servers.values()) {
      for (const tool of server.manifest.capabilities.tools) {
        result.push({ server: server.manifest.name, tool });
      }
    }

    // stdio Server
    for (const [name, client] of this.stdioClients) {
      try {
        const tools = await client.listTools();
        for (const tool of tools.tools) {
          result.push({
            server: name,
            tool: {
              name: tool.name,
              description: tool.description ?? "",
              inputSchema: tool.inputSchema as ToolManifest["inputSchema"],
            },
          });
        }
      } catch (err) {
        console.warn(`[McpClient] Failed to list tools from stdio server "${name}":`, err);
      }
    }

    return result;
  }

  /**
   * 调用指定 Server 的指定工具
   * 自动根据 server 类型路由到进程内或 stdio
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    onProgress?: (msg: string) => void
  ): Promise<ToolCallResult> {
    // ── stdio 路由 ──
    if (this.stdioClients.has(serverName)) {
      const client = this.stdioClients.get(serverName)!;
      try {
        const result = await client.callTool({
          name: toolName,
          arguments: args,
        });

        // 官方 SDK 结果 → 自定义 ToolCallResult 格式转换
        // callTool 返回类型含 [x: string]: unknown，需显式断言 content 结构
        const rawContent = result.content as Array<{
          type: string;
          text?: string;
          mimeType?: string;
        }>;

        const content: ToolCallResult["content"] = rawContent.map((item) => {
          if (item.type === "text") {
            return { type: "text", text: item.text ?? "" };
          }
          if (item.type === "image") {
            return { type: "text", text: `[Image: ${item.mimeType ?? "?"}]` };
          }
          // 其他类型（resource 等）统一序列化
          return { type: "text", text: JSON.stringify(item) };
        });

        return {
          content,
          isError: !!result.isError,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text",
              text: `Tool "${toolName}" error via stdio: ${errMsg}`,
            },
          ],
          isError: true,
        };
      }
    }

    // ── 进程内路由（原有逻辑）──
    const server = this.servers.get(serverName);
    if (!server) {
      return {
        content: [{ type: "text", text: `MCP Server not found: "${serverName}"` }],
        isError: true,
      };
    }

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };

    const response = await server.handleRequest(request, onProgress);

    if (response.error) {
      return {
        content: [
          {
            type: "text",
            text: `Tool "${toolName}" error: ${response.error.message}`,
          },
        ],
        isError: true,
      };
    }

    return response.result as ToolCallResult;
  }
}

/** 全局单例 — 应用生命周期内共享同一个 MCP 客户端 */
export const mcpClient = new McpClient();
