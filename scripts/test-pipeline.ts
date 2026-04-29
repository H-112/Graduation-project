#!/usr/bin/env npx tsx
// ============================================
// 全流程测试模块
// 测试: 上传 → 分析 → SSE 进度 → 结果验证
// 测试文件: data/6.智能学习IDE插件需求调查-63.xlsx
// 用法:   npx tsx scripts/test-pipeline.ts [mode]
//         mode: quick_overview (默认) | ai_insights
// ============================================

import fs from "fs";
import path from "path";
import crypto from "crypto";

const BASE_URL = "http://localhost:3000";
const TEST_FILE = path.join(
  process.cwd(),
  "data",
  "6.智能学习IDE插件需求调查-63.xlsx"
);

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
const RESULTS_DIR = path.join(process.cwd(), "data", "results");

const MODE = (process.argv[2] || "quick_overview") as
  | "quick_overview"
  | "ai_insights"
  | "deep_research";

// ── 颜色输出 ──

const c = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

function log(prefix: string, msg: string, color = c.reset) {
  const time = new Date().toLocaleTimeString();
  console.log(`${c.dim}[${time}]${c.reset} ${color}${prefix}${c.reset} ${msg}`);
}

// ── Step 1: 准备测试文件 ──

function prepareTestFile(): string {
  log("📋", "Step 1: 准备测试文件...", c.bold);

  if (!fs.existsSync(TEST_FILE)) {
    console.error(`❌ 测试文件不存在: ${TEST_FILE}`);
    process.exit(1);
  }

  const testId = crypto.randomBytes(4).toString("hex");
  const ext = path.extname(TEST_FILE);
  const destName = `test_${testId}${ext}`;
  const destPath = path.join(UPLOADS_DIR, destName);

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.copyFileSync(TEST_FILE, destPath);

  log("📋", `测试文件已复制: ${destName}`, c.green);
  return destPath;
}

// ── Step 2: 触发分析 ──

async function triggerAnalysis(
  filePath: string
): Promise<{
  events: Array<Record<string, unknown>>;
  finalResult: Record<string, unknown> | null;
  errors: string[];
}> {
  log("🚀", `Step 2: 触发分析 (mode=${MODE})...`, c.bold);
  log("🚀", `文件: ${path.basename(filePath)}`, c.dim);

  const response = await fetch(`${BASE_URL}/api/analysis/trigger`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath,
      mode: MODE,
      datasetName: "智能学习插件需求调查 (测试)",
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`触发失败: ${err.error || response.statusText}`);
  }

  const events: Array<Record<string, unknown>> = [];
  let finalResult: Record<string, unknown> | null = null;
  const errors: string[] = [];

  // ── 读取 SSE 流 ──
  const reader = response.body?.getReader();
  if (!reader) throw new Error("无法读取 SSE 流");

  const decoder = new TextDecoder();
  let buffer = "";

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
        events.push(event);
        printEvent(event);

        if (event.type === "error") {
          errors.push(event.error || event.detail || "未知错误");
        }
        if (event.type === "result") {
          finalResult = event;
        }
      } catch {
        // 忽略非 JSON 行
      }
    }
  }

  return { events, finalResult, errors };
}

// ── 事件日志 ──

let phaseCount = 0;
const phaseTimes: Map<string, number> = new Map();
let currentPhase = "";

