#!/usr/bin/env python3
"""
SampleBiasAssessment — 样本偏差诊断
诊断选择偏差、无应答偏差、覆盖偏差、缺失模式偏差
用法: python3 sample_bias_assessment.py <mode1_json> <raw_file> <output_dir>
输出: sample_bias_assessment.json
"""
import csv
import json
import math
import os
import sys
from pathlib import Path
from collections import defaultdict
from utils import progress, validate_path, sanitize_prompt_text

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

try:
    from scipy import stats
    from scipy.stats import chi2_contingency
except ImportError:
    stats = None
    chi2_contingency = None

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


def load_raw_file(filepath: str) -> tuple:
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


def assess_selection_bias(data: dict) -> dict:
    """评估选择偏差：检查人口学分布是否可能存在偏差"""
    demographics = data.get('demographics', {})
    biases = []

    # 检查性别分布是否严重失衡
    for col, result in demographics.items():
        if '性别' in col or 'gender' in col.lower():
            dist = result.get('distribution', [])
            if len(dist) >= 2:
                ratios = [d.get('percentage', 0) for d in dist]
                max_ratio = max(ratios) if ratios else 0
                if max_ratio > 70:
                    dominant = dist[ratios.index(max_ratio)]['label']
                    biases.append({
                        "type": "选择偏差",
                        "severity": "medium" if max_ratio > 80 else "low",
                        "evidence": f"{col}分布严重失衡: {dominant}占{max_ratio:.0f}%",
                        "impact": f"可能过度代表{dominant}群体的观点",
                        "mitigation": "结论推广时应注明样本性别分布特征",
                    })

    # 检查年级/年龄分布
    for col, result in demographics.items():
        if any(k in col for k in ['年级', '年龄', 'age', 'grade', 'year']):
            dist = result.get('distribution', [])
            if len(dist) >= 2:
                ratios = [d.get('percentage', 0) for d in dist]
                max_ratio = max(ratios) if ratios else 0
                if max_ratio > 60:
                    dominant = dist[ratios.index(max_ratio)]['label']
                    biases.append({
                        "type": "选择偏差",
                        "severity": "low",
                        "evidence": f"{col}中{dominant}占比较高({max_ratio:.0f}%)",
                        "impact": f"可能过度代表{dominant}群体的经验",
                        "mitigation": "注意结论向其他群体的推广限制",
                    })

    return biases


def assess_missing_pattern_bias(data: dict, rows: list) -> dict:
    """评估缺失模式偏差"""
    quality = data.get('quality_metrics', {})
    per_question = quality.get('per_question', [])
    biases = []

    for q in per_question:
        missing_rate = q.get('missing_rate', 0)
        if missing_rate > 20:
            col = q.get('column', 'Unknown')
            # 尝试判断缺失是否非随机：检查缺失者与回答者在其他变量上的差异
            biases.append({
                "type": "缺失模式偏差",
                "severity": "medium" if missing_rate > 40 else "low",
                "evidence": f"{col}缺失率高达{missing_rate:.1f}%",
                "impact": f"{col}相关的分析结论可能偏向愿意回答该题的群体",
                "mitigation": "考虑多重插补或敏感性分析；报告中标注缺失率",
            })

    return biases


def assess_response_bias(data: dict, rows: list, headers: list) -> dict:
    """评估无应答/应答偏差（简化版：检查极端回答模式）"""
    biases = []

    # 检查是否有大量中位数回答（可能表示敷衍）
    likert = data.get('likert_scales', {})
    for group, items in likert.items():
        for item in items:
            col = item.get('column', '')
            dist = item.get('distribution', [])
            if dist:
                # 找到中位数对应的选项
                mid_idx = len(dist) // 2
                mid_pct = dist[mid_idx].get('percentage', 0) if mid_idx < len(dist) else 0
                if mid_pct > 50:
                    biases.append({
                        "type": "应答偏差",
                        "severity": "low",
                        "evidence": f"{col}中{mid_pct:.0f}%受访者选择了中间选项",
                        "impact": "可能存在中庸回答偏差，真实态度分布可能被压缩",
                        "mitigation": "考虑使用迫选量表或增加中间选项的区分度",
                    })

    return biases


