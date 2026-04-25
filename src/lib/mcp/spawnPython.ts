// ============================================
// Python 子进程调用工具
// MCP Server 通过此工具调用 Python 分析脚本
// ============================================

import { spawn } from "child_process";
import path from "path";

export interface SpawnResult {
  success: boolean;
  stdout: string;
  stderr: string;
  resultPaths: string[];
  error?: string;
  detail?: string;
}

/**
 * 启动 Python 脚本并捕获输出
 * - 自动解析 [PROGRESS] 和 [RESULT] 标记
 * - 使用 -u 标志禁用输出缓冲
 */
export function spawnPython(
  scriptPath: string,
  args: string[],
  onProgress?: (msg: string) => void
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const proc = spawn("python3", ["-u", scriptPath, ...args], {
      env: { ...process.env },
    });

    let stderr = "";
    let stdout = "";
    const resultPaths: string[] = [];

    proc.stdout.on("data", (d: Buffer) => {
      const text = d.toString();
      stdout += text;
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("[PROGRESS]")) {
          onProgress?.(trimmed.slice(11).trim());
        } else if (trimmed.startsWith("[RESULT]")) {
          resultPaths.push(trimmed.slice(9).trim());
        }
      }
    });

    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        stdout,
        stderr,
        resultPaths,
        error: "Python 进程启动失败",
        detail: err.message,
      });
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({
          success: false,
          stdout,
          stderr,
          resultPaths,
          error: `进程异常退出 (code=${code})`,
          detail: stderr.slice(-1000) || "无错误输出",
        });
      } else {
        resolve({
          success: true,
          stdout: stdout.trim(),
          stderr,
          resultPaths,
        });
      }
    });
  });
}

/** 将相对项目根目录的路径解析为绝对路径 */
export function resolveScript(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}
