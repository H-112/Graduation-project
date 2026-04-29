#!/usr/bin/env python3
"""
Mode 3 深度研究 Agent — 五轮探索循环
基于 Mode 1 分析结果，执行多轮假设-验证-迭代的深度研究
用法: python3 deep_research.py <input_json> <raw_file> <output_dir>
输出: round_1~4_*.json + deep_research_report.md
"""
import json
import csv
import math
import os
import sys
import re
from datetime import datetime
from pathlib import Path
import time
from utils import progress, validate_path, sanitize_prompt_text, analyze_sentiment
from env_loader import load_env
from collections import Counter, defaultdict
from typing import Any

try:
    from scipy import stats
    from scipy.stats import chi2_contingency, ttest_ind, f_oneway
except ImportError:
    stats = None
    chi2_contingency = None
    ttest_ind = None
    f_oneway = None

try:
    from mlxtend.frequent_patterns import apriori, association_rules
    from mlxtend.preprocessing import TransactionEncoder
except ImportError:
    apriori = None
    association_rules = None
    TransactionEncoder = None

try:
    from sklearn.cluster import KMeans
    from sklearn.feature_extraction.text import TfidfVectorizer
except ImportError:
    KMeans = None
    TfidfVectorizer = None

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

from tenacity import retry, stop_after_attempt, wait_exponential

_token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

def _track_usage(response):
    """累加 API token 用量"""
    global _token_usage
    if hasattr(response, 'usage') and response.usage:
        _token_usage["prompt_tokens"] += response.usage.prompt_tokens or 0
        _token_usage["completion_tokens"] += response.usage.completion_tokens or 0
        _token_usage["total_tokens"] += response.usage.total_tokens or 0

def _print_tokens():
    """打印 token 用量标记供 Node.js 解析"""
    print(f"[TOKENS] {json.dumps(_token_usage, ensure_ascii=False)}", flush=True)

# ── 工具函数 ────────────────────────────────────

load_env()

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

def get_llm_client():
    if not DEEPSEEK_API_KEY or not OpenAI:
        return None
    return OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10), reraise=True)
def _call_llm_with_retry(client, **kwargs):
    return client.chat.completions.create(**kwargs)

# ── 数据加载 ────────────────────────────────────

def load_json(path: str) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_raw_file(filepath: str) -> tuple[list[str], list[dict]]:
    p = Path(filepath)
    ext = p.suffix.lower()
    if ext == '.csv':
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            rows = list(reader)
        return headers, rows
    elif ext in ('.xlsx', '.xls'):
        import openpyxl
        wb = openpyxl.load_workbook(filepath)
        ws = wb.active
        headers = [ws.cell(1, c).value or f"Col{c}" for c in range(1, ws.max_column + 1)]
        rows = []
        for r in range(2, ws.max_row + 1):
            row = {}
            for c, h in enumerate(headers, 1):
                val = ws.cell(r, c).value
                row[h] = str(val).strip() if val is not None else ""
            rows.append(row)
        return headers, rows
    else:
        raise ValueError(f"不支持的文件格式: {ext}")

def clean_value(val: str) -> str:
    """清洗选项前缀"""
    val = val.strip()
    val = re.sub(r'^[A-Ea-e][\.\、）\)]\s*', '', val)
    val = re.sub(r'^\d+[\.\、）\)]\s*', '', val)
    return val

# ── Round 1: 人口学交叉分析 ─────────────────────

