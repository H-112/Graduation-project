---
name: SampleBiasAssessment
description: >
  诊断问卷样本的各类偏差风险：选择偏差、无应答偏差、覆盖偏差、缺失模式偏差。
  评估偏差对研究结论的潜在影响，提出缓解建议，提升研究的可推广性。
version: "1.0.0"
applicableModes: [deep_research]
dependencies: [DeepResearch]
mcpTools:
  - server: insight-server
    tool: assess_sample_bias
    params:
      mode1ResultPath: "$context.resultPath"
      rawFile: "$input.filePath"
      outputDir: "$input.outputDir"
---

# 样本偏差诊断技能

## 功能概述

模式3扩展技能之一。主动诊断样本的各类偏差风险，评估其对研究结论的潜在影响。

## 诊断维度

| 偏差类型 | 说明 |
|----------|------|
| 选择偏差 | 样本人口学分布与总体偏离 |
| 无应答偏差 | 未应答者与应答者的系统差异 |
| 覆盖偏差 | 遗漏特定群体的风险 |
| 缺失模式偏差 | 缺失值非随机分布 |

## 输出

- `sample_bias_assessment.json`: 结构化偏差诊断

## 论文映射

- 直接支持论文"研究局限"中关于样本代表性的讨论
- 提升研究结论的可信度
