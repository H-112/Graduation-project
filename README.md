# 智能体辅助问卷分析系统 (GenAI Survey Analysis)

基于大语言模型（DeepSeek）的智能问卷分析平台，支持任意问卷的自动识别与深度洞察。

## 三种渐进分析模式

| 模式 | 耗时 | 能力 | 产出 |
|------|------|------|------|
| **快速概览** | 10-30秒 | 描述性统计 + 本地NLP | 频数表、Likert量表、关键词提取 |
| **AI 洞察** | 1-5分钟 | 模式1 + LLM深度分析 | 情感分析、主题提取、综合洞察报告 |
| **深度研究** | 3-6分钟 | 模式2 + 自主Agent | 五轮探索 + 6项扩展洞察 + 完整研究报告 |

## 技术栈

- **前端**: Next.js 16 + React 19 + Tailwind CSS v4 + Recharts
- **后端**: Next.js App Router (SSE 流式推送)
- **LLM**: DeepSeek API (OpenAI 兼容接口)
- **MCP 协议**: @modelcontextprotocol/sdk v1.29 (JSON-RPC 2.0)
- **分析引擎**: Python 3.11 (pandas, scipy, scikit-learn, jieba, snownlp)
- **语言**: TypeScript 5 + Python 3.11

## 快速开始

### 环境准备

```bash
# 安装 Node.js 依赖
npm install

# 安装 Python 依赖
pip install openpyxl jieba snownlp scipy scikit-learn mlxtend openai

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 DEEPSEEK_API_KEY
```

### 开发运行

```bash
npm run dev
```

### 测试

```bash
# 端到端测试
tsx scripts/test-pipeline.ts

# Python 单元测试
pytest tests/python/ -v
```

## 项目结构

```
├── src/
│   ├── app/          # Next.js App Router (页面 + API)
│   ├── components/   # React 组件 (19个分析面板)
│   └── lib/
│       ├── agent/    # Skill DAG 编排层 (拓扑排序 + 层级并行)
│       ├── mcp/      # MCP 协议层 (6个 Server + 20+工具)
│       └── types.ts  # 核心类型定义
├── analysis_engine/  # Python 分析引擎
├── skills/           # 13个 Skill 定义文件 (Markdown + YAML)
├── data/             # 数据集/上传/结果/历史
└── servers/          # 独立服务 (NLP stdio)
```

## 核心设计原则

1. **零硬编码** — 题型检测规则、Likert 分值映射、前端展示全部自适应
2. **LLM 赋能问卷理解** — DeepSeek 语义分析纠正规则引擎误判
3. **渐进包含** — 模式2包含模式1，模式3包含模式2
4. **实时流式反馈** — SSE 协议推送分析进度
5. **优雅降级** — LLM 超时不中断核心统计分析

## 许可证

MIT
