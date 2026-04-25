---
name: DeepResearch
description: >
  自主 Agent 探索循环（模式3 预留）。
  基于模式1+2的全部发现，提出追问假设，迭代调用 MCP 工具验证，
  最终生成深度研究报告。
  当前为骨架实现，为后续多轮 Agent 探索预留接口。
version: "0.1.0"
applicableModes: [deep_research]
dependencies: [DescriptiveAnalysis, LlmTextInsight, LlmComprehensiveReport]
mcpTools: []
---

# 深度研究 Agent 技能（模式3 预留）

## 功能概述

模式3是系统的最高分析深度。在获得模式1的统计数据和模式2的 LLM 洞察后，Agent 进入自主探索循环，通过"假设 → 验证 → 迭代"的科学研究范式，产出超越简单统计的深度报告。

## Agent Loop 设计（规划中）

```
┌─────────────────────────────────────────────┐
│  深度研究 Agent 循环                         │
│                                              │
│  1. ExtractFindings(context)                 │
│     └── 从已有结果提取关键发现               │
│              │                               │
│     ┌────────▼────────┐                      │
│     │  还有未探索的    │── 否 ──→ 合成报告    │
│     │  假设？         │                      │
│     └────────┬────────┘                      │
│              │ 是                            │
│     ┌────────▼────────┐                      │
│  2. │ GenerateHypotheses(findings)  │         │
│     │ 用 LLM 生成 3-5 个追问假设    │         │
│     └────────┬────────┘                      │
│              │                               │
│     ┌────────▼────────┐                      │
│  3. │ PlanToolCalls(hypothesis)     │         │
│     │ 规划验证所需的 MCP 工具调用   │         │
│     └────────┬────────┘                      │
│              │                               │
│     ┌────────▼────────┐                      │
│  4. │ ExecuteToolCalls(plan)        │         │
│     │ 通过 mcpClient.callTool 执行  │         │
│     └────────┬────────┘                      │
│              │                               │
│     ┌────────▼────────┐                      │
│  5. │ EvaluateResults(results)      │         │
│     │ 评估结果 → 回到步骤1          │         │
│     └─────────────────┘                      │
└─────────────────────────────────────────────┘
```

## 预设研究方向（骨架实现）

当前骨架模式下生成的 4 个研究方向：

1. **样本代表性分析**：基于人口学分布与目标总体的统计检验
2. **关键维度交叉分析**：年级 × 专业 × 性别 × 使用行为的关联
3. **深层需求挖掘**：从开放题提炼受访者的核心诉求和未被满足的需求
4. **趋势与关联模式**：检测变量间的潜在关联（相关/因果假设）

## 输入（从 AnalysisContext 读取）

| 键 | 来源 | 说明 |
|------|------|------|
| `analysis` | DescriptiveAnalysis | 完整统计分析数据 |
| `reports` | LlmTextInsight | LLM 报告列表 |
| `totalRecords` | DescriptiveAnalysis | 样本量 |
| `totalFields` | DescriptiveAnalysis | 字段数 |

## 输出（写入 AnalysisContext）

| 键 | 类型 | 说明 |
|------|------|------|
| `hypothesesExplored` | `number` | 探索的假设数量 |
| `hypotheses` | `string[]` | 假设列表 |
| `mode3Implemented` | `boolean` | 完整模式3是否已实现 |

## 论文映射

- 对应论文第5章"自主 Agent 探索循环"
- 这是论文的核心创新点之一：从"被动统计"到"主动探索"
- 体现"假设-验证-迭代"的科学研究方法论
- 当前状态：骨架实现，完整 Agent Loop 为后续工作

## 后续扩展方向

- 接入 LangChain / CrewAI 等成熟 Agent 框架
- 实现 ReAct（Reasoning + Acting）模式
- 支持多 Agent 协作（统计分析师 + 领域专家 + 报告撰写者）
- 工具调用的自动规划（LLM 生成 MCP 调用序列）
