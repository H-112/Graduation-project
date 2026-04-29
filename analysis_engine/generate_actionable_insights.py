#!/usr/bin/env python3
"""
ActionableInsightGenerator — 基于深度分析结果生成可操作建议
用法: python3 generate_actionable_insights.py <mode1_json> <deep_research_dir> <output_dir>
输出: actionable_insights.json
"""
import json
import os
import sys
from pathlib import Path
from utils import progress, validate_path, sanitize_prompt_text

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

from tenacity import retry, stop_after_attempt, wait_exponential

_token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def _track_usage(response):
    global _token_usage
    if hasattr(response, 'usage') and response.usage:
        _token_usage["prompt_tokens"] += response.usage.prompt_tokens or 0
        _token_usage["completion_tokens"] += response.usage.completion_tokens or 0
        _token_usage["total_tokens"] += response.usage.total_tokens or 0


def _print_tokens():
    print(f"[TOKENS] {json.dumps(_token_usage, ensure_ascii=False)}", flush=True)


from env_loader import load_env

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


def load_json(path: str) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_findings_summary(data: dict, dr_dir: Path) -> str:
    """构建所有发现的摘要"""
    parts = []
    parts.append(f"# 研究概述")
    parts.append(f"数据集: {sanitize_prompt_text(data.get('dataset', '未知'))}")
    parts.append(f"样本量: {data.get('total_records', 0)}")
    parts.append(f"字段数: {data.get('total_fields', 0)}")

    # 人口学分布
    demographics = data.get('demographics', {})
    if demographics:
        parts.append(f"\n# 人口学分布")
        for col, result in list(demographics.items())[:3]:
            top = result.get('distribution', [])[:3]
            labels = [f"{sanitize_prompt_text(d['label'])}({d.get('percentage', d.get('percentage_in_respondents', 0))}%)" for d in top]
            parts.append(f"- {sanitize_prompt_text(col)}: {', '.join(labels)}")

    # Likert 摘要
    likert = data.get('likert_scales', {})
    if likert:
        parts.append(f"\n# 量表得分摘要")
        for group, items in likert.items():
            for item in items[:3]:
                parts.append(f"- {sanitize_prompt_text(item['column'])}: 均值={item['mean']}, 标准差={item['std']}")

    # 文本分析摘要
    text = data.get('text_analysis', {})
    if text:
        parts.append(f"\n# 文本分析摘要")
        for col, ta in list(text.items())[:3]:
            sentiment = ta.get('sentiment', {})
            if sentiment:
                parts.append(f"- {sanitize_prompt_text(col)}: 正面{sentiment.get('positive_ratio', 0)}% 中性{sentiment.get('neutral_ratio', 0)}% 负面{sentiment.get('negative_ratio', 0)}%")
            keywords = ta.get('top_keywords', [])[:5]
            if keywords:
                parts.append(f"  高频词: {', '.join([sanitize_prompt_text(k['word']) for k in keywords])}")

    # DeepResearch 发现
    for round_file in sorted(dr_dir.glob("round_*.json")):
        try:
            with open(round_file, 'r', encoding='utf-8') as f:
                rdata = json.load(f)
            findings = rdata.get('findings', rdata.get('rules', []))
            if findings:
                parts.append(f"\n# {round_file.stem} 关键发现")
                for f_item in findings[:3]:
                    if 'dimension_a' in f_item:
                        parts.append(f"- {sanitize_prompt_text(f_item['dimension_a'])} × {sanitize_prompt_text(f_item['dimension_b'])}: χ²={f_item.get('chi2', 'N/A')}, p={f_item.get('p_value', 'N/A')}")
                    elif 'likert_column' in f_item:
                        means = f_item.get('group_means', {})
                        means_str = ', '.join([f"{sanitize_prompt_text(k)}={v}" for k, v in list(means.items())[:3]])
                        parts.append(f"- {sanitize_prompt_text(f_item['likert_column'])} × {sanitize_prompt_text(f_item['grouping_column'])}: {f_item.get('test', 'N/A')}={f_item.get('statistic', 'N/A')}, p={f_item.get('p_value', 'N/A')}, 均值: {means_str}")
                    elif 'antecedent' in f_item:
                        parts.append(f"- {sanitize_prompt_text(f_item['antecedent'])} → {sanitize_prompt_text(f_item['consequent'])}: 置信度={f_item.get('confidence', 'N/A')}, 提升度={f_item.get('lift', 'N/A')}")
        except Exception as e:
            import traceback
            print(f"[ERROR] {e}\n{traceback.format_exc()}", file=sys.stderr)
            pass

    return "\n".join(parts)


def generate_insights(client, context: str) -> list:
    """用 LLM 生成可操作建议"""
    if not client:
        return []

    prompt = f"""你是一位资深研究顾问和政策分析师。请基于以下研究发现，生成具体、可操作的建议。

研究发现摘要：
{context[:4000]}

请生成5-8条建议，按以下格式返回 JSON：
{{
  "insights": [
    {{
      "id": "insight_001",
      "category": "教学改进" | "政策管理" | "工具设计" | "后续研究",
      "priority": "high" | "medium" | "low",
      "title": "建议标题（30字以内）",
      "description": "建议详细描述（100字以内）",
      "evidence": [
        {{"finding": "数据发现", "source": "来源"}}
      ],
      "difficulty": "低" | "中" | "高",
      "stakeholders": ["利益相关者1", "利益相关者2"],
      "expected_outcome": "预期效果（50字以内）"
    }}
  ]
}}

要求：
- 每条建议必须有具体的数据证据支撑
- 优先级high的建议不超过3条
- 建议要具体可操作，避免空泛表述
- 覆盖不同场景（至少2个category）"""

    try:
        response = _call_llm_with_retry(client,
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是资深研究顾问和政策分析师。只输出JSON，不输出任何其他文字。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.5,
            max_tokens=3000,
        )
        _track_usage(response)
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        result = json.loads(content)
        return result.get("insights", [])
    except Exception as e:
        progress(f"  LLM建议生成失败: {e}")
        return []


def main():
    if len(sys.argv) < 4:
        print("Usage: python3 generate_actionable_insights.py <mode1_json> <deep_research_dir> <output_dir>")
        sys.exit(1)

    try:
        mode1_path = validate_path(sys.argv[1], must_exist=True)
        dr_dir = validate_path(sys.argv[2], must_exist=True)
        out_dir = validate_path(sys.argv[3])
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    dr_dir = Path(dr_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    progress("ActionableInsight: 加载分析结果...")
    data = load_json(mode1_path)

    client = get_llm_client()

    progress("ActionableInsight: 汇总研究发现...")
    context = build_findings_summary(data, dr_dir)

    progress("ActionableInsight: 生成可操作建议...")
    insights = generate_insights(client, context)

    priority_summary = {"high": 0, "medium": 0, "low": 0}
    for ins in insights:
        p = ins.get("priority", "medium")
        priority_summary[p] = priority_summary.get(p, 0) + 1

    result = {
        "insights": insights,
        "priority_summary": priority_summary,
        "total": len(insights),
    }

    json_path = out_dir / "actionable_insights.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    progress(f"  ✓ 可操作建议 JSON: {json_path.name} ({len(insights)} 条建议)")

    progress("ActionableInsight 完成!")
    print(f"[RESULT] {json_path}", flush=True)
    _print_tokens()


if __name__ == '__main__':
    main()
