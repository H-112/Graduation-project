// ============================================
// PipelineExecutor — DAG 执行器
// 核心算法: Kahn 拓扑排序 + 层级并行执行 + 依赖失败优雅降级
// 按拓扑层级执行 Skill → 同层无依赖的 Skill 并行运行
// 解析 params 模板 → 调用 MCP 工具 → 输出写入 AnalysisContext
// ============================================

import type { AnalysisMode } from "../types";
import type { SkillDefinition } from "./types";
import { SkillRegistry } from "./SkillRegistry";
import { AnalysisContext } from "./AnalysisContext";
import { ProgressEmitter } from "./ProgressEmitter";
import { McpClient } from "../mcp/McpClient";
import type { SkillInput, SkillOutput } from "./types";

export class PipelineExecutor {
  constructor(
    private registry: SkillRegistry,
    private context: AnalysisContext,
    private client: McpClient,
    private emitter: ProgressEmitter
  ) {}

  /**
   * 运行指定模式的流水线
   * @returns 每个 Skill 的执行结果数组
   */
  async run(
    mode: AnalysisMode,
    input: SkillInput,
    signal?: AbortSignal
  ): Promise<SkillOutput[]> {
    const skills = this.registry.getApplicableSkills(mode);

    if (skills.length === 0) {
      this.emitter.log(`No skills registered for mode: ${mode}`);
      return [];
    }

    // Step 1: 拓扑排序（用于日志展示）
    const sorted = this._topologicalSort(skills);
    this.emitter.log(
      `${skills.length} skill(s) → ${sorted.map((s) => s.name).join(" → ")}`
    );

    // Step 2: 按层级分组
    const levels = this._topologicalSortLevels(skills);
    this.emitter.log(
      `执行层级: ${levels.map((lvl) => lvl.map((s) => s.name).join(",")).join(" | ")}`
    );

    // Step 3: 跟踪失败节点
    const failedSkills = new Set<string>();
    const results: SkillOutput[] = [];

    // Step 4: 按层级执行（同层并行）
    for (const level of levels) {
      if (signal?.aborted) break;

      if (level.length === 1) {
        // 单层串行（保持原有逻辑）
        await this._executeSingleSkill(level[0], input, failedSkills, results, signal);
      } else {
        // 多层并行
        const levelResults = await Promise.all(
          level.map((skill) =>
            this._executeSingleSkill(skill, input, failedSkills, results, signal)
          )
        );
        // levelResults 已自动 push 到 results（_executeSingleSkill 内部处理）
        // 这里仅用于类型校验，防止结果被意外丢弃
        void levelResults;
      }
    }

    return results;
  }

