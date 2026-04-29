"""
量表 LLM 深度分析引擎 — JSON Schema 约束输出
用法: python3 likert_llm_analysis.py <mode1_result_json> <output_dir>
输出: <base>_likert_analysis.json  +  <base>_likert_analysis.md
"""
import json
import os
import sys
from pathlib import Path
from openai import OpenAI
from utils import progress, validate_path, sanitize_prompt_text
from env_loader import load_env

load_env()

DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"

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

def _try_parse_json(text):
    """尝试解析 JSON，成功返回对象，失败返回 None"""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def _repair_truncated_json(text):
    """
    尝试修复被截断的 JSON。
    策略：从末尾向前搜索，找到能闭合所有未闭合结构的最近位置。
    """
    # 先尝试最简单的修复：如果末尾缺少 }，补充它
    stripped = text.rstrip()
    # 找到最后一个 '}' 的位置
    last_brace = stripped.rfind('}')
    if last_brace > 0:
        candidate = stripped[:last_brace + 1]
        # 简单平衡性检查：数 { 和 }
        open_count = candidate.count('{')
        close_count = candidate.count('}')
        if open_count == close_count:
            return candidate
        # 如果不平衡，尝试去掉最后一个不完整的键值对
        # 找到倒数第二个 } 的位置
        second_last = candidate.rfind('}', 0, last_brace)
        if second_last > 0:
            candidate2 = candidate[:second_last + 1]
            if candidate2.count('{') == candidate2.count('}'):
                return candidate2
    return text


def get_client():
    if not DEEPSEEK_API_KEY:
        progress("错误: 未设置 DEEPSEEK_API_KEY")
        sys.exit(1)
    return OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)


# ── JSON Schema 定义 ──────────────────────────────
LIKERT_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "scale_groups": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "group_name": {"type": "string"},
                    "overall_assessment": {"type": "string"},
                    "overall_mean": {"type": "number"},
                    "reliability_indicator": {"type": "string"},
                    "strengths": {"type": "array", "items": {"type": "string"}},
                    "concerns": {"type": "array", "items": {"type": "string"}},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "column": {"type": "string"},
                                "mean": {"type": "number"},
                                "std": {"type": "number"},
                                "median": {"type": "number"},
                                "interpretation": {"type": "string"},
                                "concern_level": {"type": "string", "enum": ["low", "medium", "high"]},
                                "suggestion": {"type": "string"}
                            },
                            "required": ["column", "mean", "std", "interpretation", "concern_level", "suggestion"]
                        }
                    },
                    "key_insight": {"type": "string"}
                },
                "required": ["group_name", "overall_assessment", "items", "key_insight"]
            }
        },
        "cross_scale_findings": {"type": "array", "items": {"type": "string"}},
        "overall_recommendation": {"type": "string"}
    },
    "required": ["scale_groups", "cross_scale_findings", "overall_recommendation"]
}


# ── 数据摘要构建 ──────────────────────────────────

def build_likert_summary(data):
    """将量表数据转为 LLM 可读的摘要文本"""
    likert = data.get('likert_scales', {})
    if not likert:
        return None

    parts = []
    parts.append(f"# 量表分析数据\n\n**样本量**: {data.get('total_records', 0)}\n")

    for group_name, items in likert.items():
        if not items:
            continue
        parts.append(f"\n## 量表组: {sanitize_prompt_text(group_name)}\n")

        # 计算组整体均值
        valid_means = [it['mean'] for it in items if 'mean' in it]
        group_mean = sum(valid_means) / len(valid_means) if valid_means else 0
        parts.append(f"**组整体均值**: {group_mean:.2f} (满分5分)\n")

        for item in items:
            label = sanitize_prompt_text(item['column'][:80])
            mean = item.get('mean', 0)
            std = item.get('std', 0)
            median = item.get('median', 0)
            min_v = item.get('min', 0)
            max_v = item.get('max', 0)
            n = item.get('n', 0)

            parts.append(f"\n- **{label}**\n")
            parts.append(f"  - 均值={mean:.2f}, 中位数={median}, 标准差={std:.2f}\n")
            parts.append(f"  - 范围=[{min_v}, {max_v}], 样本数={n}\n")

            # 分布
            dist = item.get('distribution', [])
            if dist:
                dist_str = ', '.join(f"{d['score']}分:{d['percentage']}%" for d in dist[:5])
                parts.append(f"  - 分布: {dist_str}\n")

    return ''.join(parts)


