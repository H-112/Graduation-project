"""
模式2 LLM深度分析引擎
使用 DeepSeek API 对问卷数据进行:
  - 情感分析（开放题）
  - 主题提取与聚类
  - AI 洞察生成
  - 趋势发现与建议
"""
import json
import os
import sys
from pathlib import Path
from openai import OpenAI
from utils import validate_path, sanitize_prompt_text

OUTPUT_DIR = Path(__file__).parent / "output"

# DeepSeek API 配置 — 优先环境变量，fallback 读 .env 文件
def _load_env():
    """从 .env 文件加载环境变量"""
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

_load_env()

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

def get_client():
    """初始化 DeepSeek 客户端"""
    if not DEEPSEEK_API_KEY:
        print("错误: 请设置 DEEPSEEK_API_KEY 环境变量")
        print("  export DEEPSEEK_API_KEY='sk-...'")
        sys.exit(1)
    return OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)

def load_mode1_result(dataset_id):
    """加载模式1分析结果"""
    path = OUTPUT_DIR / f"dataset{dataset_id}_analysis.json"
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def build_summary_prompt(data, dataset_id):
    """构建分析摘要Prompt"""
    ds_label = sanitize_prompt_text(data["dataset"])
    n = data["total_records"]

    prompt_parts = [f"# 问卷分析数据摘要\n\n**问卷名称**: {ds_label}\n**样本量**: {n}\n"]

    # 人口学
    dem = data.get('demographics', {})
    if dem:
        prompt_parts.append("\n## 样本构成\n")
        for key, d in dem.items():
            if d and 'distribution' in d and d['distribution']:
                items = d['distribution'][:5]
                summary = ', '.join(f"{sanitize_prompt_text(it['label'])}({it['percentage']}%)" for it in items)
                prompt_parts.append(f"- {sanitize_prompt_text(d['column'])}: {summary}\n")

    # GenAI使用行为
    gai = data.get('genai_usage', {})
    if gai:
        prompt_parts.append("\n## GenAI使用行为\n")
        for key in ['13、您开始使用GenAI的时间:', '14、您使用GenAI的频率:',
                     '1.您是从什么时候开始使用GenAI?', '5.您使用GenAI的频率:',
                     '3.您对GenAI的熟悉程度是:']:
            if key in gai and gai[key] and 'distribution' in gai[key]:
                d = gai[key]
                items = d['distribution'][:5]
                summary = ', '.join(f"{sanitize_prompt_text(it['label'])}({it['percentage']}%)" for it in items)
                prompt_parts.append(f"- {sanitize_prompt_text(d['column'])}: {summary}\n")

    # Likert量表
    likert = data.get('likert_scales', {})
    if likert:
        prompt_parts.append("\n## 核心量表得分 (1-5分)\n")
        for group_name, items in likert.items():
            if items:
                prompt_parts.append(f"\n### {sanitize_prompt_text(items[0]['group'])}\n")
                for item in items:
                    label = item['column'].split('—')[-1] if '—' in item['column'] else item['column'][:40]
                    prompt_parts.append(f"- {sanitize_prompt_text(label.strip())}: 均值={item['mean']}, 标准差={item['std']}\n")

    # 开放题关键词
    text = data.get('text_analysis', {})
    if text:
        prompt_parts.append("\n## 开放题高频关键词\n")
        for key, ta in text.items():
            if ta and 'top_keywords' in ta:
                top15 = ta['top_keywords'][:15]
                kw_str = ', '.join(f"{sanitize_prompt_text(k['word'])}({k['count']})" for k in top15)
                prompt_parts.append(f"- **{sanitize_prompt_text(ta.get('column', key)[:60])}**: {kw_str}\n")

    return ''.join(prompt_parts)

