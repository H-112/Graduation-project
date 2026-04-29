---
name: NlpKeywordExtraction
displayName: 关键词提取（NLP）
description: >
  使用官方 MCP SDK stdio 模式的 NlpServer 对数据集名称进行关键词提取。
  作为 stdio PoC 验证 skill，确保 PipelineExecutor → McpClient → stdio Server
  的完整链路可正常工作。结果写入 AnalysisContext 供下游使用。
version: "1.0.0"
applicableModes: [quick_overview, ai_insights, deep_research]
dependencies: [DescriptiveAnalysis]
mcpTools:
  - server: nlp-server
    tool: extract_keywords
    params:
      text: "$input.datasetName"
---

# NLP 关键词提取技能（stdio PoC）

## 功能概述

通过官方 MCP SDK 的 stdio 传输模式调用独立 NlpServer，对数据集名称进行中文关键词提取。验证 PipelineExecutor 对 stdio Server 的路由和调用能力。

## 执行流程

1. PipelineExecutor 检查依赖 `DescriptiveAnalysis` 是否成功
2. 解析 `$input.datasetName` 为实际字符串
3. 通过 `McpClient` 路由到 stdio 连接（启动 `servers/nlp-stdio-server.ts` 子进程）
4. 调用 `extract_keywords` 工具，传入单个文本
5. NlpServer 内部将单字符串包装为数组，执行分词 → 去停用词 → 统计 → 排序
6. 返回 JSON 结果，PipelineExecutor 写入 AnalysisContext

## 输入参数

| 参数 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `text` | `string` | `$input.datasetName` | 数据集展示名称 |

## 输出（写入 AnalysisContext）

| 键 | 类型 | 说明 |
|------|------|------|
| `keywords` | `KeywordEntry[]` | 提取的关键词列表 |
| `total_texts` | `number` | 输入文本数（始终为 1） |
| `unique_keywords` | `number` | 去重后关键词数 |

## 论文映射

- 对应论文第5章"MCP 协议层扩展实验"
- stdio 传输模式 vs 进程内调用的性能对比数据可在此 skill 运行时采集
