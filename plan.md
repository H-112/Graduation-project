# 智能体辅助问卷分析系统 — 架构设计与实施计划

## 一、系统概述

### 1.1 项目定位

面向研究者的智能问卷分析平台，支持三种渐进分析模式：

| 模式 | 名称 | 耗时 | 能力 | 产出 |
|---|---|---|---|---|
| 模式1 | 快速概览 | 10-30s | 描述性统计 + 本地NLP | 频数表、Likert量表、关键词提取 |
| 模式2 | AI洞察 | 3-5min | 模式1 + LLM深度分析 | 情感分析、主题提取、综合洞察报告 |
| 模式3 | 深度调研 | ~30min | 模式2 + 自主Agent | 完整研究报告（预留） |

### 1.2 核心设计原则

1. **不硬编码** — 前端展示框架、题型检测规则、Likert分值映射等均不硬编码，系统自动适应任意问卷结构
2. **LLM赋能的问卷理解** — 用DeepSeek分析问卷列名的语义，纠正规则引擎的误判（如人口学/量表/文本的混淆）
3. **渐进包含** — 模式2 ⊃ 模式1，模式3 ⊃ 模式2
4. **实时流式反馈** — SSE协议推送分析进度，用户可观察每一步执行状态

---

## 二、系统架构

```
┌──────────────────────────────────────────────────────┐
│  表现层 │ React Components + Tailwind + shadcn/ui     │
│         │ 仪表盘 / 数据集详情 / 上传分析 / 结果展示     │
├──────────────────────────────────────────────────────┤
│  API层  │ Next.js 14 App Router                       │
│         │ 上传 API / SSE 流式分析触发 / 结果读取       │
├──────────────────────────────────────────────────────┤
│  分析层 │ Python 离线分析引擎 (child_process)           │
│         │ 规则引擎 → LLM结构分析 → 统计分析 → NLP     │
├──────────────────────────────────────────────────────┤
│  LLM层  │ DeepSeek API                                │
│         │ 问卷结构理解 / 文本情感分析 / 洞察生成       │
├──────────────────────────────────────────────────────┤
│  数据层 │ 文件系统：CSV/Excel → JSON结果 → Markdown报告 │
│         │ data/uploads/ → data/results/ → public/     │
└──────────────────────────────────────────────────────┘
```

---

## 三、分析流水线

### 3.1 模式1：快速概览

```
上传文件 (CSV/Excel)
    │
    ▼
数据清洗: 去空行 → 去重 → 低质量过滤(缺>80%) → 标准化
    │
    ▼
规则检测: 跳过元数据 / 多选(┋分隔) / 多选(分列) / 单数Likert / 单数选项 / 文本
    │
    ▼ (可选 --llm-map)
LLM结构校正: 人口学识别 / Likert识别 / 跳过识别 / 分值映射(value_map)
    │
    ▼
分类统计: 人口学分布 / 选择题频数 / Likert量表(均值/标准差/分布)
         / 文本分析(jieba分词/去停用词/关键词Top50)
    │
    ▼
输出: {name}_analysis.json → public/data/results/
```

### 3.2 模式2：AI洞察

```
模式1 JSON结果
    │
    ▼
LLM逐题文本分析: 核心主题 / 情感倾向 / 深层洞察 / 代表性观点
    │
    ▼
LLM综合洞察报告: 核心发现 / 样本画像 / 关键维度分析 / 开放题洞察 / 建议
    │
    ▼
输出: .md报告 → public/llm-reports/
```

### 3.3 LLM问卷结构分析（核心创新）

**解决问题**: 纯规则引擎存在语义盲区——
- 含101个唯一值的"书院/院系"列被误判为文本题，实际是人口学
- 用"非常满意/比较满意/一般/..."形式表达的满意度被误判为单选题
- 开放文本反馈列因包含"提交"二字被误跳

**方案**: 将列名+采样值发送给DeepSeek，返回：
```json
{
  "column": "12.总体来说，您对校巴服务是否满意",
  "type": "likert",
  "value_map": {"非常满意": 5, "比较满意": 4, "一般": 3, "比较不满意": 2, "非常不满意": 1}
}
```

**不硬编码**: value_map由LLM根据实际数据动态生成，不依赖预定义的满意度/同意度词表。

---

## 四、关键技术实现

### 4.1 不硬编码原则

| 模块 | 不硬编码的做法 |
|---|---|
| 前端标签 | 不写死"GenAI使用行为"，统一用"选择题统计"/"人口学分布"/"量表分析" |
| 题型检测 | 不依赖固定的关键词清单，LLM理解列名语义进行校正 |
| Likert分值 | 不由预定义的满意度/同意度词表映射，LLM根据实际值动态生成value_map |
| 前端标签页 | 根据JSON中实际存在的数据动态显示/隐藏，空数据不显示标签 |
| LLM报告 | 不假设问卷主题（如GenAI），提示词通用化，适应任意问卷 |

### 4.2 SSE实时流式

```
POST /api/analysis/trigger
    │
    ▼
Response: text/event-stream
    │
    ├── data: {"type":"progress","stage":"mode1","message":"正在加载..."}
    ├── data: {"type":"progress","stage":"running","message":"清洗完成: 530 条"}
    ├── data: {"type":"progress","stage":"running","message":"[LLM校正] xxx → demographic"}
    ├── data: {"type":"progress","stage":"running","message":"正在保存..."}
    ├── data: {"type":"result","success":true,"resultUrl":"...","summary":{...}}
    └── data: {"type":"done"}
```

前端使用 `fetch().body.getReader()` 读取流（EventSource不支持POST），终端风格深色日志面板实时滚动。

### 4.3 数据清洗

