// ============================================
// History Manager — 上传和分析历史记录持久化
// 存储在 data/history.json，按时间倒序
// ============================================

import { readFile, writeFile, mkdir, rename } from "fs/promises";
import path from "path";
import { Mutex } from "async-mutex";

export interface HistoryRecord {
  id: string;
  type: "upload" | "analysis";
  datasetName: string;
  filePath: string;
  /** 分析结果 JSON 的 public URL（如 /data/results/xxx.json） */
  resultUrl?: string;
  /** 深度研究报告 URL */
  deepReportUrl?: string;
  /** LLM 报告文件名列表 */
  llmReports?: string[];
  /** 量表 LLM 分析报告文件名列表 */
  likertReports?: string[];
  /** 理论映射报告 URL */
  theoryMappingUrl?: string;
  /** 可操作建议报告 URL */
  actionableInsightsUrl?: string;
  /** 研究缺口报告 URL */
  researchGapsUrl?: string;
  /** 因果推断提示报告 URL */
  causalHintsUrl?: string;
  /** 样本偏差诊断报告 URL */
  sampleBiasUrl?: string;
  mode?: "quick_overview" | "ai_insights" | "deep_research";
  status: "completed" | "failed" | "pending";
  summary?: {
    records?: number;
    fields?: number;
    demographics?: number;
    usageItems?: number;
    likertGroups?: number;
    textFields?: number;
  };
  error?: string;
  /** 分析耗时（毫秒） */
  duration_ms?: number;
  /** API 调用次数（MCP 工具调用） */
  apiCalls?: number;
  /** LLM Token 用量统计 */
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  timestamp: string;
}

const HISTORY_FILE = path.join(process.cwd(), "data", "history.json");

/** 文件级互斥锁，防止并发读写 history.json 导致数据损坏 */
const historyMutex = new Mutex();

async function ensureFile(): Promise<void> {
  await mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  try {
    await readFile(HISTORY_FILE, "utf-8");
  } catch {
    await writeFile(HISTORY_FILE, JSON.stringify([], null, 2));
  }
}

export async function readHistory(): Promise<HistoryRecord[]> {
  await ensureFile();
  const raw = await readFile(HISTORY_FILE, "utf-8");
  try {
    return JSON.parse(raw) as HistoryRecord[];
  } catch {
    return [];
  }
}

async function writeHistory(records: HistoryRecord[]): Promise<void> {
  await historyMutex.runExclusive(async () => {
    await ensureFile();
    const tmpFile = HISTORY_FILE + ".tmp";
    await writeFile(tmpFile, JSON.stringify(records, null, 2));
    await rename(tmpFile, HISTORY_FILE); // 原子重命名
  });
}

/** 添加上传记录 */
export async function addUploadRecord(params: {
  id: string;
  datasetName: string;
  filePath: string;
}): Promise<HistoryRecord> {
  const records = await readHistory();
  const record: HistoryRecord = {
    id: params.id,
    type: "upload",
    datasetName: params.datasetName,
    filePath: params.filePath,
    status: "pending",
    timestamp: new Date().toISOString(),
  };
  records.unshift(record);
  await writeHistory(records);
  return record;
}

/** 添加分析完成记录（或更新已有上传记录） */
export async function addAnalysisRecord(params: {
  id: string;
  datasetName: string;
  filePath: string;
  resultUrl?: string;
  deepReportUrl?: string;
  llmReports?: string[];
  likertReports?: string[];
  theoryMappingUrl?: string;
  actionableInsightsUrl?: string;
  researchGapsUrl?: string;
  causalHintsUrl?: string;
  sampleBiasUrl?: string;
  mode: "quick_overview" | "ai_insights" | "deep_research";
  status: "completed" | "failed";
  summary?: HistoryRecord["summary"];
  error?: string;
  duration_ms?: number;
  apiCalls?: number;
  tokenUsage?: HistoryRecord["tokenUsage"];
}): Promise<HistoryRecord> {
  const records = await readHistory();

  // 查找是否已有同文件的上传记录，有则更新
  const existingIndex = records.findIndex(
    (r) => r.filePath === params.filePath && r.type === "upload"
  );

  const record: HistoryRecord = {
    id: params.id,
    type: "analysis",
    datasetName: params.datasetName,
    filePath: params.filePath,
    resultUrl: params.resultUrl,
    deepReportUrl: params.deepReportUrl,
    llmReports: params.llmReports,
    likertReports: params.likertReports,
    theoryMappingUrl: params.theoryMappingUrl,
    actionableInsightsUrl: params.actionableInsightsUrl,
    researchGapsUrl: params.researchGapsUrl,
    causalHintsUrl: params.causalHintsUrl,
    sampleBiasUrl: params.sampleBiasUrl,
    mode: params.mode,
    status: params.status,
    summary: params.summary,
    error: params.error,
    duration_ms: params.duration_ms,
    apiCalls: params.apiCalls,
    tokenUsage: params.tokenUsage,
    timestamp: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    // 更新已有记录为分析记录，保留原有位置（时间顺序）
    records[existingIndex] = record;
  } else {
    records.unshift(record);
  }

  await writeHistory(records);

  // 异步清理旧文件（不阻塞返回）
  cleanupOldFiles(records).catch(() => {});

  return record;
}

