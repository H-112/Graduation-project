---
name: CausalInferenceHint
displayName: "因果推断提示"
tags: [insight, extension, causal]
description: >
  从截面相关数据中发现具有因果研究潜力的关联方向。
  评估因果可能性，指出混淆风险，建议后续验证方法（实验设计、工具变量、纵向追踪等）。
  明确提醒用户：相关不等于因果。
version: "1.0.0"
applicableModes: [deep_research]
dependencies: [DeepResearch]
when: "$context.total_records >= 30"
mcpTools:
  - server: insight-server
    tool: generate_causal_hints
    params:
      mode1ResultPath: "$context.resultPath"
      deepResearchDir: "$input.outputDir"
      outputDir: "$input.outputDir"
---

# 因果推断提示技能

## 功能概述

模式3扩展技能之一。问卷数据本质上是截面相关数据，不能直接做因果推断。本技能识别"哪些相关关系可能隐含因果机制"，并建议合适的验证方法。

## 核心价值

- 避免用户误把相关当因果
- 为后续研究提供因果验证方向
- 体现分析的专业深度

## 输出

- `causal_inference_hints.json`: 因果潜力评估结果

## 论文映射

- 支持论文"研究局限"中关于因果推断的讨论
- 为"未来研究方向"提供因果验证建议