function printEvent(event: Record<string, unknown>) {
  const type = event.type as string;
  const stage = (event.stage as string) || "";
  const message = (event.message as string) || "";

  switch (type) {
    case "progress": {
      // 检测阶段切换
      if (stage && stage !== currentPhase && !stage.includes("running")) {
        if (currentPhase && phaseTimes.has(currentPhase)) {
          const duration = Date.now() - phaseTimes.get(currentPhase)!;
          log("⏱️", `${currentPhase} 耗时 ${(duration / 1000).toFixed(1)}s`, c.dim);
        }
        currentPhase = stage;
        phaseTimes.set(stage, Date.now());
        phaseCount++;
        console.log(""); // 空行分隔
      }
      const icon = stage.includes("Llm") ? "🤖" : "📊";
      log(`  ${icon}`, message, stage.includes("Llm") ? c.cyan : c.blue);
      break;
    }
    case "result": {
      log("✅", "分析完成!", c.green);
      const summary = event.summary as Record<string, unknown> | undefined;
      if (summary) {
        console.log(`     ├─ 记录数: ${summary.records}`);
        console.log(`     ├─ 字段数: ${summary.fields}`);
        console.log(`     ├─ 人口学维度: ${summary.demographics}`);
        console.log(`     ├─ 选择题: ${summary.usageItems}`);
        console.log(`     ├─ 量表组: ${summary.likertGroups}`);
        console.log(`     └─ 文本列: ${summary.textFields}`);
      }
      const llmReports = event.llmReports as
        | Array<{ file: string; url: string }>
        | undefined;
      if (llmReports && llmReports.length > 0) {
        console.log(`     LLM 报告: ${llmReports.length} 份`);
        for (const r of llmReports) {
          console.log(`       📄 ${r.file}`);
        }
      }
      break;
    }
    case "error": {
      log("❌", `${event.error}`, c.red);
      if (event.detail) {
        log("  ", `详情: ${event.detail}`, c.red);
      }
      if (event.fallbackResult) {
        log("  ", "有降级结果可用", c.yellow);
      }
      break;
    }
    case "done": {
      const totalTime = phaseTimes.size > 0
        ? Date.now() - Math.min(...Array.from(phaseTimes.values()))
        : 0;
      log("🏁", `流水线结束 (总耗时 ${(totalTime / 1000).toFixed(1)}s)`, c.bold);
      break;
    }
    case "log": {
      const level = (event.level as string) || "info";
      if (level === "stderr") {
        log("  ⚠️", message, c.yellow);
      }
      break;
    }
  }
}

// ── Step 3: 验证结果 ──

