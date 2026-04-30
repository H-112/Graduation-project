// ============================================
// SkillRegistry — 技能注册表
// 扫描 skills/*.md，解析 YAML frontmatter，
// 建立 skillName → SkillDefinition 映射
// ============================================

import { readdir, readFile } from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import type { AnalysisMode } from "../types";
import type { SkillDefinition } from "./types";

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();

  /** 扫描 skillsDir 下所有 .md 文件并注册 */
  async loadAll(skillsDir: string): Promise<number> {
    let entries: string[];
    try {
      entries = await readdir(skillsDir);
    } catch {
      console.warn(`[SkillRegistry] Skills directory not found: ${skillsDir}`);
      return 0;
    }

    let count = 0;
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;

      const filePath = path.join(skillsDir, entry);
      try {
        const content = await readFile(filePath, "utf-8");
        const skill = this._parse(content, entry);
        this.skills.set(skill.name, skill);
        count++;
        console.log(`[SkillRegistry] Registered: ${skill.name} (v${skill.version})`);
      } catch (err) {
        console.warn(
          `[SkillRegistry] Failed to parse ${entry}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    console.log(`[SkillRegistry] Loaded ${count} skill(s) from ${skillsDir}`);
    return count;
  }

  /** 手动注册一个 Skill（用于编程式注册） */
  register(skill: SkillDefinition): void {
    this.skills.set(skill.name, skill);
  }

  /** 按名称获取 Skill */
  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  /** 获取指定模式下的所有适用 Skill */
  getApplicableSkills(mode: AnalysisMode): SkillDefinition[] {
    return Array.from(this.skills.values()).filter((s) =>
      s.applicableModes.includes(mode)
    );
  }

  /** 获取所有已注册的 Skill */
  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * 获取指定模式的 Skill DAG 层级分组
   * 同层 Skill 之间无依赖，可并行执行
   */
  getLevels(mode: AnalysisMode): import("./types").SkillLevels {
    const skills = this.getApplicableSkills(mode);
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

    const levels: import("./types").SkillLevels = [];
    let currentLevel: string[] = [];

    for (const [name, degree] of inDegree) {
      if (degree === 0 && skillMap.has(name)) {
        currentLevel.push(name);
      }
    }

    while (currentLevel.length > 0) {
      const levelSkills = currentLevel
        .map((name) => skillMap.get(name)!)
        .filter(Boolean)
        .map((s) => ({
          name: s.name,
          displayName: s.displayName,
          description: s.description,
        }));
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
    const remaining = skills
      .filter((s) => !seen.has(s.name))
      .map((s) => ({
        name: s.name,
        displayName: s.displayName,
        description: s.description,
      }));
    if (remaining.length > 0) {
      levels.push(remaining);
    }

    return levels;
  }

  // ── YAML frontmatter 解析 ──

  private _parse(content: string, _filename: string): SkillDefinition {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) {
      throw new Error(`No valid YAML frontmatter found`);
    }

    const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
    const body = content.slice(match[0].length).trim();

    // 验证必填字段
    if (!frontmatter.name || typeof frontmatter.name !== "string") {
      throw new Error(`Missing required field: name`);
    }
    if (!frontmatter.description || typeof frontmatter.description !== "string") {
      throw new Error(`Missing required field: description`);
    }

    return {
      name: frontmatter.name,
      displayName: frontmatter.displayName as string | undefined,
      description: frontmatter.description,
      version: String(frontmatter.version || "1.0.0"),
      applicableModes: (frontmatter.applicableModes as AnalysisMode[]) || [],
      dependencies: (frontmatter.dependencies as string[]) || [],
      mcpTools: (frontmatter.mcpTools as SkillDefinition["mcpTools"]) || [],
      tags: (frontmatter.tags as string[]) || [],
      when: frontmatter.when as string | undefined,
      inputSchema: frontmatter.inputSchema as Record<string, unknown> | undefined,
      body,
    };
  }
}
