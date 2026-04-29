// ============================================
// Analysis Cache — 分析结果缓存
// 基于文件内容 SHA256 哈希 + 分析模式进行缓存
// 避免重复分析同一文件，节省计算资源和 API 费用
// ============================================

import { createHash } from "crypto";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import path from "path";
import type { AnalysisMode } from "./types";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

export interface CachedAnalysis {
  fileHash: string;
  mode: AnalysisMode;
  timestamp: string;
  resultUrl?: string;
  deepReportUrl?: string;
  llmReports?: string[];
  likertReports?: string[];
  theoryMappingUrl?: string;
  actionableInsightsUrl?: string;
  researchGapsUrl?: string;
  causalHintsUrl?: string;
  sampleBiasUrl?: string;
  summary?: {
    records?: number;
    fields?: number;
    demographics?: number;
    usageItems?: number;
    likertGroups?: number;
    textFields?: number;
  };
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** 计算文件内容的 SHA256 哈希 */
export async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function getCachePath(fileHash: string, mode: AnalysisMode): string {
  return path.join(CACHE_DIR, `${fileHash}-${mode}.json`);
}

/** 检查缓存是否存在 */
export async function getCachedAnalysis(
  fileHash: string,
  mode: AnalysisMode
): Promise<CachedAnalysis | null> {
  const cachePath = getCachePath(fileHash, mode);
  try {
    await access(cachePath);
    const raw = await readFile(cachePath, "utf-8");
    return JSON.parse(raw) as CachedAnalysis;
  } catch {
    return null;
  }
}

/** 写入缓存 */
export async function setCachedAnalysis(
  fileHash: string,
  mode: AnalysisMode,
  data: Omit<CachedAnalysis, "fileHash" | "mode" | "timestamp">
): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const cachePath = getCachePath(fileHash, mode);
  const cache: CachedAnalysis = {
    fileHash,
    mode,
    timestamp: new Date().toISOString(),
    ...data,
  };
  await writeFile(cachePath, JSON.stringify(cache, null, 2));
}

/** 清除所有缓存 */
export async function clearCache(): Promise<void> {
  const { readdir, unlink } = await import("fs/promises");
  try {
    const entries = await readdir(CACHE_DIR);
    await Promise.all(
      entries.map((entry) => unlink(path.join(CACHE_DIR, entry)))
    );
  } catch {
    // 目录可能不存在，忽略错误
  }
}
