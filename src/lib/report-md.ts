// ============================================
// 完整分析报告 Markdown 生成 + 下载工具
// ============================================

import type { QuickOverviewResult } from "./types";

/**
 * 将 QuickOverviewResult 数据转为结构化 Markdown 报告
 */
export function generateMarkdownReport(
  data: QuickOverviewResult,
  llmContents: string[]
): string {
  const lines: string[] = [];
  const ds = data.dataset || "未命名问卷";

  // ── 标题 ──
  lines.push(`# 《${ds}》完整分析报告`);
  lines.push("");
  lines.push(
    `> 样本量: ${data.total_records} | 字段数: ${data.total_fields} | 分析模式: ${data.analysis_mode}`
  );
  lines.push("");

  // ── 一、数据清洗 ──
  lines.push("## 一、数据清洗摘要");
  lines.push("");
  if (data.cleaning) {
    const c = data.cleaning;
    lines.push("| 指标 | 数值 |");
    lines.push("|------|------|");
    lines.push(`| 原始记录 | ${c.original_count} |`);
    if (c.removed_empty > 0) lines.push(`| 去除空行 | ${c.removed_empty} |`);
    if (c.removed_duplicates > 0) lines.push(`| 去除重复 | ${c.removed_duplicates} |`);
    if (c.removed_low_quality > 0) lines.push(`| 去除低质量 (>80%缺失) | ${c.removed_low_quality} |`);
    if ((c.removed_skips || 0) > 0) lines.push(`| 跳过标记置空（单元格） | ${c.removed_skips} |`);
    lines.push(`| **最终有效** | **${c.final_count}** |`);
    lines.push(`| **留存率** | **${c.retention_rate}%** |`);
  } else {
    lines.push(`有效记录: ${data.total_records}`);
  }
  lines.push("");

  // ── 二、样本构成（人口学）──
  const dem = data.demographics || {};
  if (Object.keys(dem).length > 0) {
    lines.push("## 二、样本构成（人口学分析）");
    lines.push("");
    for (const [key, d] of Object.entries(dem)) {
      if (!d?.distribution?.length) continue;
      lines.push(`### ${d.column || key}`);
      lines.push("");
      lines.push("| 选项 | 人数 | 比例 |");
      lines.push("|------|------|------|");
      for (const item of d.distribution.slice(0, 20)) {
        const pct = item.percentage ?? item.percentage_in_respondents ?? item.percentage_in_total ?? 0;
        lines.push(`| ${escapeMd(item.label)} | ${item.count} | ${pct}% |`);
      }
      lines.push("");
    }
  }

  // ── 三、选择题分布 ──
  const usage = data.genai_usage || {};
  if (Object.keys(usage).length > 0) {
    lines.push("## 三、选择题分布");
    lines.push("");
    for (const [key, d] of Object.entries(usage)) {
      if (!d?.distribution?.length) continue;
      const isMulti =
        d.type === "multi_select" || d.type === "multi_select_columns";
      lines.push(`### ${d.column || key}`);
      if (isMulti && d.total_respondents) {
        lines.push(`*多选 · 答卷人数: ${d.total_respondents} · 总选择: ${d.total_selections || ""} · 人均: ${d.avg_selections_per_respondent || ""}*`);
      }
      lines.push("");
      lines.push("| 选项 | 人数 | 比例 |");
      lines.push("|------|------|------|");
      for (const item of d.distribution.slice(0, 20)) {
        const pct = item.percentage ?? item.percentage_in_respondents ?? item.percentage_in_total ?? 0;
        lines.push(`| ${escapeMd(item.label)} | ${item.count} | ${pct}% |`);
      }
      lines.push("");
    }
  }

  // ── 四、量表分析 ──
  const likert = data.likert_scales || {};
  if (Object.keys(likert).length > 0) {
    lines.push("## 四、量表分析");
    lines.push("");
    for (const [group, items] of Object.entries(likert)) {
      if (!items?.length) continue;
      lines.push(`### ${group}`);
      lines.push("");
      lines.push("| 题目 | N | 均值 | 标准差 | 1分 | 2分 | 3分 | 4分 | 5分 |");
      lines.push("|------|---|------|--------|-----|-----|-----|-----|-----|");
      for (const item of items) {
        const label = (item.column || "").slice(0, 50);
        const dist = item.distribution || [];
        const scores = [1, 2, 3, 4, 5].map((s) => {
          const d = dist.find((x) => x.score === s);
          return d ? `${d.count}(${d.percentage}%)` : "-";
        });
        lines.push(
          `| ${escapeMd(label)} | ${item.n} | ${item.mean} | ${item.std} | ${scores.join(" | ")} |`
        );
      }
      lines.push("");
    }
  }

  // ── 五、交叉分析发现 ──
  const crossData = data.cross_analysis || [];
  if (crossData.length > 0) {
    lines.push("## 五、交叉分析发现");
    lines.push("");
    for (const item of crossData) {
      lines.push(`### ${item.title}`);
      if (item.description) lines.push(item.description);
      lines.push("");
      lines.push(`- 显著性: ${item.is_significant ? "显著相关" : "不显著"} (p=${item.p_value}, Cramér's V=${item.cramers_v})`);
      lines.push(`- 样本量: ${item.sample_size}`);
      lines.push("");
      if (item.insight) {
        lines.push(`> ${item.insight}`);
        lines.push("");
      }
      // 交叉表
      if (item.crosstab?.length > 0) {
        const bLabels = item.crosstab[0].values.map((v: {label: string}) => v.label);
        lines.push(`| ${item.var_a.label} | ${bLabels.join(" | ")} |`);
        lines.push(`|${"------|".repeat(bLabels.length + 1)}`);
        for (const row of item.crosstab) {
          const cells = row.values.map((v: {percentage: number; count: number}) => `${v.percentage}% (${v.count})`);
          lines.push(`| ${row.label} | ${cells.join(" | ")} |`);
        }
        lines.push("");
      }
    }
  }

  // ── 六、文本关键词分析 ──
  const textData = data.text_analysis || {};
  if (Object.keys(textData).length > 0) {
    lines.push(`## ${crossData.length > 0 ? "六" : "五"}、开放题文本分析`);
    lines.push("");
    for (const [key, ta] of Object.entries(textData)) {
      if (!ta?.top_keywords?.length) continue;
      lines.push(`### ${ta.column || key}`);
      lines.push(`*回答: ${ta.total_answers} 份 · 均长: ${ta.avg_answer_length} 字 · 独立词: ${ta.unique_words}*`);
      lines.push("");

      // 情感分析
      if (ta.sentiment) {
        lines.push("**情感分布**");
        lines.push("");
        lines.push(`| 类型 | 数量 | 占比 |`);
        lines.push(`|------|------|------|`);
        for (const d of ta.sentiment.distribution) {
          lines.push(`| ${d.label} | ${d.count} | ${d.percentage}% |`);
        }
        lines.push(`| **平均情感得分** | — | **${ta.sentiment.avg_score}** |`);
        lines.push("");
      }

      // 长度分布
      if (ta.length_distribution) {
        lines.push("**回答长度分布**");
        lines.push("");
        lines.push(`| 长度区间 | 数量 | 占比 |`);
        lines.push(`|----------|------|------|`);
        for (const d of ta.length_distribution.distribution) {
          lines.push(`| ${d.label} | ${d.count} | ${d.percentage}% |`);
        }
        lines.push("");
      }

      // 关键词
      lines.push("**高频关键词**");
      lines.push("");
      const top15 = ta.top_keywords.slice(0, 15);
      lines.push("| 排名 | 关键词 | 频次 |");
      lines.push("|------|--------|------|");
      for (const kw of top15) {
        lines.push(`| ${kw.rank} | ${escapeMd(kw.word)} | ${kw.count} |`);
      }
      lines.push("");
    }
  }

  // ── 六、AI 深度洞察 ──
  if (llmContents.length > 0) {
    lines.push("## 六、AI 深度洞察 (LLM)");
    lines.push("");
    for (const content of llmContents) {
      if (!content?.trim()) continue;
      // 去掉可能重复的一级标题
      const cleaned = content
        .replace(/^# .*\n?/gm, "### ")
        .replace(/^## /gm, "#### ");
      lines.push(cleaned);
      lines.push("");
    }
  }

  // ── 附录：生成信息 ──
  lines.push("---");
  lines.push("");
  lines.push(`*报告由智能体辅助问卷分析系统自动生成 · ${new Date().toLocaleDateString("zh-CN")}*`);

  return lines.join("\n");
}

/** 下载 Markdown 文件到本地 */
export function downloadMarkdown(markdown: string, filename: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 转义 Markdown 表格中的特殊字符 */
function escapeMd(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
