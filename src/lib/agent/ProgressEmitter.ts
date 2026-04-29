// ============================================
// ProgressEmitter — SSE 事件桥接器
// 将 Skill 执行进度转换为 SSE 事件推送前端
// 与原 trigger route 的 SSE 格式完全兼容
// ============================================

import type { SseEvent, SkillLevels } from "./types";

export class ProgressEmitter {
  private encoder = new TextEncoder();

  constructor(
    private controller: ReadableStreamDefaultController<Uint8Array>
  ) {}

  private emit(event: SseEvent): void {
    try {
      this.controller.enqueue(
        this.encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      );
    } catch (err) {
      // 客户端已断开，静默丢弃避免进程崩溃
      if (
        err instanceof Error &&
        err.message.includes("Controller is already closed")
      ) {
        return;
      }
      throw err;
    }
  }

  phaseStart(skillName: string, description: string): void {
    this.emit({
      type: "progress",
      stage: skillName,
      message: description ? `[${skillName}] ${description}` : `[${skillName}]`,
    });
  }

  progress(message: string, stage?: string): void {
    this.emit({
      type: "progress",
      stage: stage || "running",
      message,
    });
  }

  phaseComplete(skillName: string): void {
    this.emit({
      type: "progress",
      stage: skillName,
      message: `[${skillName}] 完成`,
    });
  }

  phaseError(skillName: string, error: string): void {
    this.emit({
      type: "progress",
      stage: skillName,
      message: `[${skillName}] 错误: ${error}`,
    });
  }

  result(data: Record<string, unknown>): void {
    this.emit({
      type: "result",
      success: true,
      ...data,
    } as SseEvent);
  }

  done(): void {
    this.emit({ type: "done" });
  }

  error(
    error: string,
    detail?: string,
    fallback?: Record<string, unknown>
  ): void {
    this.emit({
      type: "error",
      success: false,
      error,
      detail,
      fallbackResult: fallback,
    });
  }

  log(message: string, level?: string): void {
    this.emit({
      type: "log",
      message,
      stage: level,
    });
  }

  skills(levels: SkillLevels): void {
    this.emit({
      type: "skills",
      levels,
    } as SseEvent);
  }
}