def round_1_cross_analysis(data: dict, headers: list, rows: list) -> dict:
    """人口学维度两两交叉分析 + 卡方检验"""
    progress("Round 1/5: 人口学交叉分析 — 检测群体间的关联...")

    demographics = data.get('demographics', {})
    if not demographics:
        progress("  无人口学数据，跳过")
        return {"findings": [], "total_pairs": 0, "significant": 0}

    dem_headers = list(demographics.keys())
    findings = []
    total_pairs = 0
    significant = 0

    if not chi2_contingency:
        progress("  警告: scipy 未安装，跳过卡方检验")
        return {"findings": findings, "total_pairs": total_pairs, "significant": significant}

    for i, h1 in enumerate(dem_headers):
        for h2 in dem_headers[i+1:]:
            total_pairs += 1
            # 构建交叉表
            table = defaultdict(lambda: defaultdict(int))
            for row in rows:
                v1 = clean_value(row.get(h1, ''))
                v2 = clean_value(row.get(h2, ''))
                if v1 and v2:
                    table[v1][v2] += 1

            if len(table) < 2 or max(len(set(v.keys())) for v in table.values()) < 2:
                continue

            # 转换为矩阵
            row_labels = sorted(table.keys())
            col_labels = sorted({c for counts in table.values() for c in counts})
            matrix = [[table[r].get(c, 0) for c in col_labels] for r in row_labels]

            try:
                chi2, p, dof, expected = chi2_contingency(matrix)
                if p < 0.05:
                    significant += 1
                    findings.append({
                        "dimension_a": h1[:80],
                        "dimension_b": h2[:80],
                        "chi2": round(chi2, 3),
                        "p_value": round(p, 4) if p >= 0.001 else "<0.001",
                        "significant": True,
                        "sample_table": {r: {c: table[r].get(c, 0) for c in col_labels[:3]} for r in row_labels[:3]}
                    })
                    progress(f"  ✓ {h1[:40]} × {h2[:40]}: χ²={chi2:.2f}, p={p:.4f} **显著**")
            except Exception as e:
                pass

    progress(f"  Round 1 完成: 检测 {total_pairs} 对维度，发现 {significant} 组显著关联")
    return {"findings": findings, "total_pairs": total_pairs, "significant": significant}

# ── Round 2: 量表群体差异 ───────────────────────

def round_2_group_comparison(data: dict, headers: list, rows: list) -> dict:
    """对不同人口学群体在 Likert 量表上的差异进行 t检验/ANOVA"""
    progress("Round 2/5: 量表群体差异 — 比较不同群体的评分...")

    demographics = data.get('demographics', {})
    likert = data.get('likert_scales', {})

    if not likert or not demographics:
        progress("  缺少量表或人口学数据，跳过")
        return {"findings": [], "total_tests": 0, "significant": 0}

    if not ttest_ind or not f_oneway:
        progress("  警告: scipy 未安装，跳过统计检验")
        return {"findings": [], "total_tests": 0, "significant": 0}

    # 收集所有 likert 项
    likert_items = []
    for group, items in likert.items():
        for item in items:
            likert_items.append(item)

    findings = []
    total_tests = 0
    significant = 0

    # 对每个量表，按每个人口学维度分组
    for item in likert_items:
        col = item['column']
        # 从原始数据中提取该列的数值分数
        scores_by_group = defaultdict(lambda: defaultdict(list))

        for row in rows:
            val = row.get(col, '').strip()
            if not val:
                continue
            score = None
            # 尝试直接解析数字
            try:
                score = int(float(val))
            except ValueError:
                # 尝试文本映射
                cleaned = clean_value(val)
                dist = item.get('distribution', [])
                for d in dist:
                    if d['score'] and cleaned in str(d.get('label', '')):
                        score = d['score']
                        break
                # 已知文本映射回退
                if score is None:
                    text_map = {
                        '非常不满意': 1, '比较不满意': 2, '一般': 3, '比较满意': 4, '非常满意': 5,
                        '非常不同意': 1, '比较不同意': 2, '同意': 4, '非常同意': 5,
                        '太少': 1, '偏少': 2, '合理': 3, '合适': 3, '适中': 3, '偏多': 4, '太多': 5,
                        '总是': 5, '经常': 4, '有时': 3, '偶尔': 2, '从不': 1,
                    }
                    score = text_map.get(cleaned)

            if score is not None and 1 <= score <= 5:
                for dem_col in demographics:
                    group_val = clean_value(row.get(dem_col, ''))
                    if group_val:
                        scores_by_group[dem_col][group_val].append(score)

        # 对每个分组进行统计检验
        for dem_col, groups in scores_by_group.items():
            group_names = [g for g, s in groups.items() if len(s) >= 5]
            if len(group_names) < 2:
                continue

            total_tests += 1
            group_samples = [groups[g] for g in group_names]

            try:
                if len(group_names) == 2:
                    # t检验
                    t_stat, p = ttest_ind(group_samples[0], group_samples[1], equal_var=False)
                    test_type = "t"
                else:
                    # ANOVA
                    f_stat, p = f_oneway(*group_samples)
                    t_stat = f_stat
                    test_type = "F"

                if p < 0.05:
                    significant += 1
                    means = {g: round(sum(s)/len(s), 3) for g, s in groups.items() if len(s) >= 5}
                    findings.append({
                        "likert_column": col[:80],
                        "grouping_column": dem_col[:80],
                        "test": test_type,
                        "statistic": round(float(t_stat), 3),
                        "p_value": round(p, 4) if p >= 0.001 else "<0.001",
                        "group_means": means,
                        "significant": True,
                    })
                    progress(f"  ✓ {col[:40]} × {dem_col[:40]}: {test_type}={t_stat:.2f}, p={p:.4f} **显著**")
            except Exception as e:
                import traceback
                print(f"[ERROR] {e}\n{traceback.format_exc()}", file=sys.stderr)
                pass

    progress(f"  Round 2 完成: 执行 {total_tests} 次检验，发现 {significant} 组显著差异")
    return {"findings": findings, "total_tests": total_tests, "significant": significant}

