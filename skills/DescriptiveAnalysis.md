---
name: DescriptiveAnalysis
description: >
  运行完整的模式1统计分析流水线。
  包括：数据清洗、题型自动检测、人口学分布、选择题统计、
  Likert 量表分析、多选题分析、中文文本 NLP。
  是系统的核心分析引擎，所有模式的基础。
version: "1.0.0"
applicableModes: [quick_overview, ai_insights, deep_research]
dependencies: [FileLoading, LlmStructureAnalysis]
mcpTools:
  - server: stats-server
    tool: analyze_dataset
    params:
      filePath: "$input.filePath"
      outputDir: "$input.outputDir"
      llmMap: "$context.llmMapFile"
      datasetName: "$input.datasetName"
---

# 描述性统计分析技能

## 功能概述

运行问卷分析系统的核心流水线，实现从原始数据到结构化统计结果的端到端转换。这是整个系统最复杂的技能，封装了 `analyze_generic.py` 的全部功能。

## 分析流水线（6 阶段）

### 1. 数据加载
- CSV：`csv.DictReader`，UTF-8-sig 编码
- Excel：`openpyxl`，read_only 模式

### 2. 数据清洗（5 步骤）
| 步骤 | 操作 | 说明 |
|------|------|------|
| 1 | 去除空行 | 所有列为空的行 |
| 2 | 去除重复 | 基于非空值指纹 |
| 3 | 去除低质 | 缺失率 > 80% 的行 |
| 4 | 文本标准化 | 去除首尾空白 |
| 5 | 跳过标记 | 替换"（跳过）"等标记为空 |

### 3. 题型自动检测
- **Likert 量表**：70%+ 值为 1-5 数字
- **多选题（单列）**：含 `┋` 或 `;` 分隔符
- **多选题（分列）**：列名含 `:` 且值为简短选项
- **单选题**：含 A/B/C/D 前缀或唯一值 ≤ 15
- **文本题**：默认 fallback
- **跳过列**：编号/序号/时间/IP 等元数据

### 4. LLM 结构校正（可选）
如果 `LlmStructureAnalysis` 成功运行：
- `demographic` → 强制归入人口学（即使唯一值很多）
- `likert` → 纠正规则引擎的文本 Likert 误判
- `text` → 恢复被误跳过的开放题
- `skip` → 跳过被误判为非题目的列

### 5. 分类统计
- **人口学分布**：含人口学关键词的单选题 → 频数/百分比
- **选择题统计**：非人口学单选题 + 多选题 → 频数/百分比
- **Likert 量表**：均值/中位数/标准差/1-5分布
- **文本 NLP**：jieba 分词 → 去停用词 → Top 50 关键词

### 6. 结果输出
- 写入 `{stem}_analysis.json` 到 `outputDir`
- 打印 `[RESULT]` 标记供 Node.js 解析
- 返回路径存入 `AnalysisContext`

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filePath` | string | 是 | 上传文件路径 |
| `outputDir` | string | 是 | 结果输出目录 |
| `llmMap` | string | 否 | LLM 结构分类文件路径 |
| `datasetName` | string | 否 | 数据集展示名称 |

## 输出（写入 AnalysisContext）

| 键 | 类型 | 说明 |
|------|------|------|
| `resultPath` | `string` | 分析结果 JSON 文件路径 |
| `analysis` | `QuickOverviewResult` | 完整分析数据对象 |
| `cleaning` | `CleaningStats` | 数据清洗统计 |
| `demographics` | `Record<string, CategoricalResult>` | 人口学分布 |
| `genaiUsage` | `Record<string, CategoricalResult>` | 选择题分布 |
| `likertScales` | `Record<string, DescriptiveStats[]>` | 量表得分 |
| `textAnalysis` | `Record<string, TextAnalysisResult>` | 文本 NLP 结果 |
| `totalRecords` | `number` | 有效记录数 |
| `totalFields` | `number` | 字段数 |

## 论文映射

- 对应论文第4章"统计分析引擎设计"
- 核心创新点：通用化设计（零硬编码，适配任意问卷）
- "数据清洗→题型检测→分类统计"三阶段流水线
