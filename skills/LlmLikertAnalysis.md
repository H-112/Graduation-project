---
name: LlmLikertAnalysis
displayName: "量表深度解读 (LLM)"
tags: [llm, insight, likert]
description: >
  使用 DeepSeek LLM 对模式1的量表（Likert scale）分析结果进行深度解读。
  为每个量表组生成：整体评价、题项解读、关注等级（低/中/高）、改进建议。
  输出 JSON 结构化数据（前端可直接渲染）和 Markdown 可视化报告。
  使用 JSON Schema 约束 LLM 输出，防止数据幻觉。
version: "1.0.0"
applicableModes: [ai_insights, deep_research]
dependencies: [DescriptiveAnalysis]
when: "$context.has_likert_scales"
mcpTools:
  - server: llm-gateway-server
    tool: analyze_likert_scales
    params:
      mode1ResultPath: "$context.resultPath"
      outputDir: "$input.outputDir"
---

# LLM 量表深度解读技能

## 功能概述

在模式1统计分析的基础上，调用 DeepSeek LLM 对 Likert 量表进行专业级深度解读。将"均值+标准差的数字罗列"升华为"有洞察力的研究结论"。

## 分析维度

### 逐量表组分析

| 维度 | 说明 | 输出格式 |
|------|------|---------|
| 整体评价 | 对该量表组的整体学术评价 | 文本 |
| 组整体均值 | 组内所有题项均值的平均值 | 数值 |
| 内部一致性 | 基于均值分布判断的可靠性描述 | 文本 |
| 优势 | 该量表表现良好的方面 | 文本列表 |
| 关注点 | 需要关注的题项或现象 | 文本列表 |

### 逐题项分析

| 字段 | 说明 | 来源 |
|------|------|------|
| column | 题项名称 | 原始数据 |
| mean | 均值 | 模式1统计 |
| std | 标准差 | 模式1统计 |
| median | 中位数 | 模式1统计 |
| interpretation | LLM 解读（80字以内） | LLM 生成 |
| concern_level | 关注等级：low/medium/high | **硬编码规则**（mean≥4.0为low，3.0≤mean<4.0为medium，mean<3.0为high） |
| suggestion | 改进建议（50字以内） | LLM 生成 |

### 跨量表发现

- 比较不同量表组的得分差异
- 识别得分模式（如"态度积极但行为消极"的矛盾）

## JSON Schema 约束

使用严格的 JSON Schema 约束 LLM 输出：

```json
{
  "scale_groups": [{
    "group_name": "string",
    "overall_assessment": "string",
    "overall_mean": "number",
    "reliability_indicator": "string",
    "strengths": ["string"],
    "concerns": ["string"],
    "items": [{
      "column": "string",
      "mean": "number",
      "std": "number",
      "median": "number",
      "interpretation": "string",
      "concern_level": "enum: [low, medium, high]",
      "suggestion": "string"
    }],
    "key_insight": "string"
  }],
  "cross_scale_findings": ["string"],
  "overall_recommendation": "string"
}
```

**防幻觉机制：**
1. 所有数值字段（mean, std, median）直接来自模式1 JSON，LLM 只负责解读
2. concern_level 由 Python 代码后校验硬编码规则，LLM 建议被覆盖
3. temperature=0.3，降低创造性，提高确定性
4. System Prompt 明确禁止编造数据

## 执行流程

1. 从 `context.resultPath` 获取模式1分析结果 JSON
2. 调用 MCP 工具 `llm-gateway-server / analyze_likert_scales`
3. Python 脚本 `likert_llm_analysis.py` 执行：
   - 提取 `likert_scales` 数据
   - 构建量表数据摘要 Prompt
   - 调用 DeepSeek API，要求 JSON Schema 格式返回
   - 后校验 concern_level（硬编码规则覆盖 LLM 输出）
   - 生成 Markdown 可视化报告（表格+洞察）
4. 输出文件同步到 `public/llm-reports/`
5. 将报告清单存入 `AnalysisContext`

## 输入参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mode1ResultPath` | string | 是 | 模式1 分析结果 JSON 路径 |
| `outputDir` | string | 是 | 报告输出目录 |

## 输出（写入 AnalysisContext）

| 键 | 类型 | 说明 |
|------|------|------|
| `likertReports` | `Array<{file, path}>` | 量表分析报告文件列表 |
| `likertAnalysis` | `object` | 量表分析 JSON 结构化数据 |

## 错误处理

- 无量表数据 → 跳过，返回空结果（不失败）
- LLM API 调用失败 → `success: false`，不影响其他分析
- JSON 解析失败 → 降级为失败，记录错误日志

## 论文映射

- 对应论文第5章"LLM 深度语义分析"的扩展
- 创新点：从"文本洞察"扩展到"量表洞察"，覆盖问卷分析的完整题型
- JSON Schema 约束体现"结构化生成"方法论，抑制 LLM 幻觉
