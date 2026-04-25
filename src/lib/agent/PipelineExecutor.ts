// ============================================
// PipelineExecutor — DAG 执行器
// 核心算法: Kahn 拓扑排序 + 依赖失败优雅降级
// 按拓扑顺序执行 Skill → 解析 params 模板 →
// 调用 MCP 工具 → 输出写入 AnalysisContext
// ============================================

import type { AnalysisMode } from "../types";
import type { SkillDefinition, PipelineStep } from "./types";
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
    input: SkillInput
  ): Promise<SkillOutput[]> {
    const skills = this.registry.getApplicableSkills(mode);

    if (skills.length === 0) {
      this.emitter.log(`No skills registered for mode: ${mode}`);
      return [];
    }

    // Step 1: 拓扑排序
    const sorted = this._topologicalSort(skills);
    this.emitter.log(
      `${skills.length} skill(s) → ${sorted.map((s) => s.name).join(" → ")}`
    );

    // Step 2: 跟踪失败节点
    const failedSkills = new Set<string>();
    const results: SkillOutput[] = [];

    // Step 3: 按序执行
    for (const skill of sorted) {
      // 检查是否有依赖失败
      const blockedBy = skill.dependencies.filter((dep) =>
        failedSkills.has(dep)
      );
      if (blockedBy.length > 0) {
        this.emitter.phaseError(
          skill.name,
          `跳过（前置依赖失败: ${blockedBy.join(", ")}）`
        );
        results.push({
          success: false,
          error: `Blocked by failed dependencies: ${blockedBy.join(", ")}`,
        });
        failedSkills.add(skill.name);
        continue;
      }

      // 执行 Skill
      this.emitter.phaseStart(skill.name, "");

      try {
        const output = await this._executeSkill(skill, input);
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

          // 对于 best-effort 技能（如 LlmStructureAnalysis），失败不阻断下游
          const isBestEffort =
            skill.name === "LlmStructureAnalysis";
          if (!isBestEffort) {
            // 非 best-effort 技能失败 → 标记后续依赖为跳过
            this._markDependents(skill.name, skills, failedSkills);
          }
        }
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : String(err);
        this.emitter.phaseError(skill.name, errMsg);
        failedSkills.add(skill.name);
        results.push({ success: false, error: errMsg });
      }
    }

    return results;
  }

  // ── Skill 执行：解析 mcpTools 并逐一调用 ──

  private async _executeSkill(
    skill: SkillDefinition,
    input: SkillInput
  ): Promise<SkillOutput> {
    // 无 MCP 工具的 Skill（如 LlmComprehensiveReport）— 从 context 提取数据
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
        (msg) => this.emitter.progress(msg, skill.name)
      );

      // 统计 API 调用次数
      if (!result.isError) {
        const current = (this.context.get("__apiCalls") as number) || 0;
        this.context.set("__apiCalls", current + 1);
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
    skill: SkillDefinition,
    _input: SkillInput
  ): Promise<SkillOutput> {
    // LlmComprehensiveReport: 从 context 汇总报告信息
    if (skill.name === "LlmComprehensiveReport") {
      const reports = this.context.get("reports") as
        | Array<{ file: string; path: string }>
        | undefined;
      const analysis = this.context.get("analysis") as
        | Record<string, unknown>
        | undefined;

      if (!reports || reports.length === 0) {
        return {
          success: true,
          data: {
            hasComprehensiveReport: false,
            totalReports: 0,
          },
        };
      }

      const compReport = reports.find((r) =>
        r.file.toLowerCase().includes("comprehensive")
      );
      const questionReports = reports.filter(
        (r) => !r.file.toLowerCase().includes("comprehensive")
      );

      return {
        success: true,
        data: {
          hasComprehensiveReport: !!compReport,
          comprehensiveReport: compReport || null,
          questionReports,
          totalReports: reports.length,
          datasetLabel:
            (analysis?.dataset as string) ||
            (_input.datasetName || "未知问卷"),
        },
      };
    }

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
        inDegree.set(s.name, (inDegree.get(s.name) || 0) + 1);
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
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
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

  /** 将失败 Skill 的所有传递依赖标记为失败 */
  private _markDependents(
    failedName: string,
    skills: SkillDefinition[],
    failedSet: Set<string>
  ): void {
    const skillMap = new Map(skills.map((s) => [s.name, s]));
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