# ── Round 3: 开放题深度挖掘 ─────────────────────

def round_3_text_deep_dive(data: dict, headers: list, rows: list) -> dict:
    """开放题主题聚类 + 情感分析 + 代表性引文"""
    progress("Round 3/5: 开放题深度挖掘 — 主题聚类与情感分析...")

    text_analysis = data.get('text_analysis', {})
    if not text_analysis:
        progress("  无文本分析数据，跳过")
        return {"findings": [], "total_texts": 0}

    findings = []
    total_texts = 0

    for col, ta in text_analysis.items():
        texts = [row.get(col, '').strip() for row in rows if row.get(col, '').strip() and len(row.get(col, '').strip()) > 5]
        total_texts += len(texts)

        if len(texts) < 10:
            continue

        # 使用 utils.analyze_sentiment 进行情感分析
        sentiment_result = analyze_sentiment(texts)
        if sentiment_result:
            pos_count = int(sentiment_result["positive_ratio"] * len(texts) / 100)
            neg_count = int(sentiment_result["negative_ratio"] * len(texts) / 100)
            neu_count = len(texts) - pos_count - neg_count
            sentiment = {
                "positive": {"count": pos_count, "percentage": sentiment_result["positive_ratio"]},
                "neutral": {"count": neu_count, "percentage": sentiment_result["neutral_ratio"]},
                "negative": {"count": neg_count, "percentage": sentiment_result["negative_ratio"]},
            }
        else:
            total = len(texts)
            sentiment = {
                "positive": {"count": 0, "percentage": 0},
                "neutral": {"count": total, "percentage": 100},
                "negative": {"count": 0, "percentage": 0},
            }

        # 主题聚类（基于关键词）
        keywords = ta.get('top_keywords', [])
        themes = []
        if keywords:
            top_words = [k['word'] for k in keywords[:15]]
            # 简单主题：将高频词按共现分组
            themes = [{"theme": f"主题{i+1}: {w}", "keywords": [w], "count": keywords[i]['count']}
                      for i, w in enumerate(top_words[:5])]

        findings.append({
            "column": col[:80],
            "total_answers": len(texts),
            "sentiment": sentiment,
            "themes": themes,
            "avg_length": ta.get('avg_answer_length', 0),
        })
        progress(f"  ✓ {col[:50]}: {len(texts)} 条回答，情感分布 正{sentiment['positive']['percentage']}% 中{sentiment['neutral']['percentage']}% 负{sentiment['negative']['percentage']}%")
        time.sleep(0.3)

    progress(f"  Round 3 完成: 分析 {len(findings)} 道开放题，共 {total_texts} 条回答")
    return {"findings": findings, "total_texts": total_texts}

# ── Round 4: 关联规则挖掘 ─────────────────────────

