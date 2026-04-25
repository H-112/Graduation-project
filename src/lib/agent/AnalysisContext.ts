// ============================================
// AnalysisContext — 流水线共享状态容器
// Skill 之间通过 Context 传递数据
// ============================================

export class AnalysisContext {
  private _data: Map<string, unknown> = new Map();

  set(key: string, value: unknown): void {
    this._data.set(key, value);
  }

  get(key: string): unknown {
    return this._data.get(key);
  }

  has(key: string): boolean {
    return this._data.has(key);
  }

  /**
   * 合并 Skill 输出到上下文
   * 同时存一份带 skillName 前缀的副本（避免冲突）和一份顶层键（方便下游读取）
   */
  merge(skillName: string, data: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(data)) {
      this._data.set(`${skillName}.${k}`, v);
      // 顶层键直接覆盖，最新 Skill 胜出
      this._data.set(k, v);
    }
  }

  toObject(): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this._data) {
      obj[k] = v;
    }
    return obj;
  }

  keys(): string[] {
    return Array.from(this._data.keys());
  }

  clear(): void {
    this._data.clear();
  }
}
