// ============================================
// SkillRegistry — 技能注册表
// 扫描 skills/*.md，解析 YAML frontmatter，
// 建立 skillName → SkillDefinition 映射
// ============================================

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import type { AnalysisMode } from "../types";
import type { SkillDefinition } from "./types";

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();

  /** 扫描 skillsDir 下所有 .md 文件并注册 */
  async loadAll(skillsDir: string): Promise<number> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    } catch {
      console.warn(`[SkillRegistry] Skills directory not found: ${skillsDir}`);
      return 0;
    }

    let count = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

      const filePath = path.join(skillsDir, entry.name);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const skill = this._parse(content, entry.name);
        this.skills.set(skill.name, skill);
        count++;
        console.log(`[SkillRegistry] Registered: ${skill.name} (v${skill.version})`);
      } catch (err) {
        console.warn(
          `[SkillRegistry] Failed to parse ${entry.name}: ${err instanceof Error ? err.message : String(err)}`
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

  /** 获取 DAG 节点列表（供拓扑排序用） */
  getDagNodes(mode: AnalysisMode): Array<{
    name: string;
    dependencies: string[];
  }> {
    return this.getApplicableSkills(mode).map((s) => ({
      name: s.name,
      dependencies: s.dependencies,
    }));
  }

  // ── YAML frontmatter 解析 ──

  private _parse(content: string, filename: string): SkillDefinition {
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
      description: frontmatter.description,
      version: String(frontmatter.version || "1.0.0"),
      applicableModes: (frontmatter.applicableModes as AnalysisMode[]) || [],
      dependencies: (frontmatter.dependencies as string[]) || [],
      mcpTools: (frontmatter.mcpTools as SkillDefinition["mcpTools"]) || [],
      body,
    };
  }
}
