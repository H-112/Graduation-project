---
name: LlmStructureAnalysis
description: >
  使用 DeepSeek LLM 对问卷列结构进行语义分类。
  识别每列的题型（人口学/单选/多选/量表/文本/跳过），
  为 Likert 量表提供文本→分值的动态映射。
  纠正纯规则引擎的语义盲区（如将高校名称误判为文本题）。
version: "1.0.0"
applicableModes: [ai_insights, deep_research]
dependencies: [FileLoading]
mcpTools:
  - server: llm-gateway-server
    tool: analyze_structure
    params:
      filePath: "$input.filePath"
---

# LLM 问卷结构分析技能

## 功能概述

在规则引擎运行前，先用 DeepSeek LLM 对问卷的所有列进行语义级分类。LLM 能识别"书院/院系/大学名称"等需要语义理解的列类型，从而纠正后续 `analyze_generic.py` 规则引擎可能出现的误判。

## 为什么需要这个技能？

规则引擎 `detect_question_type()` 的局限性：
- 只根据唯一值数量和值格式判断题型
- "清华大学"、"北京大学"等高校名称有上百个不同值 → 规则引擎误判为 `text`
- "2023年9月" 等日期 → 规则引擎无法识别为人口学信息

LLM 的语义理解能力解决了这些问题，使人口学分类准确率从 ~30% 提升到 ~95%。

## 执行流程

1. 从 `input.filePath` 读取文件路径
2. 调用 MCP 工具 `llm-gateway-server / analyze_structure`
3. 将 LLM 分类结果保存为临时 JSON 文件
4. 将 `llmMapFile` 路径存入 `AnalysisContext`（供 `DescriptiveAnalysis` 使用）

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filePath` | string | 是 | 上传文件的绝对路径 |

## 输出（写入 AnalysisContext）

| 键 | 类型 | 说明 |
|------|------|------|
| `llmMapFile` | `string \| null` | LLM 分类结果 JSON 文件路径，失败时为 null |
| `classification` | `object \| null` | 分类结果对象（含 `columns` 数组和 `summary` 统计） |
| `fallback` | `boolean` | 是否回退到纯规则引擎模式 |

## 错误处理

- LLM API 调用失败 → **不阻断流水线**，设置 `fallback: true`
- 未配置 API Key → **不阻断流水线**，使用规则引擎
- 该技能设计为"尽力而为"（best-effort），失败自动降级

## 论文映射

- 对应论文第5章"LLM 辅助问卷结构识别"
- 体现"语义理解 + 规则引擎"混合策略
- 创新点：LLM 作为规则引擎的"校正器"，而非替代品
