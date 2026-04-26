---
name: LlmComprehensiveReport
description: >
  汇总和验证 LLM 深度分析结果。
  确保综合洞察报告完整可用，分离逐题分析和综合报告。
  为前端展示准备结构化的报告数据。
version: "1.0.0"
applicableModes: [ai_insights, deep_research]
dependencies: [DescriptiveAnalysis, LlmTextInsight, LlmLikertAnalysis]
mcpTools: []
---

# 综合洞察报告汇编技能

## 功能概述

`LlmTextInsight` 调用 `generic_llm_analysis.py` 时已同时生成了逐题分析报告和综合报告。本技能负责：
1. 验证所有报告文件的完整性
2. 从报告列表中分离综合报告和逐题分析报告
3. 为前端 `LlmInsightsPanel` 准备结构化的展示数据

## 执行流程

1. 从 `context.reports` 读取 `LlmTextInsight` 生成的报告列表
2. 按文件名分类：
   - `*_comprehensive.md` → 综合报告
   - `*_llm_*.md` → 逐题分析报告
3. 验证文件存在性
4. 汇总统计信息

## 输入（从 AnalysisContext 读取）

| 键 | 来源 | 说明 |
|------|------|------|
| `reports` | LlmTextInsight | 报告文件列表 |
| `analysis` | DescriptiveAnalysis | 用于获取数据集标签 |

## 输出（写入 AnalysisContext）

| 键 | 类型 | 说明 |
|------|------|------|
| `hasComprehensiveReport` | `boolean` | 是否存在综合报告 |
| `comprehensiveReport` | `object \| null` | 综合报告文件信息 |
| `questionReports` | `object[]` | 逐题分析报告列表 |
| `totalReports` | `number` | 报告总数 |
| `datasetLabel` | `string` | 数据集标签 |

## 错误处理

- 无报告文件 → `hasComprehensiveReport: false`，不阻断流水线
- 缺失综合报告 → 仅标记，不影响逐题报告展示

## 论文映射

- 体现"结果后处理与验证"环节
- 展示声明式依赖链：FileLoading → DescriptiveAnalysis → LlmTextInsight → 本技能