# ── LLM 量表分析 ──────────────────────────────────

def analyze_likert_scales(client, data):
    """调用 LLM 对量表进行深度分析，返回结构化 JSON"""
    likert = data.get('likert_scales', {})
    if not likert:
        progress("没有量表数据，跳过量表 LLM 分析")
        return None

    progress(f"发现 {len(likert)} 个量表组，开始 LLM 深度分析...")

    summary = build_likert_summary(data)
    if not summary:
        return None

    prompt = f"""你是社会科学量表研究专家。请基于以下问卷量表数据进行深度分析。

{summary}

请严格按照以下 JSON Schema 返回分析结果（只返回 JSON，不要任何 Markdown 代码块标记）：

{json.dumps(LIKERT_JSON_SCHEMA, ensure_ascii=False, indent=2)}

分析要求：
1. **overall_assessment**: 对该量表组的整体评价（50字以内）
2. **overall_mean**: 组内所有题项均值的平均值
3. **reliability_indicator**: 基于均值分布判断的内部一致性描述（如"各题项得分较为一致"或"题项间存在较大离散"）
4. **concern_level 判定规则**: mean >= 4.0 为 "low", 3.0 <= mean < 4.0 为 "medium", mean < 3.0 为 "high"
5. **interpretation**: 结合均值、标准差、分布解读该题项的含义（80字以内）
6. **suggestion**: 基于得分给出的具体建议（50字以内）
7. **cross_scale_findings**: 跨量表比较发现（如"A量表均值显著高于B量表，说明..."）
8. **overall_recommendation**: 总体建议（100字以内）

注意：
- 所有数值必须直接来自输入数据，禁止编造
- concern_level 必须严格按规则判定，不要用 LLM 自由判断
- 如果量表组只有1个题项，reliability_indicator 写"单题项量表，无法评估内部一致性"""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": "你是专业的社会科学量表研究分析师。你只返回合法的 JSON，不返回任何其他文字。所有数值必须基于提供的数据，禁止编造。"
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=8000,
        )
        _track_usage(response)

        raw = response.choices[0].message.content.strip()

        # 去除可能的 Markdown 代码块
        if raw.startswith("```json"):
            raw = raw[7:]
        if raw.startswith("```"):
            raw = raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

        result = _try_parse_json(raw)
        if result is None:
            progress(f"  ✗ LLM 返回的不是合法 JSON，尝试修复截断内容...")
            result = _try_parse_json(_repair_truncated_json(raw))
        if result is None:
            raise json.JSONDecodeError("无法解析 LLM 返回的 JSON", raw, 0)

        # 验证 concern_level 是否符合规则（后校验，防止 LLM 不遵守）
        for group in result.get("scale_groups", []):
            for item in group.get("items", []):
                mean = item.get("mean", 0)
                if mean >= 4.0:
                    item["concern_level"] = "low"
                elif mean >= 3.0:
                    item["concern_level"] = "medium"
                else:
                    item["concern_level"] = "high"

        progress("  ✓ LLM 量表分析 JSON 解析成功")
        return result

    except json.JSONDecodeError as e:
        progress(f"  ✗ LLM 返回的不是合法 JSON: {e}")
        return None
    except Exception as e:
        progress(f"  ✗ LLM 调用失败: {e}")
        return None


# ── Markdown 报告生成 ─────────────────────────────

