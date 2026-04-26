---
name: LlmTextInsight
displayName: "文本洞察分析 (LLM)"
tags: [llm, insight, text]
description: >
  使用 DeepSeek LLM 对模式1的文本分析结果进行深度洞察。
  为每道开放题生成：核心主题提炼、情感倾向分析、
  深层需求挖掘、代表性观点推测。
  同时生成一份覆盖所有维度的综合洞察报告。
version: "1.0.0"
applicableModes: [ai_insights, deep_research]
dependencies: [DescriptiveAnalysis]
when: "$context.has_text_fields"
mcpTools:
  - server: llm-gateway-server
    tool: run_llm_analysis
    params:
      mode1ResultPath: "$context.resultPath"
      outputDir: "$input.outputDir"
---

# LLM 文本深度洞察技能

## 功能概述

在模式1统计分析的基础上，调用 DeepSeek LLM 进行语义级深度分析。这是模式2的核心技能，将"数据统计"升华为"洞察理解"。

## 分析维度

### 逐题文本分析（每道开放题生成独立报告）

| 分析维度 | 说明 | Prompt 策略 |
|----------|------|------------|
| 核心主题 | 从高频关键词提炼 3-5 个主题聚类 | 归纳推理 |
| 情感倾向 | 积极/中性/消极比例估计 | 情感分类 |
| 深层洞察 | 受访者表达背后的需求/问题 | 溯因分析 |
| 代表性观点 | 推测最可能的几种典型回答 | 观点合成 |

### 综合洞察报告

| 章节 | 内容 |
|------|------|
| 一、核心发现 | 3-5 个数据支撑的关键发现 |
| 二、样本特征画像 | 群体特征和行为模式描述 |
| 三、关键维度分析 | 量表得分解读和意义分析 |
| 四、开放题洞察 | 核心诉求和关注点提炼 |
| 五、建议与启示 | 3-5 条可操作的具体建议 |

## 执行流程

1. 从 `context.resultPath` 获取模式1分析结果 JSON 路径
2. 调用 MCP 工具 `llm-gateway-server / run_llm_analysis`
3. Python 脚本 `generic_llm_analysis.py` 执行：
   - 构建数据摘要（人口学+量表+关键词）
   - 逐道文本题调用 DeepSeek API（temperature=0.7）
   - 生成综合报告（temperature=0.8）
4. 报告文件同步到 `public/llm-reports/`（Web 可访问）
5. 将报告清单存入 `AnalysisContext`

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode1ResultPath` | string | 是 | 模式1 分析结果 JSON 路径 |
| `outputDir` | string | 是 | 报告输出目录 |

## 输出（写入 AnalysisContext）

| 键 | 类型 | 说明 |
|------|------|------|
| `reports` | `Array<{file, path}>` | 所有生成的报告文件列表 |
| `reportCount` | `number` | 报告总数 |

## 错误处理

- LLM API 调用失败 → `success: false`，但模式1结果仍然可用（优雅降级）
- 无文本题 → 跳过逐题分析，仅生成综合报告
- API Key 未配置 → 立即失败，提示配置

## 论文映射

- 对应论文第5章"LLM 深度语义分析"
- 创新点：从"词频统计"到"语义洞察"的能力跃迁
- DeepSeek API 作为分析后端的成本/效果权衡