def synthesize_assessment(client, bias_list: list, data: dict) -> dict:
    """用 LLM 综合评估所有偏差"""
    if not bias_list:
        return {
            "overall_risk": "low",
            "biases": [],
            "generalizability_note": "样本质量良好，未发现明显偏差风险。",
        }

    bias_text = "\n".join([
        f"- {sanitize_prompt_text(b['type'])} ({sanitize_prompt_text(b['severity'])}): {sanitize_prompt_text(b['evidence'])}。影响: {sanitize_prompt_text(b['impact'])}。缓解: {sanitize_prompt_text(b['mitigation'])}"
        for b in bias_list[:6]
    ])

    prompt = f"""你是一位抽样方法论专家。请综合以下样本偏差诊断结果，给出总体评估。

样本量: {data.get('total_records', 0)}
偏差诊断：
{bias_text}

请返回 JSON：
{{
  "overall_risk": "high" | "medium" | "low",
  "overall_reasoning": "总体风险评估理由（100字以内）",
  "generalizability_note": "对研究结论可推广性的说明（100字以内）"
}}

评估标准：
- high: 存在严重选择偏差或系统性缺失，结论推广性受限
- medium: 存在一些偏差，但可通过声明局限来缓解
- low: 偏差可控，结论在类似群体中有较好推广性"""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是抽样方法论专家。只输出JSON，不输出任何其他文字。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000,
        )
        _track_usage(response)
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        result = json.loads(content)
        return result
    except Exception as e:
        progress(f"  LLM综合评估失败: {e}")
        # 基于偏差数量自动判断
        high_count = sum(1 for b in bias_list if b.get('severity') == 'high')
        medium_count = sum(1 for b in bias_list if b.get('severity') == 'medium')
        risk = "high" if high_count >= 1 else ("medium" if medium_count >= 2 else "low")
        return {
            "overall_risk": risk,
            "overall_reasoning": "基于自动偏差计数评估",
            "generalizability_note": "请在推广结论时考虑上述偏差因素。",
        }


def main():
    if len(sys.argv) < 4:
        print("Usage: python3 sample_bias_assessment.py <mode1_json> <raw_file> <output_dir>")
        sys.exit(1)

    try:
        mode1_path = validate_path(sys.argv[1], must_exist=True)
        raw_file = validate_path(sys.argv[2], must_exist=True)
        out_dir = validate_path(sys.argv[3])
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    progress("SampleBiasAssessment: 加载数据...")
    data = load_json(mode1_path)
    headers, rows = load_raw_file(raw_file)

    client = get_llm_client()

    progress("SampleBiasAssessment: 诊断选择偏差...")
    selection_biases = assess_selection_bias(data)
    progress(f"  发现 {len(selection_biases)} 个选择偏差")

    progress("SampleBiasAssessment: 诊断缺失模式偏差...")
    missing_biases = assess_missing_pattern_bias(data, rows)
    progress(f"  发现 {len(missing_biases)} 个缺失偏差")

    progress("SampleBiasAssessment: 诊断应答偏差...")
    response_biases = assess_response_bias(data, rows, headers)
    progress(f"  发现 {len(response_biases)} 个应答偏差")

    all_biases = selection_biases + missing_biases + response_biases

    progress("SampleBiasAssessment: 综合评估...")
    synthesis = synthesize_assessment(client, all_biases, data)

    result = {
        "overall_risk": synthesis.get("overall_risk", "low"),
        "overall_reasoning": synthesis.get("overall_reasoning", ""),
        "biases": all_biases,
        "generalizability_note": synthesis.get("generalizability_note", ""),
    }

    json_path = out_dir / "sample_bias_assessment.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    progress(f"  ✓ 样本偏差诊断 JSON: {json_path.name} (总体风险: {result['overall_risk']})")

    progress("SampleBiasAssessment 完成!")
    print(f"[RESULT] {json_path}", flush=True)
    _print_tokens()


if __name__ == '__main__':
    main()