def round_4_association_rules(data: dict, headers: list, rows: list) -> dict:
    """对单选题进行关联规则挖掘（Apriori）"""
    progress("Round 4/5: 关联规则挖掘 — 发现选项间的潜在关联...")

    if not apriori or not TransactionEncoder:
        progress("  警告: mlxtend 未安装，跳过关联规则挖掘")
        return {"rules": [], "total_rules": 0, "strong_rules": 0}

    usages = data.get('genai_usage', {})
    demographics = data.get('demographics', {})

    # 收集所有单选题
    choice_cols = []
    for key, u in usages.items():
        if u.get('type') in ('single_choice',):
            choice_cols.append(key)
    for key, d in demographics.items():
        if d.get('type') in ('single_choice',):
            choice_cols.append(key)

    if len(choice_cols) < 2:
        progress("  单选题数量不足，跳过")
        return {"rules": [], "total_rules": 0, "strong_rules": 0}

    # 构建交易数据集
    transactions = []
    for row in rows:
        items = []
        for col in choice_cols:
            val = clean_value(row.get(col, ''))
            if val:
                # 使用"列名=选项"作为项
                short_col = col[:30]
                items.append(f"{short_col}={val}")
        if len(items) >= 2:
            transactions.append(items)

    if len(transactions) < 10:
        progress("  有效交易数不足，跳过")
        return {"rules": [], "total_rules": 0, "strong_rules": 0}

    try:
        te = TransactionEncoder()
        te_ary = te.fit(transactions).transform(transactions)
        import pandas as pd
        df = pd.DataFrame(te_ary, columns=te.columns_)

        # Apriori: 最小支持度 10%
        freq_items = apriori(df, min_support=0.1, use_colnames=True)
        if len(freq_items) == 0:
            progress("  未找到频繁项集")
            return {"rules": [], "total_rules": 0, "strong_rules": 0}

        rules = association_rules(freq_items, metric="confidence", min_threshold=0.5)
        if len(rules) == 0:
            progress("  未找到强关联规则")
            return {"rules": [], "total_rules": 0, "strong_rules": 0}

        # 排序并筛选 top 规则
        rules = rules.sort_values('confidence', ascending=False)
        findings = []
        for _, r in rules.head(20).iterrows():
            ant = ', '.join(sorted(r['antecedents']))
            con = ', '.join(sorted(r['consequents']))
            findings.append({
                "antecedent": ant[:100],
                "consequent": con[:100],
                "support": round(r['support'], 3),
                "confidence": round(r['confidence'], 3),
                "lift": round(r['lift'], 3),
            })

        strong = sum(1 for f in findings if f['confidence'] >= 0.7)
        progress(f"  Round 4 完成: 发现 {len(findings)} 条关联规则，其中 {strong} 条强规则（置信度≥70%）")
        time.sleep(0.3)
        return {"rules": findings, "total_rules": len(findings), "strong_rules": strong}

    except Exception as e:
        progress(f"  关联规则分析失败: {e}")
        return {"rules": [], "total_rules": 0, "strong_rules": 0}

# ── Round 5: LLM 综合洞察 ─────────────────────────

