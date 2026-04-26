---
name: TheoryMapping
description: >
  将深度研究发现自适应映射到对应领域的经典理论框架。
  自动识别问卷主题领域（教育技术/心理学/社会学/管理学/健康行为/媒介传播等），
  加载对应理论库，识别数据对现有理论的支持、反驳或扩展关系，生成理论贡献声明。
version: "1.0.0"
applicableModes: [deep_research]
dependencies: [DeepResearch]
mcpTools:
  - server: insight-server
    tool: map_theories
    params:
      mode1ResultPath: "$context.resultPath"
      deepResearchDir: "$input.outputDir"
      outputDir: "$input.outputDir"
---

# 理论框架映射技能

## 功能概述

模式3扩展技能之一。在 DeepResearch 完成核心探索后，本技能自动识别问卷所属研究领域，加载对应理论库，将数据发现与经典理论进行系统映射。

## 领域自适应机制

1. **领域识别**：基于问卷标题、列名、关键词，LLM 判断主题领域
2. **理论库加载**：从内置多领域理论库（theory_knowledge_base.json）加载对应理论
3. **映射评估**：对每个理论评估数据的支持/反驳/扩展/中性关系

## 支持领域

| 领域 | 代表理论 |
|------|---------|
| 教育技术 | TAM, UTAUT, TPACK, SAMR |
| 教育心理学 | 自我决定理论, 建构主义, 认知负荷, 心流理论 |
| 社会科学 | 社会资本, 计划行为理论, 社会认知理论 |
| 组织行为 | 变革管理, JD-R, 创新扩散 |
| 健康行为 | 健康信念模型, 跨理论模型 |
| 媒介传播 | 使用与满足, 技术焦虑 |

## 输出

- `theory_mapping.json`: 结构化映射结果
- `theory_mapping_report.md`: 可读报告

## 论文映射

- 体现系统的"理论敏感度"——从数据到理论的跃迁
- 支持论文"理论贡献"章节的撰写