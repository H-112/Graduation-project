// ============================================
// MCP 协议类型定义 — JSON-RPC 2.0 + MCP Domain Types
// Model Context Protocol 的 TypeScript 实现
// ============================================

// ── JSON-RPC 2.0 Core Types ──

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ── JSON-RPC Error Codes ──

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TOOL_NOT_FOUND: -32602,
  TOOL_EXECUTION_ERROR: -32000,
} as const;

// ── MCP Domain Types ──

/** 工具清单条目 — 描述一个可调用的工具 */
export interface ToolManifest {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      items?: { type: string };
    }>;
    required?: string[];
  };
}

/** MCP Server 清单 — 描述服务器的能力和提供的工具 */
export interface ServerManifest {
  name: string;
  version: string;
  description: string;
  capabilities: {
    tools: ToolManifest[];
  };
}

/** 工具调用请求 */
export interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

/** 工具调用结果 — MCP content[] 格式 */
export interface ToolCallResult {
  content: Array<{
    type: "text" | "json" | "file";
    text?: string;
    data?: unknown;
    path?: string;
  }>;
  isError?: boolean;
}

// ── MCP 传输层抽象 ──

/** MCP 传输层接口 — 支持 in-process / stdio / HTTP 等多种传输 */
export interface IMcpTransport {
  send(request: JsonRpcRequest): Promise<JsonRpcResponse>;
}

// ── MCP 标准方法名 ──

export const MCP_METHODS = {
  INITIALIZE: "initialize",
  INITIALIZED: "notifications/initialized",
  TOOLS_LIST: "tools/list",
  TOOLS_CALL: "tools/call",
} as const;

// ── Helper: 构建标准 JSON-RPC 响应 ──

export function jsonRpcOk(id: number | string, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcErr(
  id: number | string,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}