def analyze_sentiment_and_topics(client, data, dataset_id):
    """情感分析与主题提取"""
    text_data = data.get('text_analysis', {})
    if not text_data:
        return None

    for key, ta in text_data.items():
        if not ta or 'top_keywords' not in ta or not ta['top_keywords']:
            continue

        col_name = sanitize_prompt_text(ta.get('column', key)[:60])
        print(f"\n  分析: {col_name}...")

        top_kw = ta['top_keywords'][:30]
        kw_str = ', '.join(sanitize_prompt_text(k['word']) for k in top_kw)

        prompt = f"""你是一位社会科学研究的数据分析师。请基于以下问卷开放题的高频关键词，进行深入分析。

**题目**: {col_name}
**有效回答数**: {ta.get('total_answers', 0)}
**高频关键词**: {kw_str}

请分析：
1. **核心主题**: 从关键词中提炼出3-5个核心主题/诉求
2. **情感倾向**: 整体回答的情感基调（积极/中性/消极），估计比例
3. **深层洞察**: 受访者表达背后的深层次需求或问题
4. **代表性观点**: 推测受访者最可能的几种典型观点

请用中文回答，控制在500字以内。"""

        try:
            response = client.chat.completions.create(
                model="deepseek-chat",
                messages=[
                    {"role": "system", "content": "你是专业的社会科学研究分析师，擅长从问卷数据中提取深层洞察。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=1500,
            )
            _track_usage(response)
            result = response.choices[0].message.content

            # 保存结果
            safe_name = ta.get('column', key).replace('/', '_')[:50]
            output_path = OUTPUT_DIR / f"d{dataset_id}_llm_{safe_name}.md"
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(f"# LLM 深度分析\n\n**题目**: {ta.get('column', key)}\n\n{result}")

            print(f"    ✓ 保存: {output_path.name}")
            yield {"question": ta.get('column', key), "analysis": result}

        except Exception as e:
            print(f"    ✗ 分析失败: {e}")
            yield {"question": ta.get('column', key), "error": str(e)}

def generate_overall_insights(client, data, dataset_id):
    """生成综合洞察报告"""
    print("\n  生成综合洞察报告...")

    ds_label = sanitize_prompt_text(data["dataset"])
    summary = build_summary_prompt(data, dataset_id)

    prompt = f"""你是一位资深的数据科学和社会研究顾问。请基于以下问卷分析数据，撰写一份专业的综合洞察报告。

{summary}

请按以下结构撰写报告（1000字以内）：

## 一、核心发现
列出3-5个最重要的数据发现，每个发现用数据支撑。

## 二、GenAI使用画像
描述受访大学生群体的GenAI使用特征和行为模式。

## 三、影响评估
基于量表数据，评估GenAI对学生学习、科研、生活各维度的影响程度。

## 四、关键趋势
从数据中发现的值得关注的趋势或警示信号。

## 五、建议
基于分析结果，对高校教育管理和GenAI政策提出3条具体建议。

请用专业、客观的语言，数据引用要准确。"""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是资深数据科学顾问，擅长从数据中提炼洞察并撰写专业分析报告。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            max_tokens=3000,
        )
        _track_usage(response)
        report = response.choices[0].message.content

        output_path = OUTPUT_DIR / f"d{dataset_id}_comprehensive_report.md"
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(f"# {ds_label} — 综合洞察报告\n\n")
            f.write(f"*基于 DeepSeek LLM 分析 | 样本量: {data['total_records']}*\n\n")
            f.write(report)

        print(f"    ✓ 综合报告: {output_path.name}")
        return report

    except Exception as e:
        print(f"    ✗ 报告生成失败: {e}")
        return None

def compare_datasets(client, data5, data4):
    """跨数据集对比分析"""
    print("\n  数据集对比分析...")

    summary5 = build_summary_prompt(data5, 5)
    summary4 = build_summary_prompt(data4, 4)

    prompt = f"""请对比分析两份GenAI相关的大学生问卷调查，找出共性和差异。

## 数据集A（2246份）
{summary5[:3000]}

## 数据集B（915份）
{summary4[:3000]}

请从以下维度进行对比（800字以内）：
1. 样本差异
2. GenAI使用行为差异
3. 两数据集中一致的核心发现
4. 两数据集中矛盾或有趣的差异
5. 综合结论"""

    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "你是专业的数据对比分析师。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2500,
        )
        _track_usage(response)
        comparison = response.choices[0].message.content

        output_path = OUTPUT_DIR / "cross_dataset_comparison.md"
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("# 数据集对比分析\n\n")
            f.write("## 数据集A: 生成式人工智能对大学生影响的调查 (N=2246)\n")
            f.write("## 数据集B: 生成式人工智能对大学生学习方式的影响 (N=915)\n\n")
            f.write(comparison)

        print(f"    ✓ 对比报告: {output_path.name}")
        return comparison

    except Exception as e:
        print(f"    ✗ 对比分析失败: {e}")
        return None

def main():
    import argparse
    ap = argparse.ArgumentParser(description='模式2 LLM深度分析引擎')
    ap.add_argument('--input', help='输入 Mode 1 分析结果 JSON 文件')
    ap.add_argument('--output-dir', help='输出目录')
    args = ap.parse_args()

    try:
        if args.input:
            input_path = validate_path(args.input, must_exist=True)
        if args.output_dir:
            output_dir = validate_path(args.output_dir)
            global OUTPUT_DIR
            OUTPUT_DIR = output_dir
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("模式2: LLM 深度分析引擎 (DeepSeek)")
    print("=" * 60)

    client = get_client()

    # —— 数据集 #5 分析 ——
    print("\n" + "=" * 40)
    print("  数据集 #5: GenAI影响调查 (2246份)")
    print("=" * 40)

    data5 = load_mode1_result(5)

    print("\n  [1] 开放题情感分析与主题提取...")
    sentiment_results_5 = list(analyze_sentiment_and_topics(client, data5, 5))

    print("\n  [2] 综合洞察报告...")
    generate_overall_insights(client, data5, 5)

    # —— 数据集 #4 分析 ——
    print("\n" + "=" * 40)
    print("  数据集 #4: 学习方式调查 (915份)")
    print("=" * 40)

    data4 = load_mode1_result(4)

    print("\n  [1] 开放题情感分析与主题提取...")
    sentiment_results_4 = list(analyze_sentiment_and_topics(client, data4, 4))

    print("\n  [2] 综合洞察报告...")
    generate_overall_insights(client, data4, 4)

    # —— 交叉对比 ——
    print("\n" + "=" * 40)
    print("  跨数据集对比分析")
    print("=" * 40 + "\n")

    compare_datasets(client, data5, data4)

    # 汇总
    print("\n" + "=" * 60)
    print("模式2 LLM分析完成!")
    print(f"结果保存在: {OUTPUT_DIR}")
    print("=" * 60)
    _print_tokens()

if __name__ == '__main__':
    main()
