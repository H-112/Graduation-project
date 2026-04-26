---
name: ActionableInsight
description: >
  将深度研究发现转化为具体、可操作的干预/改进建议。
  按优先级和场景分类，每条建议追溯关联的数据证据。
version: "1.0.0"
applicableModes: [deep_research]
dependencies: [DeepResearch]
mcpTools:
  - server: insight-server
    tool: generate_actionable_insights
    params:
      mode1ResultPath: "$context.resultPath"
      deepResearchDir: "$input.outputDir"
      outputDir: "$input.outputDir"
---

# 可操作建议生成技能

## 功能概述

模式3扩展技能之一。基于 DeepResearch 的全部发现，生成具体、可操作的建议。

## 建议分类

| 场景 | 说明 |
|------|------|
| 教学改进 | 课堂教学、课程设计、教学方法 |
| 政策管理 | 制度制定、资源配置、组织管理 |
| 工具设计 | 产品功能、用户体验、界面设计 |
| 后续研究 | 研究设计、变量补充、方法改进 |

## 输出

- `actionable_insights.json`: 结构化建议列表

## 论文映射

- 体现系统的"实用价值"——从数据到行动的转化