async function verifyResults(
  result: Record<string, unknown> | null,
  events: Array<Record<string, unknown>>
): Promise<boolean> {
  log("🔍", "Step 3: 验证结果...", c.bold);

  let pass = true;

  // 检查1: 有 result 事件
  if (!result || result.success !== true) {
    log("❌", "未收到 result 事件或 success 不为 true", c.red);
    pass = false;
  } else {
    log("✅", "收到 result 事件 (success=true)", c.green);
  }

  // 检查2: 有 resultUrl
  if (result?.resultUrl) {
    log("✅", `resultUrl: ${result.resultUrl}`, c.green);
  } else {
    log("❌", "缺少 resultUrl", c.red);
    pass = false;
  }

  // 检查3: 有 cleaning 信息
  if (result?.cleaning) {
    const cl = result.cleaning as Record<string, unknown>;
    log("✅", `数据清洗: ${cl.original_count}→${cl.final_count} (保留率 ${cl.retention_rate}%)`, c.green);
  }

  // 检查4: 有 summary
  if (result?.summary) {
    log("✅", "包含统计摘要", c.green);
  }

  // 检查5: 检查进度事件覆盖了所有 Phase 1 Skill
  const expectedSkills = MODE === "ai_insights"
    ? ["FileLoading", "LlmStructureAnalysis", "DescriptiveAnalysis", "LlmTextInsight", "LlmComprehensiveReport"]
    : MODE === "deep_research"
    ? ["FileLoading", "LlmStructureAnalysis", "DescriptiveAnalysis", "LlmTextInsight", "LlmComprehensiveReport", "DeepResearch"]
    : ["FileLoading", "LlmStructureAnalysis", "DescriptiveAnalysis"];

  const progressStages = new Set(
    events
      .filter((e) => e.type === "progress")
      .map((e) => e.stage as string)
      .filter(Boolean)
  );

  for (const skill of expectedSkills) {
    if (progressStages.has(skill)) {
      log("✅", `Skill 已执行: ${skill}`, c.green);
    } else {
      log("⚠️", `Skill 未检测到: ${skill} (可能被跳过或合并)`, c.yellow);
    }
  }

  // 检查6 (Mode 2): 验证 LLM 报告文件存在
  if (MODE === "ai_insights" && result?.llmReports) {
    const reports = result.llmReports as Array<{ file: string }>;
    log("✅", `LLM 报告: ${reports.length} 份`, c.green);
    for (const r of reports) {
      const reportPath = path.join(
        process.cwd(),
        "public",
        "llm-reports",
        r.file
      );
      if (fs.existsSync(reportPath)) {
        log("  ✅", `${r.file} (${(fs.statSync(reportPath).size / 1024).toFixed(1)} KB)`, c.green);
      } else {
        log("  ❌", `${r.file} 文件不存在`, c.red);
        pass = false;
      }
    }
  }

  // 检查6b (Mode 3): 验证深度研究报告存在
  if (MODE === "deep_research" && result?.deepResearchReport) {
    const drPath = result.deepResearchReport as string;
    if (fs.existsSync(drPath)) {
      const drStats = fs.statSync(drPath);
      log("✅", `深度研究报告: ${path.basename(drPath)} (${(drStats.size / 1024).toFixed(1)} KB)`, c.green);
    } else {
      log("❌", `深度研究报告不存在: ${drPath}`, c.red);
      pass = false;
    }
  }

  // 检查7: 验证分析结果 JSON 文件存在
  if (result?.resultPath) {
    const resultPath = result.resultPath as string;
    if (fs.existsSync(resultPath)) {
      const stats = fs.statSync(resultPath);
      log("✅", `结果文件: ${path.basename(resultPath)} (${(stats.size / 1024).toFixed(1)} KB)`, c.green);

      // 读取并验证结构
      const json = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
      log("  ├─", `dataset: ${json.dataset}`);
      log("  ├─", `total_records: ${json.total_records}`);
      log("  ├─", `demographics: ${Object.keys(json.demographics || {}).length} 项`);
      log("  ├─", `genai_usage: ${Object.keys(json.genai_usage || {}).length} 项`);
      log("  ├─", `likert_scales: ${Object.keys(json.likert_scales || {}).length} 组`);
      log("  └─", `text_analysis: ${Object.keys(json.text_analysis || {}).length} 项`);
    } else {
      log("❌", `结果文件不存在: ${resultPath}`, c.red);
      pass = false;
    }
  }

  return pass;
}

// ── 清理 ──

function cleanup(filePath: string) {
  try {
    fs.unlinkSync(filePath);
    log("🧹", `已清理测试文件: ${path.basename(filePath)}`, c.dim);
  } catch {
    // 忽略
  }
}

// ── Main ──

async function main() {
  console.log("");
  console.log(`${c.bold}${c.cyan}╔══════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.cyan}║  问卷分析系统 — 全流程测试          ║${c.reset}`);
  console.log(`${c.bold}${c.cyan}║  模式: ${MODE.padEnd(30)}║${c.reset}`);
  console.log(`${c.bold}${c.cyan}╚══════════════════════════════════════╝${c.reset}`);
  console.log("");

  const startTime = Date.now();
  const testFilePath = prepareTestFile();

  try {
    const { events, finalResult, errors } = await triggerAnalysis(testFilePath);

    const allPassed = await verifyResults(finalResult, events);

    console.log("");
    const totalTime = (Date.now() - startTime) / 1000;
    log("📊", `总事件: ${events.length}`, c.dim);
    log("📊", `总耗时: ${totalTime.toFixed(1)}s`, c.dim);

    if (errors.length > 0 && !finalResult) {
      // 全部失败
      log("❌", `测试失败! ${errors.length} 个错误`, c.red);
      process.exit(1);
    } else if (!allPassed) {
      log("⚠️", "部分验证未通过，请检查上述输出", c.yellow);
      process.exit(1);
    } else {
      log("🎉", "全流程测试通过!", c.green + c.bold);
    }

    cleanup(testFilePath);
  } catch (err) {
    log("💥", `测试异常: ${err instanceof Error ? err.message : String(err)}`, c.red);
    cleanup(testFilePath);
    process.exit(1);
  }
}

main();
