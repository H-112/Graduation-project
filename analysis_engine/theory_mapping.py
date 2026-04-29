#!/usr/bin/env python3
"""
TheoryMapping — 领域自适应理论框架映射
基于问卷主题自动识别领域，加载对应理论库，用 LLM 评估数据对理论的支持/反驳/扩展关系
用法: python3 theory_mapping.py <mode1_json> <deep_research_dir> <output_dir>
输出: theory_mapping.json + theory_mapping_report.md
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


from env_loader import load_env

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


def load_theory_base() -> dict:
    base_path = Path(__file__).parent / "theory_knowledge_base.json"
    with open(base_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def extract_domain_hints(data: dict) -> str:
    """从 Mode 1 结果中提取领域判断线索"""
    parts = []
    dataset = sanitize_prompt_text(data.get('dataset', ''))
    if dataset:
        parts.append(f"数据集名称: {dataset}")

    # 提取列名关键词
    headers = []
    for col_type in ['demographics', 'genai_usage', 'likert_scales', 'text_analysis']:
        section = data.get(col_type, {})
        if isinstance(section, dict):
            headers.extend([sanitize_prompt_text(h) for h in list(section.keys())[:10]])
    if headers:
        parts.append(f"题目关键词: {', '.join(headers[:15])}")

    # 提取文本题关键词
    text_analysis = data.get('text_analysis', {})
    if text_analysis:
        keywords = []
        for ta in text_analysis.values():
            for kw in ta.get('top_keywords', [])[:5]:
                keywords.append(sanitize_prompt_text(kw['word']))
        if keywords:
            parts.append(f"文本高频词: {', '.join(keywords[:15])}")

    return "\n".join(parts)


def identify_domains(client, hints: str, theory_base: dict) -> list:
    """用 LLM 判断问卷属于哪些领域"""
    if not client:
        return [{"domain": "education_technology", "confidence": 0.8}]

    domain_list = []
    for key, info in theory_base['domains'].items():
        theories = ', '.join([t['name'] for t in info['theories'][:3]])
        domain_list.append(f"- {key}: {info['name']} (代表理论: {theories})")

    prompt = f"""你是一位跨学科研究方法论专家。请基于以下问卷信息，判断该问卷最可能属于哪些研究领域。

可选领域：
{chr(10).join(domain_list)}

问卷信息：
{hints}

请返回 JSON 格式（不要有任何其他内容）：
{{
  "domains": [
    {{"domain": "领域key", "confidence": 0.0-1.0, "reason": "判断理由"}}
  ],
  "primary_domain": "最主要的领域key"
}}"""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是一位跨学科研究方法论专家，擅长判断研究主题所属领域。只输出JSON，不输出任何其他文字。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000,
        )
        _track_usage(response)
        content = response.choices[0].message.content.strip()
        # 去除可能的 markdown 代码块
        content = content.replace("```json", "").replace("```", "").strip()
        result = json.loads(content)
        return result.get("domains", [])
    except Exception as e:
        progress(f"  领域识别失败: {e}，回退到教育技术")
        return [{"domain": "education_technology", "confidence": 0.8}]


def build_mapping_context(data: dict, dr_dir: Path) -> str:
    """构建用于理论映射的上下文摘要"""
    parts = []
    parts.append(f"# 研究概述")
    parts.append(f"样本量: {data.get('total_records', 0)}")
    parts.append(f"字段数: {data.get('total_fields', 0)}")

    # 人口学分布摘要
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

    # DeepResearch 发现摘要
    for round_file in sorted(dr_dir.glob("round_*.json")):
        try:
            with open(round_file, 'r', encoding='utf-8') as f:
                rdata = json.load(f)
            findings = rdata.get('findings', rdata.get('rules', []))
            if findings:
                parts.append(f"\n# {round_file.stem} 关键发现")
                for f_item in findings[:3]:
                    if 'dimension_a' in f_item:
                        parts.append(f"- {sanitize_prompt_text(f_item['dimension_a'])} × {sanitize_prompt_text(f_item['dimension_b'])}: p={f_item.get('p_value', 'N/A')}")
                    elif 'likert_column' in f_item:
                        parts.append(f"- {sanitize_prompt_text(f_item['likert_column'])} × {sanitize_prompt_text(f_item['grouping_column'])}: p={f_item.get('p_value', 'N/A')}")
                    elif 'antecedent' in f_item:
                        parts.append(f"- {sanitize_prompt_text(f_item['antecedent'])} → {sanitize_prompt_text(f_item['consequent'])}: 置信度={f_item.get('confidence', 'N/A')}")
        except Exception:
            pass

    return "\n".join(parts)


def map_theory(client, theory: dict, context: str) -> dict:
    """用 LLM 评估单个理论与数据的匹配关系"""
    if not client:
        return {
            "theory": theory["name"],
            "relevance_score": 0.5,
            "alignment": "neutral",
            "evidence": [],
            "gap_note": "LLM 不可用",
            "contribution": "",
        }

    prompt = f"""你是理论映射分析专家。请评估以下理论与研究数据的匹配关系。

理论: {theory['name']}
核心构念: {', '.join(theory['constructs'])}
关键文献: {', '.join(theory['key_papers'])}

研究数据摘要：
{context[:3000]}