def round_5_llm_synthesis(data: dict, round_results: list, out_dir: Path, base_name: str = "") -> str:
    """调用 LLM 生成综合深度洞察报告"""
    progress("Round 5/5: 调用 LLM 生成综合洞察报告...")

    client = get_llm_client()
    if not client:
        progress("  警告: LLM 客户端不可用，生成基础报告")
        return _generate_fallback_report(data, round_results)

    # 尝试读取 Mode 2 的 LLM 报告（只加载当前分析相关的）
    llm_reports_content = []
    for md_file in sorted(out_dir.glob("*.md")):
        if md_file.name == "deep_research_report.md":
            continue
        # 只加载与当前分析前缀匹配的报告，避免加载所有历史报告
        if base_name and base_name not in md_file.name:
            continue
        try:
            content = md_file.read_text('utf-8')
            llm_reports_content.append(f"## {md_file.name}\n{content}")
        except Exception as e:
            import traceback
            print(f"[ERROR] {e}\n{traceback.format_exc()}", file=sys.stderr)
            pass
    if llm_reports_content:
        progress(f"  已加载 {len(llm_reports_content)} 份 Mode 2 报告")

    # 构建上下文摘要
    ds_label = sanitize_prompt_text(data.get('dataset', '未知问卷'))
    n = data.get('total_records', 0)

    context_parts = [
        f"# {ds_label} 深度研究数据\n",
        f"**样本量**: {n}\n",
        f"**分析轮次**: 5 轮\n",
    ]

    # Round 1 摘要
    r1 = round_results[0]
    context_parts.append(f"\n## Round 1: 人口学交叉分析\n")
    context_parts.append(f"检测 {r1['total_pairs']} 对维度，发现 {r1['significant']} 组显著关联\n")
    for f in r1['findings'][:5]:
        context_parts.append(f"- {sanitize_prompt_text(f['dimension_a'])} × {sanitize_prompt_text(f['dimension_b'])}: χ²={f['chi2']}, p={f['p_value']}\n")

    # Round 2 摘要
    r2 = round_results[1]
    context_parts.append(f"\n## Round 2: 量表群体差异\n")
    context_parts.append(f"执行 {r2['total_tests']} 次检验，发现 {r2['significant']} 组显著差异\n")
    for f in r2['findings'][:5]:
        context_parts.append(f"- {sanitize_prompt_text(f['likert_column'][:50])} × {sanitize_prompt_text(f['grouping_column'][:30])}: {f['test']}={f['statistic']}, p={f['p_value']}\n")

    # Round 3 摘要
    r3 = round_results[2]
    context_parts.append(f"\n## Round 3: 开放题深度挖掘\n")
    context_parts.append(f"分析 {len(r3['findings'])} 道开放题，共 {r3['total_texts']} 条回答\n")
    for f in r3['findings'][:3]:
        s = f['sentiment']
        context_parts.append(f"- {sanitize_prompt_text(f['column'][:50])}: 正{s['positive']['percentage']}% 中{s['neutral']['percentage']}% 负{s['negative']['percentage']}%\n")

    # Round 4 摘要
    r4 = round_results[3]
    context_parts.append(f"\n## Round 4: 关联规则挖掘\n")
    context_parts.append(f"发现 {r4['total_rules']} 条规则，{r4['strong_rules']} 条强规则\n")
    for f in r4['rules'][:5]:
        context_parts.append(f"- {sanitize_prompt_text(f['antecedent'][:50])} → {sanitize_prompt_text(f['consequent'][:50])} (置信度 {f['confidence']}, 提升度 {f['lift']})\n")

    # Likert 量表摘要
    likert = data.get('likert_scales', {})
    if likert:
        context_parts.append(f"\n## 量表得分摘要\n")
        for group, items in likert.items():
            for item in items:
                context_parts.append(f"- {sanitize_prompt_text(item['column'][:60])}: 均值={item['mean']}, 标准差={item['std']}\n")

    # Mode 2 LLM 报告摘要
    if llm_reports_content:
        context_parts.append(f"\n## Mode 2 LLM 深度洞察报告\n")
        context_parts.append("以下是之前由 LLM 生成的逐题分析和综合洞察报告：\n")
        for rep in llm_reports_content:
            context_parts.append(rep + "\n")

    context = ''.join(context_parts)

    prompt = f"""基于以下多轮深度分析的结果（包括 Mode 1 统计分析、Mode 2 LLM 逐题洞察，以及 Mode 3 的五轮深度探索），直接输出报告内容，不要写开场白、自我介绍或"作为...顾问"等套话。

{context}

请按以下结构撰写报告（2000字以内，使用专业学术语言，直奔主题，不要写总标题）：

## 一、研究概述
简要说明研究目的、样本特征和分析方法。

## 二、核心发现
基于五轮分析的结果，提炼出 5-7 个最重要的发现。每个发现需要有数据支撑，并说明其统计显著性。

## 三、深层洞察
从数据中挖掘出的非显而易见的模式、关联和趋势。重点关注：
- 群体间的显著差异及其可能原因
- 变量间的意外关联
- 开放题中反映的深层诉求

## 四、矛盾与张力
数据中存在哪些看似矛盾的现象？这些矛盾背后可能反映了什么？

## 五、建议与启示
基于深度分析结果，提出 4-6 条具体、可操作的建议。

## 六、研究局限
简要说明本研究的局限性（如样本代表性、因果推断限制等）。

请用 Markdown 格式输出，标题层级清晰，关键数据加粗。"""

    try:
        response = _call_llm_with_retry(client,
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是资深社会科学研究顾问，擅长从多维度数据中提炼深层洞察并撰写高质量研究报告。输出必须简洁直接，禁止写开场白、自我介绍和套话。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=4000,
        )
        _track_usage(response)
        report = response.choices[0].message.content
        progress("  ✓ LLM 综合报告生成成功")
        return report
    except Exception as e:
        progress(f"  ✗ LLM 调用失败: {e}")
        return _generate_fallback_report(data, round_results)

