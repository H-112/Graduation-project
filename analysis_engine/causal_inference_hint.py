#!/usr/bin/env python3
"""
CausalInferenceHint — 因果推断可能性评估
从截面相关数据中识别具有因果研究潜力的关联方向
用法: python3 causal_inference_hint.py <mode1_json> <deep_research_dir> <output_dir>
输出: causal_inference_hints.json
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


def extract_associations(data: dict, dr_dir: Path) -> list:
    """提取所有显著关联"""
    associations = []

    # 从交叉分析提取
    cross = data.get('cross_analysis', [])
    for item in cross:
        if item.get('is_significant'):
            associations.append({
                "type": "cross_tab",
                "description": f"{sanitize_prompt_text(item['var_a']['label'])} 与 {sanitize_prompt_text(item['var_b']['label'])}",
                "var_a": item['var_a']['column'],
                "var_b": item['var_b']['column'],
                "statistic": f"χ²={item.get('chi2', 'N/A')}, p={item.get('p_value', 'N/A')}",
                "strength": item.get('cramers_v', 0),
            })

    # 从量表群体差异提取
    r2_path = dr_dir / "round_2_group_comparison.json"
    if r2_path.exists():
        try:
            r2 = load_json(str(r2_path))
            for f in r2.get('findings', []):
                associations.append({
                    "type": "group_diff",
                    "description": f"{sanitize_prompt_text(f['likert_column'])} 在 {sanitize_prompt_text(f['grouping_column'])} 上的差异",
                    "var_a": f['likert_column'],
                    "var_b": f['grouping_column'],
                    "statistic": f"{f['test']}={f['statistic']}, p={f['p_value']}",
                    "strength": 0.5,  # 默认中等
                })
        except Exception:
            pass

    # 从关联规则提取
    r4_path = dr_dir / "round_4_association_rules.json"
    if r4_path.exists():
        try:
            r4 = load_json(str(r4_path))
            for r in r4.get('rules', [])[:5]:
                associations.append({
                    "type": "association_rule",
                    "description": f"{sanitize_prompt_text(r['antecedent'])} → {sanitize_prompt_text(r['consequent'])}",
                    "var_a": r['antecedent'],
                    "var_b": r['consequent'],
                    "statistic": f"置信度={r['confidence']}, 提升度={r['lift']}",
                    "strength": r['confidence'],
                })
        except Exception:
            pass

    return associations


def assess_causal_potential(client, associations: list) -> list:
    """用 LLM 评估每个关联的因果潜力"""
    if not client or not associations:
        return []

    assoc_text = "\n".join([
        f"{i+1}. {a['description']} ({a['type']}), 统计量: {a['statistic']}"
        for i, a in enumerate(associations[:10])
    ])

    prompt = f"""你是一位因果推断方法论专家。请基于以下截面调查数据中的显著关联，评估每个关联的因果研究潜力。

重要提醒：截面数据不能直接推断因果。你的任务是识别"哪些关联值得后续用因果方法验证"，而不是宣称因果性。

显著关联列表：
{assoc_text}

请对每个关联返回评估，格式为 JSON：
{{
  "hints": [
    {{
      "association": "关联描述",
      "strength": "关联强度描述",
      "causal_potential": "high" | "medium" | "low",
      "reasoning": "因果潜力评估理由（100字以内）",
      "confounding_risks": ["可能的混淆变量1", "混淆变量2"],
      "suggested_methods": [
        {{"method": "建议方法名", "description": "方法说明（80字以内）"}}
      ]
    }}
  ],
  "general_warning": "相关不等于因果的通用提醒（100字以内）"
}}

评估标准：
- high: 存在合理的时间顺序、明确的因果机制、混淆变量可控
- medium: 有潜在因果机制但混淆风险较大
- low: 更可能是相关而非因果，或混淆变量太多"""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是因果推断方法论专家。只输出JSON，不输出任何其他文字。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.4,
            max_tokens=3000,
        )
        _track_usage(response)
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        result = json.loads(content)
        return result.get("hints", [])
    except Exception as e:
        progress(f"  LLM因果评估失败: {e}")
        return []


def main():
    if len(sys.argv) < 4:
        print("Usage: python3 causal_inference_hint.py <mode1_json> <deep_research_dir> <output_dir>")
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

    progress("CausalInferenceHint: 加载分析结果...")
    data = load_json(mode1_path)

    client = get_llm_client()

    progress("CausalInferenceHint: 提取显著关联...")
    associations = extract_associations(data, dr_dir)
    progress(f"  发现 {len(associations)} 个显著关联")

    progress("CausalInferenceHint: 评估因果潜力...")
    hints = assess_causal_potential(client, associations)

    high_count = sum(1 for h in hints if h.get("causal_potential") == "high")
    medium_count = sum(1 for h in hints if h.get("causal_potential") == "medium")
    low_count = sum(1 for h in hints if h.get("causal_potential") == "low")

    result = {
        "hints": hints,
        "summary": {
            "total": len(hints),
            "high": high_count,
            "medium": medium_count,
            "low": low_count,
        },
        "general_warning": "本研究为截面调查，所有关联均不能直接推断因果。以下分析仅提示具有因果研究潜力的方向。",
    }

    json_path = out_dir / "causal_inference_hints.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    progress(f"  ✓ 因果推断提示 JSON: {json_path.name} (高潜力: {high_count}, 中: {medium_count}, 低: {low_count})")

    progress("CausalInferenceHint 完成!")
    print(f"[RESULT] {json_path}", flush=True)
    _print_tokens()


if __name__ == '__main__':
    main()
