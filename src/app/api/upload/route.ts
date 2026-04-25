import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { addUploadRecord } from "@/lib/history";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
const RESULTS_DIR = path.join(process.cwd(), "data", "results");

export async function POST(request: NextRequest) {
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

    // 用随机 ID 作为文件名（短名，避免长 URL 和中文编码问题）
    const id = crypto.randomBytes(6).toString("hex");
    const safeName = `${id}${ext}`;
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await mkdir(UPLOAD_DIR, { recursive: true });
    await mkdir(RESULTS_DIR, { recursive: true });

    const filepath = path.join(UPLOAD_DIR, safeName);
    await writeFile(filepath, buffer);

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
      filename: file.name,          // 原始文件名（用于展示）
      originalName: file.name,       // 保留原始名
      savedPath: filepath,
      size: buffer.length,
      type: ext,
      preview,
      message: "上传成功，可以开始分析",
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
