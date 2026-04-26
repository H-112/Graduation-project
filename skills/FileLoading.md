---
name: FileLoading
displayName: "加载数据文件"
tags: [core, data]
description: >
  加载并预览上传的 CSV 或 Excel 问卷文件。
  作为分析流水线的起点，提供文件元数据和内容预览。
version: "1.0.0"
applicableModes: [quick_overview, ai_insights, deep_research]
dependencies: []
mcpTools:
  - server: file-server
    tool: preview_file
    params:
      filePath: "$input.filePath"
---

# 文件加载技能

## 功能概述

加载上传的 CSV（`.csv`）或 Excel（`.xlsx`, `.xls`）问卷文件，调用 MCP `file-server` 的 `preview_file` 工具获取文件预览数据。

## 执行流程

1. 接收 `input.filePath`（上传文件在服务器上的绝对路径）
2. 调用 MCP 工具 `file-server / preview_file`
3. 解析返回的 JSON 数据
4. 将结果存入 `AnalysisContext`

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filePath` | string | 是 | 上传文件的绝对路径 |

## 输出（写入 AnalysisContext）

| 键 | 类型 | 说明 |
|------|------|------|
| `headers` | `string[]` | 列名列表 |
| `sampleRows` | `string[][]` | 前5行样本数据 |
| `totalRows` | `number` | 文件总行数 |
| `filePath` | `string` | 文件路径（透传） |

## 错误处理

- 文件不存在或格式不支持时，返回 `success: false`，终止流水线
- 这是整个 DAG 的根节点，失败则整个分析中止

## 论文映射

- 对应论文第4章"数据加载模块"
- 体现 MCP 协议的工具调用标准化
