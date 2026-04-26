---
name: ResearchGap
description: >
  基于全部分析结果，识别研究未覆盖的维度、方法局限和理论盲区。
  生成未来研究方向建议，体现系统的元认知能力。
version: "1.0.0"
applicableModes: [deep_research]
dependencies: [DeepResearch]
mcpTools:
  - server: insight-server
    tool: analyze_research_gaps
    params:
      mode1ResultPath: "$context.resultPath"
      deepResearchDir: "$input.outputDir"
      outputDir: "$input.outputDir"
---

# 研究缺口识别技能

## 功能概述

模式3扩展技能之一。系统主动反思分析的边界，识别未覆盖的维度、方法局限和理论盲区。

## 缺口类别

| 类别 | 说明 |
|------|------|
| 数据缺口 | 缺少的变量、时间维度、对照组 |
| 方法缺口 | 未使用的分析方法、因果推断缺失 |
| 理论缺口 | 缺失的理论视角、解释框架不足 |
| 群体缺口 | 未覆盖的人群、样本代表性局限 |

## 输出

- `research_gap.json`: 结构化缺口分析

## 论文映射

- 直接支持论文"研究局限"和"未来工作"章节
- 体现系统的元认知能力