def _generate_fallback_report(data: dict, round_results: list) -> str:
    """LLM 不可用时生成基础报告"""
    lines = []
    lines.append("> 本报告由智能体辅助问卷分析系统自动生成（Mode 3 深度研究）")
    lines.append("")
    lines.append("## 一、研究概述")
    lines.append(f"样本量: {data.get('total_records', 0)} | 分析模式: 深度研究（5轮探索循环）")
    lines.append("")
    lines.append("## 二、分析结果汇总")
    lines.append("")

    r1, r2, r3, r4 = round_results
    lines.append(f"### 人口学交叉分析")
    lines.append(f"- 检测 {r1['total_pairs']} 对维度，发现 **{r1['significant']}** 组显著关联")
    lines.append("")

    lines.append(f"### 量表群体差异")
    lines.append(f"- 执行 {r2['total_tests']} 次统计检验，发现 **{r2['significant']}** 组显著差异")
    lines.append("")

    lines.append(f"### 开放题深度挖掘")
    lines.append(f"- 分析 {len(r3['findings'])} 道开放题，共 {r3['total_texts']} 条回答")
    lines.append("")

    lines.append(f"### 关联规则挖掘")
    lines.append(f"- 发现 {r4['total_rules']} 条关联规则，其中 {r4['strong_rules']} 条强规则")
    lines.append("")

    lines.append("## 三、建议")
    lines.append("基于上述分析，建议进一步关注显著差异群体和强关联规则所揭示的模式。")
    lines.append("")
    lines.append(f"*报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}*")

    return '\n'.join(lines)

# ── 主流程 ──────────────────────────────────────

def main():
    if len(sys.argv) < 4:
        print("Usage: python3 deep_research.py <input_json> <raw_file> <output_dir>")
        sys.exit(1)

    # 每次运行重置 token 计数
    global _token_usage
    _token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    try:
        input_json = validate_path(sys.argv[1], must_exist=True)
        raw_file = validate_path(sys.argv[2], must_exist=True)
        output_dir = validate_path(sys.argv[3])
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    progress(f"深度研究 Agent 启动")
    progress(f"加载 Mode 1 分析结果: {Path(input_json).name}...")
    data = load_json(input_json)
    progress(f"样本量: {data.get('total_records', 0)}")

    progress(f"加载原始数据: {Path(raw_file).name}...")
    headers, rows = load_raw_file(raw_file)
    progress(f"原始数据: {len(headers)} 列, {len(rows)} 行")

    base_name = Path(input_json).stem
    if base_name.endswith('_analysis'):
        base_name = base_name[:-len('_analysis')]

    # ── 五轮分析 ──
    round_results = []

    r1 = round_1_cross_analysis(data, headers, rows)
    round_results.append(r1)
    r1_path = output_dir / "round_1_cross_analysis.json"
    with open(r1_path, 'w', encoding='utf-8') as f:
        json.dump(r1, f, ensure_ascii=False, indent=2)

    r2 = round_2_group_comparison(data, headers, rows)
    round_results.append(r2)
    r2_path = output_dir / "round_2_group_comparison.json"
    with open(r2_path, 'w', encoding='utf-8') as f:
        json.dump(r2, f, ensure_ascii=False, indent=2)

    r3 = round_3_text_deep_dive(data, headers, rows)
    round_results.append(r3)
    r3_path = output_dir / "round_3_text_deep_dive.json"
    with open(r3_path, 'w', encoding='utf-8') as f:
        json.dump(r3, f, ensure_ascii=False, indent=2)

    r4 = round_4_association_rules(data, headers, rows)
    round_results.append(r4)
    r4_path = output_dir / "round_4_association_rules.json"
    with open(r4_path, 'w', encoding='utf-8') as f:
        json.dump(r4, f, ensure_ascii=False, indent=2)

    report = round_5_llm_synthesis(data, round_results, output_dir, base_name)
    report_path = output_dir / "deep_research_report.md"
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    progress(f"  ✓ 深度研究报告: {report_path.name}")

    progress("深度研究 Agent 完成!")
    print(f"[RESULT] {report_path}", flush=True)
    _print_tokens()

if __name__ == '__main__':
    main()