请判断该理论与上述数据的关系，并返回 JSON：
{{
  "relevance_score": 0.0-1.0,
  "alignment": "supported" | "contradicted" | "extended" | "neutral",
  "evidence": [
    {{"finding": "数据发现描述（50字以内）", "source": "数据来源"}}
  ],
  "gap_note": "数据在哪些方面未覆盖该理论（100字以内）",
  "contribution": "本研究对该理论的贡献（100字以内）"
}}

注意：
- supported: 数据支持该理论的预期
- contradicted: 数据与该理论预期相反
- extended: 数据支持理论但需要扩展或修正
- neutral: 数据与该理论无关或不足以判断"""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是理论映射分析专家。只输出JSON，不输出任何其他文字。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.4,
            max_tokens=1500,
        )
        _track_usage(response)
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        result = json.loads(content)
        result["theory"] = theory["name"]
        return result
    except Exception as e:
        return {
            "theory": theory["name"],
            "relevance_score": 0.0,
            "alignment": "neutral",
            "evidence": [],
            "gap_note": f"映射失败: {e}",
            "contribution": "",
        }


def generate_report(mappings: list, domains: list) -> str:
    """生成 Markdown 报告"""
    lines = ["# 理论框架映射报告", ""]
    lines.append(f"> 本报告由智能体辅助问卷分析系统自动生成（Mode 3 扩展：TheoryMapping）")
    lines.append("")

    # 识别领域
    lines.append("## 一、识别领域")
    for d in domains[:3]:
        lines.append(f"- **{d.get('domain', '未知')}** (置信度: {d.get('confidence', 0):.0%}) — {d.get('reason', '')}")
    lines.append("")

    # 理论映射
    lines.append("## 二、理论映射详情")
    alignment_labels = {
        "supported": "✓ 支持",
        "contradicted": "✗ 反驳",
        "extended": "↗ 扩展",
        "neutral": "○ 中性",
    }

    for m in sorted(mappings, key=lambda x: x.get("relevance_score", 0), reverse=True):
        label = alignment_labels.get(m.get("alignment", "neutral"), "○ 中性")
        lines.append(f"\n### {m['theory']} {label} (相关度: {m.get('relevance_score', 0):.0%})")

        evidence = m.get("evidence", [])
        if evidence:
            lines.append("**证据:**")
            for e in evidence[:3]:
                lines.append(f"- {e.get('finding', '')} (来源: {e.get('source', 'N/A')})")

        gap = m.get("gap_note", "")
        if gap:
            lines.append(f"\n**缺口:** {gap}")

        contrib = m.get("contribution", "")
        if contrib:
            lines.append(f"\n**贡献:** {contrib}")

    # 理论创新
    novel = [m for m in mappings if m.get("alignment") == "extended" or m.get("relevance_score", 0) > 0.7]
    if novel:
        lines.append("\n## 三、理论创新点")
        lines.append("以下发现可能对现有理论构成扩展或补充：")
        for m in novel[:3]:
            lines.append(f"\n- **{m['theory']}**: {m.get('contribution', '')}")

    lines.append("")
    return "\n".join(lines)


def main():
    if len(sys.argv) < 4:
        print("Usage: python3 theory_mapping.py <mode1_json> <deep_research_dir> <output_dir>")
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

    progress("TheoryMapping: 加载 Mode 1 分析结果...")
    data = load_json(mode1_path)

    progress("TheoryMapping: 加载理论库...")
    theory_base = load_theory_base()

    client = get_llm_client()

    # Step 1: 识别领域
    progress("TheoryMapping: 识别研究领域...")
    hints = extract_domain_hints(data)
    domains = identify_domains(client, hints, theory_base)
    progress(f"  识别领域: {', '.join([d['domain'] for d in domains[:3]])}")

    # Step 2: 加载相关理论
    primary_domain = domains[0]["domain"] if domains else "education_technology"
    selected_theories = []
    for d in domains[:2]:  # 取前2个领域
        domain_key = d["domain"]
        if domain_key in theory_base["domains"]:
            selected_theories.extend(theory_base["domains"][domain_key]["theories"])

    progress(f"TheoryMapping: 加载 {len(selected_theories)} 个理论进行映射...")

    # Step 3: 构建上下文
    context = build_mapping_context(data, dr_dir)

    # Step 4: 逐个映射
    mappings = []
    for i, theory in enumerate(selected_theories):
        progress(f"  映射 {i+1}/{len(selected_theories)}: {theory['name']}...")
        mapping = map_theory(client, theory, context)
        mapping["domain"] = primary_domain
        mappings.append(mapping)

    # Step 5: 组装输出
    result = {
        "detected_domains": domains,
        "primary_domain": primary_domain,
        "mappings": mappings,
        "top_theories": [m["theory"] for m in sorted(mappings, key=lambda x: x.get("relevance_score", 0), reverse=True)[:5]],
    }

    # 检查是否有扩展/创新发现
    extended = [m for m in mappings if m.get("alignment") == "extended"]
    if extended:
        result["novel_finding"] = f"数据对 {extended[0]['theory']} 构成潜在扩展，建议进一步验证"

    # 写入 JSON
    json_path = out_dir / "theory_mapping.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    progress(f"  ✓ 理论映射 JSON: {json_path.name}")

    # 写入报告
    report = generate_report(mappings, domains)
    md_path = out_dir / "theory_mapping_report.md"
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(report)
    progress(f"  ✓ 理论映射报告: {md_path.name}")

    progress("TheoryMapping 完成!")
    print(f"[RESULT] {json_path}", flush=True)
    _print_tokens()


if __name__ == '__main__':
    main()
