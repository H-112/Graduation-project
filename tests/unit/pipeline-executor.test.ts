/**
 * 安全表达式求值器单元测试
 * 验证 _evaluateWhen 在不使用 new Function/eval 的情况下正确求值
 */
import { describe, it, expect } from "vitest";
import { AnalysisContext } from "@/lib/agent/AnalysisContext";
import { PipelineExecutor } from "@/lib/agent/PipelineExecutor";
import { SkillRegistry } from "@/lib/agent/SkillRegistry";
import { ProgressEmitter } from "@/lib/agent/ProgressEmitter";
import type { SkillInput } from "@/lib/agent/types";

const mockMcpClient = {
  callTool: async () => ({ content: [], isError: false }),
  listAllTools: async () => [],
} as any;

function createExecutor() {
  return new PipelineExecutor(
    new SkillRegistry(),
    new AnalysisContext(),
    mockMcpClient,
    {
      log: () => {},
      progress: () => {},
      phaseStart: () => {},
      phaseComplete: () => {},
      phaseError: () => {},
      error: () => {},
      done: () => {},
      result: () => {},
      skills: () => {},
    } as unknown as ProgressEmitter
  );
}

describe("PipelineExecutor._evaluateWhen", () => {
  it("should evaluate >= comparison correctly", () => {
    const executor = createExecutor();
    const ctx = new AnalysisContext();
    ctx.set("total_records", 50);
    (executor as any).context = ctx;

    const result = (executor as any)._evaluateWhen(
      "$context.total_records >= 30",
      { mode: "deep_research", filePath: "", outputDir: "", datasetName: "" } as SkillInput
    );
    expect(result).toBe(true);

    const result2 = (executor as any)._evaluateWhen(
      "$context.total_records >= 100",
      { mode: "deep_research", filePath: "", outputDir: "", datasetName: "" } as SkillInput
    );
    expect(result2).toBe(false);
  });

  it("should evaluate tru thy checks", () => {
    const executor = createExecutor();
    const ctx = new AnalysisContext();
    ctx.set("has_text_fields", true);
    (executor as any).context = ctx;
    const result = (executor as any)._evaluateWhen(
      "$context.has_text_fields",
      { mode: "ai_insights", filePath: "", outputDir: "", datasetName: "" } as SkillInput
    );
    expect(result).toBe(true);
  });

  it("should evaluate undefined as false", () => {
    const executor = createExecutor();
    const ctx = new AnalysisContext();
    (executor as any).context = ctx;
    const result = (executor as any)._evaluateWhen(
      "$context.non_existent",
      { mode: "quick_overview", filePath: "", outputDir: "", datasetName: "" } as SkillInput
    );
    expect(result).toBe(false);
  });

  it("should fail-open (return true) on malformed expression", () => {
    const executor = createExecutor();
    const ctx = new AnalysisContext();
    (executor as any).context = ctx;
    const result = (executor as any)._evaluateWhen(
      "))(malicious",
      { mode: "quick_overview", filePath: "", outputDir: "", datasetName: "" } as SkillInput
    );
    expect(result).toBe(true);
  });
});
