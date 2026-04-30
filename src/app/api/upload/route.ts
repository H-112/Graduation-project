import { NextRequest, NextResponse } from "next/server";
import { createWriteStream, createReadStream } from "fs";
import { mkdir } from "fs/promises";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import path from "path";
import crypto from "crypto";
import { addUploadRecord, readHistory } from "@/lib/history";
import { computeFileHash, getCachedAnalysis } from "@/lib/cache";
import { checkUploadLimit } from "@/lib/rate-limiter";
import type { AnalysisMode } from "@/lib/types";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const RESULTS_DIR = path.join(process.cwd(), "data", "results");
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface ExistingAnalysis {
  id: string;
  mode: AnalysisMode;
  timestamp: string;
  resultUrl?: string;
}

/** 验证文件 magic number（防止伪装扩展名的恶意文件） */
function validateMagicNumber(header: Buffer, ext: string): boolean {
  // CSV 文件：通常以文本开头，检查是否包含二进制数据
  if (ext === ".csv") {
    // 检查是否全为文本字符（允许 BOM）
    const textChars = header.toString("utf-8");
    // 如果前8个字节都是可打印字符或空白，认为是文本文件
    for (const byte of header) {
      if (byte === 0x00) return false; // 包含 null 字节，不是纯文本
    }
    return true;
  }

  // Excel .xlsx (ZIP 格式，以 PK 开头)
  if (ext === ".xlsx") {
    return header[0] === 0x50 && header[1] === 0x4B; // PK
  }

  // Excel .xls (OLE2 Compound Document)
  if (ext === ".xls") {
    return (
      header[0] === 0xD0 &&
      header[1] === 0xCF &&
      header[2] === 0x11 &&
      header[3] === 0xE0
    );
  }

  return true;
}

export async function POST(request: NextRequest) {
  // 限流检查
  const limitError = await checkUploadLimit(request);
  if (limitError) return limitError;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "未上传文件" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (![".csv", ".xlsx", ".xls"].includes(ext)) {
      return NextResponse.json(
        { error: "仅支持 CSV 和 Excel (.xlsx/.xls) 文件" },
        { status: 400 }
      );
    }

    // MIME 类型验证
    const validMimeTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream", // 某些系统可能将 Excel 识别为 octet-stream
    ];
    if (!validMimeTypes.includes(file.type) && file.type !== "") {
      return NextResponse.json(
        { error: `不支持的文件类型: ${file.type}` },
        { status: 400 }
      );
    }

    // 文件大小检查（使用 File.size，无需读取内容）
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `文件过大（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` },
        { status: 413 }
      );
    }

    // 用随机 ID 作为文件名（短名，避免长 URL 和中文编码问题）
    const id = crypto.randomBytes(6).toString("hex");
    const safeName = `${id}${ext}`;

    await mkdir(UPLOAD_DIR, { recursive: true });
    await mkdir(RESULTS_DIR, { recursive: true });

    const filepath = path.join(UPLOAD_DIR, safeName);

    // 流式写入：将 Web Stream 直接管道到文件，避免全量载入内存
    const fileStream = file.stream();
    const nodeStream = Readable.fromWeb(fileStream as unknown as import("stream/web").ReadableStream<Uint8Array>);
    const writeStream = createWriteStream(filepath);
    await pipeline(nodeStream, writeStream);

    // Magic number 验证（防止恶意文件伪装扩展名）
    const header = await new Promise<Buffer>((resolve, reject) => {
      const stream = createReadStream(filepath, { start: 0, end: 7 });
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
    const isValidFile = validateMagicNumber(header, ext);
    if (!isValidFile) {
      // 删除无效文件
      const { unlink } = await import("fs/promises");
      await unlink(filepath);
      return NextResponse.json(
        { error: "文件格式与扩展名不符，可能存在安全风险" },
        { status: 400 }
      );
    }

    // 计算文件内容哈希，检测是否已分析过
    const fileHash = await computeFileHash(filepath);
    const history = await readHistory();
    const existingAnalyses: ExistingAnalysis[] = [];

    // 检查历史记录中是否有相同文件哈希的分析
    for (const record of history) {
      if (record.type !== "analysis" || record.status !== "completed") continue;
      try {
        const recordHash = await computeFileHash(record.filePath);
        if (recordHash === fileHash) {
          existingAnalyses.push({
            id: record.id,
            mode: record.mode || "quick_overview",
            timestamp: record.timestamp,
            resultUrl: record.resultUrl || undefined,
          });
        }
      } catch {
        // 忽略已删除文件的错误
      }
    }

    // 获取文件前几行预览
    const preview = await getPreview(filepath, ext);

    // 记录上传历史
    await addUploadRecord({
      id,
      datasetName: file.name,
      filePath: filepath,
    });

    return NextResponse.json({
      id,
      filename: file.name,
      originalName: file.name,
      savedPath: filepath,
      size: file.size,
      type: ext,
      preview,
      existingAnalyses: existingAnalyses.length > 0 ? existingAnalyses : undefined,
      message: existingAnalyses.length > 0
        ? `上传成功。该文件已分析过 ${existingAnalyses.length} 次，可直接查看历史结果`
        : "上传成功，可以开始分析",
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}

async function getPreview(filepath: string, ext: string): Promise<{
  headers: string[];
  rows: string[][];
  totalRows: number;
}> {
  const { spawn } = await import("child_process");

  return new Promise((resolve) => {
    const python = spawn("python3", [
      path.join(process.cwd(), "analysis_engine", "preview_file.py"),
      filepath,
    ]);

    let output = "";
    python.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    python.on("close", () => {
      try {
        resolve(JSON.parse(output));
      } catch {
        resolve({ headers: [], rows: [], totalRows: 0 });
      }
    });
    python.on("error", () => {
      resolve({ headers: [], rows: [], totalRows: 0 });
    });
  });
}
