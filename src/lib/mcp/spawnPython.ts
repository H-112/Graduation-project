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

// 只传递 Python 子进程需要的环境变量，避免泄露敏感信息
const PYTHON_ENV_WHITELIST = [
  "DEEPSEEK_API_KEY",
  "PATH",
  "HOME",
  "USER",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "PYTHONUNBUFFERED",
] as const;

function buildPythonEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const key of PYTHON_ENV_WHITELIST) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }
  // 确保 PATH 可用
  if (!env.PATH && process.env.PATH) {
    env.PATH = process.env.PATH;
  }
  return env;
}

// Python 子进程并发控制（防止资源耗尽）
const MAX_CONCURRENT_PROCESSES = 3;
let activeProcessCount = 0;
const processQueue: Array<() => void> = [];

function acquireProcessSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeProcessCount < MAX_CONCURRENT_PROCESSES) {
      activeProcessCount++;
      resolve();
    } else {
      processQueue.push(() => {
        activeProcessCount++;
        resolve();
      });
    }
  });
}

function releaseProcessSlot(): void {
  activeProcessCount--;
  const next = processQueue.shift();
  if (next) next();
}

// debug-spawn.log 大小限制
const DEBUG_LOG_MAX_SIZE = 10 * 1024 * 1024; // 10MB

function appendDebugLog(entry: string): void {
  try {
    const debugLog = path.join(process.cwd(), "debug-spawn.log");
    const stat = fs.statSync(debugLog, { throwIfNoEntry: false });
    if (stat && stat.size >= DEBUG_LOG_MAX_SIZE) {
      // 轮转：保留最后 1MB
      const buf = fs.readFileSync(debugLog);
      const trimmed = buf.subarray(Math.max(0, buf.length - 1024 * 1024));
      fs.writeFileSync(debugLog, trimmed);
    }
    fs.appendFileSync(debugLog, entry);
  } catch {
    // ignore file write errors
  }
}

/**
 * 启动 Python 脚本并捕获输出
 * - 自动解析 [PROGRESS] 和 [RESULT] 标记
 * - 使用 -u 标志禁用输出缓冲
 * - 并发控制：最多 MAX_CONCURRENT_PROCESSES 个同时运行
 */
const DEFAULT_TIMEOUT_MS = 300_000; // 5 分钟

export function spawnPython(
  scriptPath: string,
  args: string[],
  onProgress?: (msg: string) => void,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<SpawnResult> {
  return acquireProcessSlot().then(() =>
    new Promise<SpawnResult>((resolve) => {
    const proc = spawn("python3", ["-u", scriptPath, ...args], {
      env: buildPythonEnv() as typeof process.env,
    });

    // 当上游（SSE 客户端断开）取消时，终止子进程
    if (signal) {
      if (signal.aborted) {
        proc.kill("SIGTERM");
        releaseProcessSlot();
        resolve({
          success: false,
          stdout: "",
          stderr: "",
          resultPaths: [],
          error: "请求已取消",
          detail: "客户端断开连接",
        });
        return;
      }
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
      }, { once: true });
    }

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
      releaseProcessSlot();
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
      releaseProcessSlot();
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
        const lastStdout = stdout
          .split("\n")
          .filter((l) => l.trim() && !l.trim().startsWith("[RESULT]") && !l.trim().startsWith("[TOKENS]") && !l.trim().startsWith("[DONE]"))
          .slice(-8)
          .join("\n");
        const detail = stderr.slice(-1000) || lastStdout || "无错误输出";
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
        appendDebugLog(entry);
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
  }));
}

/** 将相对项目根目录的路径解析为绝对路径 */
export function resolveScript(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}
