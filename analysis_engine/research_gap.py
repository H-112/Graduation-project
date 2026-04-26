#!/usr/bin/env python3
"""
ResearchGapAnalyzer — 研究缺口识别
基于全部分析结果，识别未覆盖维度、方法局限和理论盲区
用法: python3 research_gap.py <mode1_json> <deep_research_dir> <output_dir>
输出: research_gap.json
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

_token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def _track_usage(response):
    global _token_usage
    if hasattr(response, 'usage') and response.usage:
        _token_usage["prompt_tokens"] += response.usage.prompt_tokens or 0
        _token_usage["completion_tokens"] += response.usage.completion_tokens or 0
        _token_usage["total_tokens"] += response.usage.total_tokens or 0


def _print_tokens():
    print(f"[TOKENS] {json.dumps(_token_usage, ensure_ascii=False)}", flush=True)


def load_env():
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    if k not in os.environ:
                        os.environ[k] = v


load_env()
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"


def get_llm_client():
    if not DEEPSEEK_API_KEY or not OpenAI:
        return None
    return OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)


def load_json(path: str) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_analysis_context(data: dict, dr_dir: Path) -> str:
    """构建已分析内容的上下文"""
    parts = []
    parts.append(f"# 研究概述")
    parts.append(f"数据集: {sanitize_prompt_text(data.get('dataset', '未知'))}")
    parts.append(f"样本量: {data.get('total_records', 0)}")
    parts.append(f"字段数: {data.get('total_fields', 0)}")

    # 已分析的维度
    parts.append(f"\n# 已分析维度")
    demographics = [sanitize_prompt_text(c) for c in data.get('demographics', {}).keys()]
    if demographics:
        parts.append(f"- 人口学: {', '.join(demographics)}")
    likert_groups = [sanitize_prompt_text(c) for c in data.get('likert_scales', {}).keys()]
    if likert_groups:
        parts.append(f"- 量表: {', '.join(likert_groups)}")
    text_cols = [sanitize_prompt_text(c) for c in data.get('text_analysis', {}).keys()]
    if text_cols:
        parts.append(f"- 开放题: {', '.join(text_cols)}")
    usage_cols = [sanitize_prompt_text(c) for c in list(data.get('genai_usage', {}).keys())[:5]]
    if usage_cols:
        parts.append(f"- 选择题: {', '.join(usage_cols)}...")

    # 已执行的分析方法
    parts.append(f"\n# 已执行分析方法")
    for round_file in sorted(dr_dir.glob("round_*.json")):
        parts.append(f"- {round_file.stem}")

    # 关键发现
    parts.append(f"\n# 关键发现")
    for round_file in sorted(dr_dir.glob("round_*.json")):
        try:
            with open(round_file, 'r', encoding='utf-8') as f:
                rdata = json.load(f)
            findings = rdata.get('findings', rdata.get('rules', []))
            if findings:
                for f_item in findings[:2]:
                    if 'dimension_a' in f_item:
                        parts.append(f"- {sanitize_prompt_text(f_item['dimension_a'])} × {sanitize_prompt_text(f_item['dimension_b'])}: p={f_item.get('p_value', 'N/A')}")
                    elif 'likert_column' in f_item:
                        parts.append(f"- {sanitize_prompt_text(f_item['likert_column'])} 在 {sanitize_prompt_text(f_item['grouping_column'])} 上存在显著差异")
                    elif 'antecedent' in f_item:
                        parts.append(f"- {sanitize_prompt_text(f_item['antecedent'])} → {sanitize_prompt_text(f_item['consequent'])} (置信度{f_item.get('confidence', 'N/A')})")
        except Exception:
            pass

    return "\n".join(parts)


def analyze_gaps(client, context: str) -> dict:
    """用 LLM 识别研究缺口"""
    if not client:
        return {
            "covered_questions": [],
            "gaps": [],
            "future_research": [],
        }

    prompt = f"""你是一位严谨的研究方法论专家。请基于以下已完成的分析内容，识别研究缺口和未来方向。

已完成的分析：
{context[:4000]}

请返回 JSON：
{{
  "covered_questions": [
    {{"question": "已回答的研究问题", "answered_by": "分析方法"}}
  ],
  "gaps": [
    {{
      "category": "数据缺口" | "方法缺口" | "理论缺口" | "群体缺口",
      "severity": "high" | "medium" | "low",
      "description": "缺口描述（100字以内）",
      "impact": "对研究结论的潜在影响（80字以内）",
      "mitigation": "缓解建议（80字以内）"
    }}
  ],
  "future_research": [
    "具体的未来研究方向建议（每条50字以内）"
  ]
}}

要求：
- 覆盖4个类别（数据/方法/理论/群体）
- high severity 的缺口不少于1个
- future_research 不少于3条
- 要具体，避免空泛表述"""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是严谨的研究方法论专家。只输出JSON，不输出任何其他文字。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.4,
            max_tokens=3000,
        )
        _track_usage(response)
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except Exception as e:
        progress(f"  LLM缺口分析失败: {e}")
        return {
            "covered_questions": [],
            "gaps": [],
            "future_research": [],
        }


def main():
    if len(sys.argv) < 4:
        print("Usage: python3 research_gap.py <mode1_json> <deep_research_dir> <output_dir>")
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

    progress("ResearchGap: 加载分析结果...")
    data = load_json(mode1_path)

    client = get_llm_client()

    progress("ResearchGap: 构建分析上下文...")
    context = build_analysis_context(data, dr_dir)

    progress("ResearchGap: 识别研究缺口...")
    result = analyze_gaps(client, context)

    json_path = out_dir / "research_gap.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    gap_count = len(result.get("gaps", []))
    progress(f"  ✓ 研究缺口 JSON: {json_path.name} ({gap_count} 个缺口)")

    progress("ResearchGap 完成!")
    print(f"[RESULT] {json_path}", flush=True)
    _print_tokens()


if __name__ == '__main__':
    main()