| 步骤 | 方法 | 产出 |
|---|---|---|
| 去空行 | 全列空值检测 | removed_empty 计数 |
| 去重 | 非空值元组指纹 | removed_duplicates 计数 |
| 低质过滤 | 缺失值>80%排除 | removed_low_quality 计数 |
| 标准化 | 文本首尾空格trim | 清洗后数据 |
| 留存率 | 最终/原始×100% | retention_rate 百分比 |

### 4.4 自动题型检测

纯规则引擎的检测顺序（用于LLM校正前的基线）：

1. `skip` — 元数据关键词匹配（编号/ID/时间/IP/提交时间等）
2. `likert` — 70%+的值是1-5数字（不含┋分隔符）
3. `multi_select_single_col` — 15%+的值含┋或;分隔符
4. `multi_select_column` — header含":"且值为短选项（<100字）
5. `single_choice` — A/B/C/D或数字前缀 >30%，或唯一值≤15
6. `text` — 默认

LLM校正规则（`--llm-map`启用时）：
- `demographic` → 无论规则判什么，路由到人口学（LLM理解语义）
- `likert` → 规则判single_choice但header含"满意/体验/评价/频率"时覆盖
- `text` → 规则判skip但确认有长文本时恢复
- `skip` → 规则判了其他类型但LLM确认为元数据时跳过

---

## 五、前端页面

### 5.1 路由

```
/                          → 仪表盘首页
/datasets/[id]             → 预置数据集详情（7个，id=4/5/bus1/bus2/focus/plugin/deco）
/datasets/uploaded         → 上传文件结果展示（?url=...&reports=...）
/upload                    → 上传新问卷 + 分析模式选择 + SSE实时进度
```

### 5.2 数据集详情页 (`/datasets/[id]`)

标签页（根据数据动态显示，空tab隐藏）：
- 人口学分布 — 柱状进度条
- 选择题统计 — 频数分布条（标注"多选"+人均选择数）
- Likert量表 — 1-5分分布条+均值/标准差
- 文本分析 — 关键词排名
- AI洞察 — LLM生成的markdown报告

### 5.3 上传分析页 (`/upload`)

- 拖拽上传 → 预览表格 → 模式选择（模式1/模式2）→ SSE实时终端日志 → 结果摘要 → 跳转详情

---

## 六、数据流

```
data/uploads/xxx.csv              ← 用户上传
    │
    ▼  analyze_generic.py
data/results/xxx_analysis.json    ← 模式1结果
    │
    ├──→ public/data/results/     ← 同步提供Web访问
    │
    ▼  generic_llm_analysis.py
public/llm-reports/xxx_*.md       ← 模式2报告
```

### 6.1 JSON结果结构

```json
{
  "dataset": "文件名",
  "total_records": 530,
  "total_fields": 187,
  "analysis_mode": "quick_overview",
  "llm_structure_used": true,
  "cleaning": {
    "original_count": 555, "removed_empty": 0,
    "removed_duplicates": 0, "removed_low_quality": 25,
    "final_count": 530, "retention_rate": 95.5
  },
  "summary": { "totalResponses": 530, "questionCount": 109 },
  "demographics": { "列名": { "type": "single_choice", "distribution": [...] } },
  "genai_usage": { "列名": { "type": "单/multi_select", "distribution": [...] } },
  "likert_scales": { "满意度": [{ "mean": 1.366, "std": 0.702, "distribution": [...] }] },
  "text_analysis": { "列名": { "top_keywords": [...] } }
}
```

注：`genai_usage`为内部键名（向后兼容），前端统一显示为"选择题统计"。

---

## 七、分析引擎脚本

| 脚本 | 用途 |
|---|---|
| `analyze_generic.py` | 通用模式1引擎，支持 `--llm-map` LLM结构校正 |
| `llm_structure_analyzer.py` | LLM问卷结构分析：列类型+Likert value_map（动态生成，不硬编码） |
| `generic_llm_analysis.py` | 通用模式2引擎，读模式1结果→LLM文本分析+综合报告 |
| `preview_file.py` | 文件预览：取前5行→JSON |
| `generate_charts.py` | matplotlib图表生成 |

---

## 八、当前进度

### 已完成
- [x] 通用分析引擎：数据清洗 + 自动题型检测 + 统计分析 + NLP
- [x] LLM结构分析器：纠正规则引擎误判，动态生成Likert分值映射
- [x] 模式2 LLM深度分析：通用提示词，任意问卷自适应
- [x] SSE实时流式进度：前端终端风格日志面板
- [x] 7个预置数据集全部可展示
- [x] 文件上传 + 分析全流程
- [x] 前端不硬编码：通用标签/动态标签页/自适应
- [x] 多选题正确处理（┋分隔+分列两种格式）
- [x] 数据留存率与清洗详情展示
- [x] TypeScript类型安全，编译零错误

### 待实施
- [ ] 模式3自主Agent调研
- [ ] 分析结果PDF导出
- [ ] 用户认证系统
- [ ] 毕业论文撰写

---

## 九、论文映射

| 论文章节 | 对应系统模块 |
|---|---|
| 第1章 绪论 | 系统定位 + 渐进式三模式分析 |
| 第2章 技术综述 | Next.js + Python + DeepSeek + SSE |
| 第3章 需求分析 | 不硬编码设计 + 五模块架构 |
| 第4章 系统设计 | 分析流水线 + LLM结构校正 + SSE协议 |
| 第5章 系统实现 | analyze_generic + llm_structure_analyzer + 前端组件 |
| 第6章 测试评估 | 7份数据集测试 + LLM校正前后对比 |
| 第7章 总结 | 创新点：LLM赋能问卷理解 + 零硬编码 + 实时流式反馈 |
