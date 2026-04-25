// ============================================
// MCP Server 抽象基类
// 每个 MCP Server 继承此类，实现 executeTool 方法
// ============================================

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  ServerManifest,
  ToolCallResult,
} from "./protocol";
import { jsonRpcOk, jsonRpcErr, JSON_RPC_ERRORS, MCP_METHODS } from "./protocol";

export abstract class McpServer {
  /** 服务器清单 — 描述能力和提供的工具 */
  abstract readonly manifest: ServerManifest;

  private _progressCb?: (msg: string) => void;

  /** 设置进度回调（由 McpClient.callTool 注入） */
  setProgressCallback(cb?: (msg: string) => void): void {
    this._progressCb = cb;
  }

  /** 子类在执行工具时调用，将进度消息回传至 SSE */
  protected reportProgress(msg: string): void {
    this._progressCb?.(msg);
  }

  // ── 核心协议路由 ──

  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const { id, method } = request;

    switch (method) {
      case MCP_METHODS.INITIALIZE:
        return this._initialize(id);
      case MCP_METHODS.TOOLS_LIST:
        return this._listTools(id);
      case MCP_METHODS.TOOLS_CALL:
        return this._callTool(id, request.params as {
          name: string;
          arguments: Record<string, unknown>;
        });
      default:
        return jsonRpcErr(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${method}`);
    }
  }

  // ── 抽象方法：子类实现具体的工具执行逻辑 ──

  protected abstract executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolCallResult>;

  // ── 内置协议方法 ──

  private _initialize(id: number | string): JsonRpcResponse {
    return jsonRpcOk(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: {
        name: this.manifest.name,
        version: this.manifest.version,
      },
    });
  }

  private _listTools(id: number | string): JsonRpcResponse {
    return jsonRpcOk(id, {
      tools: this.manifest.capabilities.tools,
    });
  }

  private async _callTool(
    id: number | string,
    params: { name: string; arguments: Record<string, unknown> }
  ): Promise<JsonRpcResponse> {
    const { name, arguments: args } = params || {};
    if (!name) {
      return jsonRpcErr(id, JSON_RPC_ERRORS.INVALID_PARAMS, "Missing tool name");
    }

    // 验证工具是否存在于 manifest
    const toolDef = this.manifest.capabilities.tools.find(t => t.name === name);
    if (!toolDef) {
      return jsonRpcErr(
        id,
        JSON_RPC_ERRORS.TOOL_NOT_FOUND,
        `Tool not found in server "${this.manifest.name}": ${name}`
      );
    }

    try {
      const result = await this.executeTool(name, args || {});
      return jsonRpcOk(id, result);
    } catch (err) {
      return jsonRpcErr(
        id,
        JSON_RPC_ERRORS.TOOL_EXECUTION_ERROR,
        `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
        { tool: name }
      );
    }
  }
}
