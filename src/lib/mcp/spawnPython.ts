// ============================================
// Python 子进程调用工具
// MCP Server 通过此工具调用 Python 分析脚本
// ============================================

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { TokenUsage } from "./protocol";

export interface SpawnResult {
  success: boolean;
  stdout: string;
  stderr: string;
  resultPaths: string[];
  error?: string;
  detail?: string;
  tokenUsage?: TokenUsage;
}

/**
 * 启动 Python 脚本并捕获输出
 * - 自动解析 [PROGRESS] 和 [RESULT] 标记
 * - 使用 -u 标志禁用输出缓冲
 */
const DEFAULT_TIMEOUT_MS = 300_000; // 5 分钟

export function spawnPython(
  scriptPath: string,
  args: string[],
  onProgress?: (msg: string) => void,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const proc = spawn("python3", ["-u", scriptPath, ...args], {
      env: { ...process.env },
    });

    let stderr = "";
    let stdout = "";
    const resultPaths: string[] = [];
    let tokenUsage: TokenUsage | undefined;
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      // 给 5 秒优雅退出，否则强制 kill
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5000);
    }, timeoutMs);

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
        } else if (trimmed.startsWith("[TOKENS]")) {
          try {
            tokenUsage = JSON.parse(trimmed.slice(9).trim()) as TokenUsage;
          } catch {
            // ignore malformed token usage
          }
        }
      }
    });

    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        stdout,
        stderr,
        resultPaths,
        error: "Python 进程启动失败",
        detail: err.message,
      });
    });

    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      if (killed || signal) {
        resolve({
          success: false,
          stdout,
          stderr,
          resultPaths,
          tokenUsage,
          error: "分析超时",
          detail: `执行超过 ${timeoutMs / 1000} 秒，进程已被终止。`,
        });
        return;
      }
      if (code !== 0) {
        // Python 脚本可能通过 print/progress 将错误信息输出到 stdout
        // 当 stderr 为空时，从 stdout 中提取最后非标记行作为错误详情
        // 保留 [PROGRESS] 行（它们包含关键诊断信息），只过滤机器标记 [RESULT]/[TOKENS]/[DONE]
        const lastStdout = stdout
          .split("\n")
          .filter((l) => l.trim() && !l.trim().startsWith("[RESULT]") && !l.trim().startsWith("[TOKENS]") && !l.trim().startsWith("[DONE]"))
          .slice(-8)
          .join("\n");
        const detail = stderr.slice(-1000) || lastStdout || "无错误输出";
        // DEBUG: 写入文件以便排查（dev server 无终端时 console.log 丢失）
        try {
          const debugLog = path.join(process.cwd(), "debug-spawn.log");
          const entry = [
            `--- ${new Date().toISOString()} ---`,
            `script: ${scriptPath}`,
            `args: ${args.join(" ")}`,
            `code: ${code}`,
            `stdout (${stdout.length} chars):`,
            stdout || "(empty)",
            `stderr (${stderr.length} chars):`,
            stderr || "(empty)",
            "",
          ].join("\n");
          fs.appendFileSync(debugLog, entry);
        } catch {
          // ignore file write errors
        }
        resolve({
          success: false,
          stdout,
          stderr,
          resultPaths,
          tokenUsage,
          error: `进程异常退出 (code=${code})`,
          detail,
        });
      } else {
        resolve({
          success: true,
          stdout: stdout.trim(),
          stderr,
          resultPaths,
          tokenUsage,
        });
      }
    });
  });
}

/** 将相对项目根目录的路径解析为绝对路径 */
export function resolveScript(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}