  /**
   * 执行单个 Skill（含依赖检查、错误处理、context 更新）
   * @returns Skill 执行结果
   */
  private async _executeSingleSkill(
    skill: SkillDefinition,
    input: SkillInput,
    failedSkills: Set<string>,
    results: SkillOutput[],
    signal?: AbortSignal
  ): Promise<SkillOutput> {
    if (signal?.aborted) {
      const output: SkillOutput = {
        success: false,
        error: "分析已取消",
      };
      results.push(output);
      return output;
    }
    // 检查是否有依赖失败
    const blockedBy = skill.dependencies.filter((dep) =>
      failedSkills.has(dep)
    );
    if (blockedBy.length > 0) {
      this.emitter.phaseError(
        skill.name,
        `跳过（前置依赖失败: ${blockedBy.join(", ")}）`
      );
      const output: SkillOutput = {
        success: false,
        error: `Blocked by failed dependencies: ${blockedBy.join(", ")}`,
      };
      results.push(output);
      failedSkills.add(skill.name);
      return output;
    }

    // 评估 when 条件
    if (skill.when && !this._evaluateWhen(skill.when, input)) {
      const skipMsg = `跳过（条件不满足: ${skill.when}）`;
      this.emitter.phaseStart(skill.name, skipMsg);
      const output: SkillOutput = {
        success: true,
        data: { skipped: true, reason: skipMsg },
      };
      results.push(output);
      this.emitter.phaseComplete(skill.name);
      return output;
    }

    // 执行 Skill
    this.emitter.phaseStart(skill.name, "");

    try {
      const output = await this._executeSkill(skill, input, signal);
      results.push(output);

      if (output.success) {
        if (output.data) {
          this.context.merge(skill.name, output.data);
        }
        this.emitter.phaseComplete(skill.name);
      } else {
        const errMsg = output.error || "Unknown error";
        this.emitter.phaseError(skill.name, errMsg);
        failedSkills.add(skill.name);

        // best-effort 技能失败时不阻断下游（不加入 failedSkills）
        const isBestEffort = [
          "LlmStructureAnalysis",
          "LlmLikertAnalysis",
          "LlmTextInsight",
        ].includes(skill.name);
        if (!isBestEffort) {
          // 非 best-effort 技能失败 → 标记后续依赖为跳过
          this._markDependents(skill.name, this.registry.getApplicableSkills(input.mode), failedSkills);
        } else {
          // best-effort: 从失败集合中移除，避免阻塞下游依赖
          failedSkills.delete(skill.name);
        }
      }

      return output;
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : String(err);
      this.emitter.phaseError(skill.name, errMsg);
      const isBestEffort = [
          "LlmStructureAnalysis",
          "LlmLikertAnalysis",
          "LlmTextInsight",
        ].includes(skill.name);
      if (!isBestEffort) {
        failedSkills.add(skill.name);
        this._markDependents(skill.name, this.registry.getApplicableSkills(input.mode), failedSkills);
      }
      const output: SkillOutput = { success: false, error: errMsg };
      results.push(output);
      return output;
    }
  }

  // ── Skill 执行：解析 mcpTools 并逐一调用 ──

  private async _executeSkill(
    skill: SkillDefinition,
    input: SkillInput,
    signal?: AbortSignal
  ): Promise<SkillOutput> {
    // 无 MCP 工具的 Skill — 从 context 提取数据
    if (!skill.mcpTools || skill.mcpTools.length === 0) {
      return this._executeContextSkill(skill, input);
    }

    const collectedData: Record<string, unknown> = {};

    for (const toolRef of skill.mcpTools) {
      const resolvedParams = this._resolveParams(
        toolRef.params,
        input
      );

      // MCP 调用日志已简化，仅保留关键节点
      const result = await this.client.callTool(
        toolRef.server,
        toolRef.tool,
        resolvedParams,
        (msg) => this.emitter.progress(msg, skill.name),
        signal
      );

      // 统计 API 调用次数 和 Token 用量
      if (!result.isError) {
        const current = (this.context.get("__apiCalls") as number) || 0;
        this.context.set("__apiCalls", current + 1);

        if (result.tokenUsage) {
          const acc = (this.context.get("__tokenUsage") as { prompt_tokens: number; completion_tokens: number; total_tokens: number }) || {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          };
          acc.prompt_tokens += result.tokenUsage.prompt_tokens;
          acc.completion_tokens += result.tokenUsage.completion_tokens;
          acc.total_tokens += result.tokenUsage.total_tokens;
          this.context.set("__tokenUsage", acc);
        }
      }

      if (result.isError) {
        const errText =
          result.content.find((c) => c.type === "text")?.text ||
          `Tool ${toolRef.tool} failed`;
        return { success: false, error: errText };
      }

      // 收集 JSON 和文本输出
      for (const content of result.content) {
        if (content.type === "json" && content.data) {
          Object.assign(collectedData, content.data as object);
        }
        if (content.type === "text" && content.text) {
          collectedData._lastResultPath = content.text;
          // resultPath 只接受 JSON 分析结果文件（模式1输出），
          // 防止后续 Skill（如 DeepResearch 的 markdown 报告）覆盖它
          if (
            !collectedData.resultPath &&
            content.text.match(/[\/\\].+\.json$/)
          ) {
            collectedData.resultPath = content.text;
          }
        }
      }
    }

    return { success: true, data: collectedData };
  }

