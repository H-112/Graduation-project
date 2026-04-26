// ============================================
// Agent 层类型定义
// PipelineStep / SseEvent / AnalysisPhase
// ============================================

import type { AnalysisMode } from "../types";

/** 从 Skill .md frontmatter 解析出的技能定义 */
export interface SkillDefinition {
  name: string;
  displayName?: string;
  description: string;
  version: string;
  applicableModes: AnalysisMode[];
  dependencies: string[];
  mcpTools: McpToolRef[];
  tags: string[];
  /** 条件表达式：不满足时跳过执行 */
  when?: string;
  /** 输入参数 JSON Schema（声明式契约） */
  inputSchema?: Record<string, unknown>;
  /** Markdown body — 技能的 prompt 内容 */
  body: string;
}

/** 后端推送的步骤定义 */
export interface SkillLevelStep {
  name: string;
  displayName?: string;
  description: string;
}

/** 后端推送的层级结构 */
export type SkillLevels = SkillLevelStep[][];

/** Skill 中声明的 MCP 工具引用 */
export interface McpToolRef {
  server: string;
  tool: string;
  params: Record<string, string>;
}

/** DAG 中的一个节点 */
export interface PipelineStep {
  skillName: string;
  description: string;
  dependencies: string[];
}

/** SSE 事件 — 与前端 upload/page.tsx 的 EventSource 格式兼容 */
export interface SseEvent {
  type: "progress" | "result" | "error" | "done" | "log" | "skills";
  stage?: string;
  message?: string;
  success?: boolean;
  mode?: AnalysisMode;
  error?: string;
  detail?: string;
  fallbackResult?: Record<string, unknown>;
  resultPath?: string;
  resultUrl?: string;
  cleaning?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  llmReports?: Array<{ file: string; url: string }>;
  levels?: SkillLevels;
}

// ── Skill 输入/输出类型（原 ISkill.ts，现 Skill 改为 .md 文件）──

export interface SkillInput {
  filePath: string;
  outputDir: string;
  datasetName?: string;
  mode: AnalysisMode;
  crossAnalysis?: boolean;
  context: Record<string, unknown>;
}

export interface SkillOutput {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/** 分析阶段 */
export type AnalysisPhase =
  | "init"
  | "mode1"
  | "mode2"
  | "mode3"
  | "complete"
  | "error";
