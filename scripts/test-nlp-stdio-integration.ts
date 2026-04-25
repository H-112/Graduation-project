#!/usr/bin/env npx tsx
// ============================================
// 集成测试：验证 stdio NlpServer 在 PipelineExecutor 中的调用链路
// 直接运行 quick_overview 模式，确认 NlpKeywordExtraction skill 被正确执行
// ============================================

import path from "path";
import { AnalysisOrchestrator } from "../src/lib/agent/AnalysisOrchestrator";

const TEST_FILE = path.join(
  process.cwd(),
  "data",
  "304937068_按文本_智能学习插件需求调查_63_63.xlsx"
);

async function main() {
  console.log("[IntegrationTest] Starting...");
  console.log("[IntegrationTest] Test file:", path.basename(TEST_FILE));

  const orchestrator = new AnalysisOrchestrator();

  // 初始化（注册 stdio server + 加载 skills）
  const skillCount = await orchestrator.initialize();
  console.log(`[IntegrationTest] Loaded ${skillCount} skills`);

  // 运行 quick_overview 模式
  console.log("[IntegrationTest] Running quick_overview...");
  const startTime = Date.now();

  const response = await orchestrator.run(
    TEST_FILE,
    "quick_overview",
    "stdio NLP 集成测试"
  );

  // 读取 SSE 流
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No SSE body");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let nlpKeywordExtractionFound = false;
  let nlpKeywordExtractionSuccess = false;
  let finalResult: Record<string, unknown> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const jsonStr = trimmed.slice(6);
      try {
        const event = JSON.parse(jsonStr);

        // 检测 NlpKeywordExtraction 阶段
        if (event.stage === "NlpKeywordExtraction") {
          nlpKeywordExtractionFound = true;
          if (event.message?.includes("完成")) {
            nlpKeywordExtractionSuccess = true;
          }
          console.log(`[SSE] ${event.message}`);
        }

        // 收集最终结果
        if (event.type === "result") {
          finalResult = event;
        }
      } catch {
        // ignore
      }
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log(`[IntegrationTest] Total duration: ${duration.toFixed(1)}s`);

  // 验证
  console.log("");
  console.log("=== 验证结果 ===");

  if (nlpKeywordExtractionFound) {
    console.log("✅ NlpKeywordExtraction skill 已执行");
  } else {
    console.log("❌ NlpKeywordExtraction skill 未执行");
  }

  if (nlpKeywordExtractionSuccess) {
    console.log("✅ NlpKeywordExtraction skill 执行成功");
  } else if (nlpKeywordExtractionFound) {
    console.log("⚠️ NlpKeywordExtraction skill 执行失败或被跳过");
  }

  if (finalResult) {
    console.log("✅ 收到最终结果");
    const result = finalResult;
    console.log(`   resultUrl: ${result.resultUrl}`);
    console.log(`   summary: ${JSON.stringify(result.summary)}`);
  } else {
    console.log("❌ 未收到最终结果");
  }

  if (nlpKeywordExtractionFound && nlpKeywordExtractionSuccess && finalResult) {
    console.log("");
    console.log("🎉 stdio NLP Server 集成测试通过!");
    process.exit(0);
  } else {
    console.log("");
    console.log("❌ 测试未完全通过");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[IntegrationTest] Failed:", err);
  process.exit(1);
});