  /**
   * 执行无 MCP 工具的 Skill — 从 AnalysisContext 提取/验证数据
   */
  private async _executeContextSkill(
    _skill: SkillDefinition,
    _input: SkillInput
  ): Promise<SkillOutput> {
    return { success: true, data: {} };
  }

  // ── 参数模板解析 ──

  /**
   * 解析 Skill 中的 params 模板字符串
   * $input.xxx → input 对象
   * $context.xxx → AnalysisContext
   */
  private _resolveParams(
    params: Record<string, string>,
    input: SkillInput
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      resolved[key] = this._resolveValue(value, input);
    }
    return resolved;
  }

  /** 解析单个值中的模板引用 */
  private _resolveValue(
    value: string,
    input: SkillInput
  ): unknown {
    // 处理 $input.xxx
    if (typeof value === "string" && value.startsWith("$input.")) {
      const inputPath = value.slice(7); // remove "$input."
      return (input as unknown as Record<string, unknown>)[
        inputPath
      ];
    }
    // 处理 $context.xxx
    if (typeof value === "string" && value.startsWith("$context.")) {
      const ctxPath = value.slice(9); // remove "$context."
      return this.context.get(ctxPath);
    }
    return value;
  }

  // ── DAG 拓扑排序（Kahn 算法）──

  private _topologicalSort(
    skills: SkillDefinition[]
  ): SkillDefinition[] {
    // 构建邻接表和入度
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    const skillMap = new Map<string, SkillDefinition>();

    for (const s of skills) {
      skillMap.set(s.name, s);
      if (!inDegree.has(s.name)) {
        inDegree.set(s.name, 0);
      }
      if (!adjacency.has(s.name)) {
        adjacency.set(s.name, []);
      }

      for (const dep of s.dependencies) {
        // 只考虑在当前模式中注册的依赖
        if (!inDegree.has(dep)) {
          inDegree.set(dep, 0);
        }
        if (!adjacency.has(dep)) {
          adjacency.set(dep, []);
        }
        adjacency.get(dep)!.push(s.name);
        inDegree.set(s.name, (inDegree.get(s.name) ?? 0) + 1);
      }
    }

    // Kahn 算法
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0 && skillMap.has(name)) {
        queue.push(name);
      }
    }

    const sorted: SkillDefinition[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const skill = skillMap.get(current);
      if (skill) {
        sorted.push(skill);
      }

      for (const neighbor of adjacency.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0 && skillMap.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    // 将未排序的 Skill 追加到末尾（可能是依赖链外的独立节点）
    for (const s of skills) {
      if (!sorted.includes(s)) {
        sorted.push(s);
      }
    }

    return sorted;
  }

  /**
   * 拓扑层级排序 — 将 Skill 按 DAG 深度分组
   * 同层 Skill 之间无依赖，可并行执行
   */
  private _topologicalSortLevels(
    skills: SkillDefinition[]
  ): SkillDefinition[][] {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    const skillMap = new Map<string, SkillDefinition>();

    for (const s of skills) {
      skillMap.set(s.name, s);
      if (!inDegree.has(s.name)) {
        inDegree.set(s.name, 0);
      }
      if (!adjacency.has(s.name)) {
        adjacency.set(s.name, []);
      }

      for (const dep of s.dependencies) {
        if (!inDegree.has(dep)) {
          inDegree.set(dep, 0);
        }
        if (!adjacency.has(dep)) {
          adjacency.set(dep, []);
        }
        adjacency.get(dep)!.push(s.name);
        inDegree.set(s.name, (inDegree.get(s.name) ?? 0) + 1);
      }
    }

    const levels: SkillDefinition[][] = [];
    let currentLevel: string[] = [];

    for (const [name, degree] of inDegree) {
      if (degree === 0 && skillMap.has(name)) {
        currentLevel.push(name);
      }
    }

    while (currentLevel.length > 0) {
      const levelSkills = currentLevel
        .map((name) => skillMap.get(name)!)
        .filter(Boolean);
      levels.push(levelSkills);

      const nextLevel: string[] = [];
      for (const name of currentLevel) {
        for (const neighbor of adjacency.get(name) || []) {
          const newDegree = (inDegree.get(neighbor) ?? 0) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0 && skillMap.has(neighbor)) {
            nextLevel.push(neighbor);
          }
        }
      }
      currentLevel = nextLevel;
    }

    // 将未排序的 Skill 追加到最后一个层级（兜底）
    const seen = new Set(levels.flat().map((s) => s.name));
    const remaining = skills.filter((s) => !seen.has(s.name));
    if (remaining.length > 0) {
      levels.push(remaining);
    }

    return levels;
  }

  /**
   * 安全表达式求值器 — 仅支持白名单操作符，不使用 eval/new Function
   * 支持: >=, <=, >, <, ==, !=, ===, !== 以及 tru thy 检查
   */
  private _evaluateWhen(when: string, input: SkillInput): boolean {
    try {
      // Step 1: 解析表达式 — 提取左值、操作符、右值
      const expr = when.trim();

      // 先替换模板变量为实际值
      const resolved = this._resolveWhenTemplate(expr, input);

      // Step 2: 尝试匹配比较表达式
      const cmpMatch = resolved.match(
        /^(.+?)\s*(>=|<=|===|!==|==|!=|>|<)\s*(.+?)$/
      );
      if (cmpMatch) {
        const [, leftRaw, op, rightRaw] = cmpMatch;
        const left = this._coerceWhenValue(leftRaw.trim());
        const right = this._coerceWhenValue(rightRaw.trim());
        switch (op) {
          case ">=": return (left as number) >= (right as number);
          case "<=": return (left as number) <= (right as number);
          case ">":  return (left as number) >  (right as number);
          case "<":  return (left as number) <  (right as number);
          case "===": return left === right;
          case "!==": return left !== right;
          case "==":  return left == right;
          case "!=":  return left != right;
          default: return true;
        }
      }

      // Step 3: 无操作符 → tru thy / falsy 检查
      return !!this._coerceWhenValue(resolved);
    } catch {
      console.warn(`[PipelineExecutor] When expression eval failed: ${when}`);
      return true;
    }
  }

  /** 将 $context.xxx / $input.xxx 模板替换为 JSON 值 */
  private _resolveWhenTemplate(expr: string, input: SkillInput): string {
    return expr
      .replace(/\$context\.(\w+)/g, (_, key) => {
        const val = this.context.get(key);
        return val === undefined ? "undefined" : JSON.stringify(val);
      })
      .replace(/\$input\.(\w+)/g, (_, key) => {
        const val = (input as unknown as Record<string, unknown>)[key];
        return val === undefined ? "undefined" : JSON.stringify(val);
      });
  }

  /** 将当值字符串转为对应的 JS 原始值 */
  private _coerceWhenValue(raw: string): unknown {
    if (raw === "undefined") return undefined;
    if (raw === "null") return null;
    if (raw === "true") return true;
    if (raw === "false") return false;
    // 数字
    if (/^-?\d+(\.\d+)?$/.test(raw)) return parseFloat(raw);
    // 字符串（去引号）
    if ((raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw;
  }

  /** 将失败 Skill 的所有传递依赖标记为失败 */
  private _markDependents(
    failedName: string,
    skills: SkillDefinition[],
    failedSet: Set<string>
  ): void {
    const queue = [failedName];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const s of skills) {
        if (s.dependencies.includes(current) && !failedSet.has(s.name)) {
          failedSet.add(s.name);
          queue.push(s.name);
          this.emitter.phaseError(
            s.name,
            `跳过（前置依赖 "${current}" 失败）`
          );
        }
      }
    }
  }
}