/** 清理旧的结果文件，防止磁盘无限增长 */
const MAX_HISTORY_RECORDS = 50; // 最多保留 50 条历史记录
const FILES_TO_CLEAN = [
  "resultUrl",
  "deepReportUrl",
  "theoryMappingUrl",
  "actionableInsightsUrl",
  "researchGapsUrl",
  "causalHintsUrl",
  "sampleBiasUrl",
] as const;

async function cleanupOldFiles(records: HistoryRecord[]): Promise<void> {
  if (records.length <= MAX_HISTORY_RECORDS) return;

  const { unlink } = await import("fs/promises");
  const toDelete = records.slice(MAX_HISTORY_RECORDS);

  for (const record of toDelete) {
    // 删除关联的上传文件
    if (record.filePath) {
      try { await unlink(record.filePath); } catch { /* ignore */ }
    }

    // 删除 public 目录下的结果文件
    for (const key of FILES_TO_CLEAN) {
      const url = record[key as keyof HistoryRecord] as string | undefined;
      if (!url) continue;
      try {
        const filePath = path.join(process.cwd(), "public", url);
        await unlink(filePath);
      } catch { /* ignore */ }
    }

    // 删除 LLM 报告文件
    if (record.llmReports) {
      for (const file of record.llmReports) {
        try {
          await unlink(path.join(process.cwd(), "public", "llm-reports", file));
        } catch { /* ignore */ }
      }
    }
    if (record.likertReports) {
      for (const file of record.likertReports) {
        try {
          await unlink(path.join(process.cwd(), "public", "llm-reports", file));
        } catch { /* ignore */ }
      }
    }
  }

  // 截断历史记录
  const trimmed = records.slice(0, MAX_HISTORY_RECORDS);
  await writeHistory(trimmed);
}

/** 获取分析历史（仅 type=analysis，按时间倒序） */
export async function getAnalysisHistory(): Promise<HistoryRecord[]> {
  const records = await readHistory();
  return records.filter((r) => r.type === "analysis");
}

/** 获取所有数据集（上传+预加载合并） */
export async function getAllDatasets(): Promise<
  Array<{
    id: string;
    title: string;
    description: string;
    records: number;
    fields: number;
    source: string;
    resultUrl?: string;
    deepReportUrl?: string;
    llmReports?: string[];
    likertReports?: string[];
    theoryMappingUrl?: string;
    actionableInsightsUrl?: string;
    researchGapsUrl?: string;
    causalHintsUrl?: string;
    sampleBiasUrl?: string;
    timestamp: string;
  }>
> {
  const records = await readHistory();

  const dynamic = records
    .filter((r) => r.type === "analysis" && r.status === "completed")
    .map((r) => ({
      id: r.id,
      title: r.datasetName || "未命名数据集",
      description: `${r.mode === "deep_research" ? "深度研究" : r.mode === "ai_insights" ? "AI洞察" : "快速概览"} · ${r.summary?.records ?? 0} 份 · ${new Date(r.timestamp).toLocaleString("zh-CN")}`,
      records: r.summary?.records ?? 0,
      fields: r.summary?.fields ?? 0,
      source: "用户上传",
      resultUrl: r.resultUrl,
      deepReportUrl: r.deepReportUrl,
      llmReports: r.llmReports,
      likertReports: r.likertReports,
      theoryMappingUrl: r.theoryMappingUrl,
      actionableInsightsUrl: r.actionableInsightsUrl,
      researchGapsUrl: r.researchGapsUrl,
      causalHintsUrl: r.causalHintsUrl,
      sampleBiasUrl: r.sampleBiasUrl,
      timestamp: r.timestamp,
    }));

  return dynamic;
}
