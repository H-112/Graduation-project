// ============================================
// MCP Client — 进程内服务器注册中心 + 工具调用
// 每个 MCP Server 注册后，通过 JSON-RPC 协议调用其工具
// ============================================

import type { ToolManifest, ToolCallResult, JsonRpcRequest } from "./protocol";
import { McpServer } from "./McpServer";

export interface ToolInfo {
  server: string;
  tool: ToolManifest;
}

export class McpClient {
  private servers: Map<string, McpServer> = new Map();

  /** 注册一个 MCP Server */
  register(server: McpServer): void {
    const name = server.manifest.name;
    if (this.servers.has(name)) {
      console.warn(`[McpClient] Server "${name}" already registered, replacing...`);
    }
    this.servers.set(name, server);
  }

  /** 移除一个 MCP Server */
  unregister(name: string): boolean {
    return this.servers.delete(name);
  }

  /** 获取已注册的 Server */
  getServer(name: string): McpServer | undefined {
    return this.servers.get(name);
  }

  /** 列出所有已注册 Server 的全部工具 */
  listAllTools(): ToolInfo[] {
    const result: ToolInfo[] = [];
    for (const server of this.servers.values()) {
      for (const tool of server.manifest.capabilities.tools) {
        result.push({ server: server.manifest.name, tool });
      }
    }
    return result;
  }

  /** 列出指定 Server 的工具 */
  listServerTools(serverName: string): ToolManifest[] {
    const server = this.servers.get(serverName);
    return server?.manifest.capabilities.tools ?? [];
  }

  /**
   * 调用指定 Server 的指定工具
   * @param serverName MCP Server 名称
   * @param toolName 工具名称
   * @param args 工具参数
   * @param onProgress 可选进度回调（用于 SSE 实时推送）
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    onProgress?: (msg: string) => void
  ): Promise<ToolCallResult> {
    const server = this.servers.get(serverName);
    if (!server) {
      return {
        content: [{ type: "text", text: `MCP Server not found: "${serverName}"` }],
        isError: true,
      };
    }

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };

    const response = await server.handleRequest(request);

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