def generate_markdown_report(data, json_result):
    """基于 JSON 结果生成 Markdown 报告"""
    lines = []
    ds_label = data.get("dataset", "问卷分析")
    n = data.get("total_records", 0)

    lines.append(f"*基于 DeepSeek LLM 分析 | 样本量: {n}*\n")

    for group in json_result.get("scale_groups", []):
        lines.append(f"\n## {group['group_name']}\n")
        lines.append(f"**整体评价**: {group['overall_assessment']}\n")
        lines.append(f"**组均值**: {group.get('overall_mean', 'N/A')} | **一致性**: {group.get('reliability_indicator', 'N/A')}\n")

        if group.get("strengths"):
            lines.append("\n**优势**: ")
            lines.append("、".join(group["strengths"]))
            lines.append("\n")

        if group.get("concerns"):
            lines.append("**关注点**: ")
            lines.append("、".join(group["concerns"]))
            lines.append("\n")

        lines.append("\n### 题项分析\n")
        lines.append("| 题项 | 均值 | 标准差 | 关注等级 | 解读 |\n")
        lines.append("|------|------|--------|----------|------|\n")

        for item in group.get("items", []):
            concern_emoji = {"low": "🟢", "medium": "🟡", "high": "🔴"}.get(item["concern_level"], "⚪")
            col = item["column"][:40]
            lines.append(f"| {col} | {item['mean']:.2f} | {item['std']:.2f} | {concern_emoji} {item['concern_level']} | {item['interpretation'][:60]}... |\n")

        lines.append(f"\n**核心洞察**: {group['key_insight']}\n")

    findings = json_result.get("cross_scale_findings", [])
    if findings:
        lines.append("\n## 跨量表发现\n")
        for f in findings:
            lines.append(f"- {f}\n")

    rec = json_result.get("overall_recommendation", "")
    if rec:
        lines.append("\n## 总体建议\n")
        lines.append(f"{rec}\n")

    return ''.join(lines)


# ── 主流程 ────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 likert_llm_analysis.py <mode1_result_json> [output_dir]")
        sys.exit(1)

    try:
        result_path = validate_path(sys.argv[1], must_exist=True)
        out_dir = validate_path(sys.argv[2]) if len(sys.argv) > 2 else result_path.parent
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    result_path = Path(result_path)
    out_dir = Path(out_dir) if not isinstance(out_dir, Path) else out_dir

    progress(f"加载分析数据: {result_path.name}...")
    data = json.loads(result_path.read_text('utf-8'))

    likert = data.get('likert_scales', {})
    if not likert:
        progress("没有量表数据，跳过量表分析")
        print(f"[DONE] {json.dumps([], ensure_ascii=False)}")
        return

    progress(f"样本量: {data.get('total_records', 0)}, 量表组: {len(likert)}")

    base_name = result_path.stem
    if base_name.endswith('_analysis'):
        base_name = base_name[:-len('_analysis')]

    progress("初始化 DeepSeek 客户端...")
    client = get_client()

    # LLM 分析
    json_result = analyze_likert_scales(client, data)
    if not json_result:
        progress("量表分析失败")
        sys.exit(1)

    # 保存 JSON
    json_path = out_dir / f"{base_name}_likert_analysis.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_result, f, ensure_ascii=False, indent=2)
    progress(f"  ✓ JSON 报告: {json_path.name}")
    print(f"[RESULT] {json_path}", flush=True)

    # 保存 Markdown
    md_content = generate_markdown_report(data, json_result)
    md_path = out_dir / f"{base_name}_likert_analysis.md"
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(md_content)
    progress(f"  ✓ Markdown 报告: {md_path.name}")
    print(f"[RESULT] {md_path}", flush=True)

    reports = [
        {"label": "量表深度分析 (JSON)", "file": json_path.name, "path": str(json_path)},
        {"label": "量表深度分析 (Markdown)", "file": md_path.name, "path": str(md_path)},
    ]

    progress(f"量表分析完成! 共生成 {len(reports)} 份报告")
    print(f"[DONE] {json.dumps(reports, ensure_ascii=False)}", flush=True)

    # 复制到 public/
    public_dir = Path(__file__).parent.parent / "public" / "llm-reports"
    public_dir.mkdir(parents=True, exist_ok=True)
    for r in reports:
        src = Path(r["path"])
        dst = public_dir / src.name
        dst.write_text(src.read_text('utf-8'))
    progress("报告已同步到 public/llm-reports/")
    _print_tokens()

if __name__ == '__main__':
    main()
