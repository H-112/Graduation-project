"""
通用 LLM 深度分析引擎 — 支持任意问卷的模式1分析结果
用法: python3 generic_llm_analysis.py <mode1_result_json> <output_dir>
将输出多个 .md 报告到 output_dir，同时复制到 public/llm-reports/ 以提供 Web 访问
"""
import json
import os
import sys
from pathlib import Path
from openai import OpenAI

def progress(msg):
    """输出进度标记，前端通过 SSE 实时接收"""
    print(f"[PROGRESS] {msg}", flush=True)

# ── 环境变量加载 ──────────────────────────────────
def _load_env():
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

def get_client():
    if not DEEPSEEK_API_KEY:
        progress("错误: 未设置 DEEPSEEK_API_KEY")
        sys.exit(1)
    return OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)

# ── 提示词构建 ────────────────────────────────────

def build_data_summary(data):
    """将模式1分析结果转为 LLM 可读的摘要文本"""

    def _pct(it):
        """兼容不同题型的百分比键名"""
        return it.get('percentage', it.get('percentage_in_respondents', it.get('percentage_in_total', 0)))

    parts = []
    ds_label = data.get("dataset", "未知问卷")
    n = data.get("total_records", 0)
    parts.append(f"# 问卷分析数据\n\n**问卷**: {ds_label}\n**样本量**: {n}\n")

    # 人口学
    dem = data.get('demographics', {})
    if dem:
        parts.append("\n## 样本构成\n")
        for key, d in dem.items():
            if d and d.get('distribution'):
                items = d['distribution'][:5]
                summary = ', '.join(f"{it['label']}({_pct(it)}%)" for it in items)
                parts.append(f"- {d['column']}: {summary}\n")

    # 单选题分布
    usage = data.get('genai_usage', {})
    if usage:
        parts.append("\n## 选择题分布\n")
        for key, d in list(usage.items())[:15]:
            if d and d.get('distribution'):
                items = d['distribution'][:5]
                summary = ', '.join(f"{it['label']}({_pct(it)}%)" for it in items)
                parts.append(f"- {d['column']}: {summary}\n")

    # Likert 量表
    likert = data.get('likert_scales', {})
    if likert:
        parts.append("\n## 量表得分 (1-5分)\n")
        for group_name, items in likert.items():
            if items:
                parts.append(f"\n### {group_name}\n")
                for item in items:
                    label = item['column'][:60]
                    parts.append(f"- {label}: 均值={item['mean']}, 标准差={item['std']}\n")

    # 文本关键词
    text = data.get('text_analysis', {})
    if text:
        parts.append("\n## 开放题高频关键词\n")
        for key, ta in text.items():
            if ta and ta.get('top_keywords'):
                top15 = ta['top_keywords'][:15]
                kw_str = ', '.join(f"{k['word']}({k['count']})" for k in top15)
                parts.append(f"- **{ta.get('column', key)[:60]}**: {kw_str}\n")

    return ''.join(parts)


# ── 单题文本分析 ──────────────────────────────────

def analyze_text_question(client, ta, index, total):
    """用 LLM 分析一个开放题"""
    label = ta.get('column', f'题目{index}')[:80]
    progress(f"文本分析 ({index}/{total}): {label}...")

    top_kw = ta.get('top_keywords', [])[:30]
    kw_str = ', '.join(f"{k['word']}" for k in top_kw)
    n_answers = ta.get('total_answers', 0)

    prompt = f"""你是社会科学数据分析师。请基于以下问卷开放题的高频关键词进行深入分析。

**题目**: {label}
**有效回答数**: {n_answers}
**高频关键词**: {kw_str}

请分析：
1. **核心主题**: 从关键词中提炼出3-5个核心主题
2. **情感倾向**: 整体回答的情感基调（积极/中性/消极），估计比例
3. **深层洞察**: 受访者表达背后的深层次需求或问题
4. **代表性观点**: 推测受访者最可能的几种典型观点

用中文回答，控制在500字以内。"""

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
        return response.choices[0].message.content
    except Exception as e:
        progress(f"  ✗ LLM 调用失败: {e}")
        return f"分析失败: {e}"


# ── 综合洞察报告 ──────────────────────────────────

def generate_comprehensive_report(client, data):
    """生成综合洞察报告"""
    progress("正在生成综合洞察报告...")

    ds_label = data.get("dataset", "未知问卷")
    summary = build_data_summary(data)

    prompt = f"""你是资深数据科学和社会研究顾问。请基于以下问卷分析数据，撰写一份专业的综合洞察报告。

{summary}

请按以下结构撰写报告（1000字以内）：

## 一、核心发现
列出3-5个最重要的数据发现，每个发现用数据支撑。

## 二、样本特征画像
描述受访者群体的特征和行为模式。

## 三、关键维度分析
基于量表数据和选择题分布，分析核心维度的得分情况和意义。

## 四、开放题洞察
综合开放题的高频关键词，提炼受访者的核心诉求和关注点。

## 五、建议与启示
基于分析结果，提出3-5条具体建议。

请用专业、客观的语言。"""

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
        return response.choices[0].message.content
    except Exception as e:
        progress(f"  ✗ 综合报告生成失败: {e}")
        return f"报告生成失败: {e}"


# ── 主流程 ────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 generic_llm_analysis.py <mode1_result_json> [output_dir]")
        sys.exit(1)

    result_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else result_path.parent

    progress(f"加载分析数据: {result_path.name}...")
    data = json.loads(result_path.read_text('utf-8'))
    progress(f"样本量: {data.get('total_records', 0)}, 题型: {data.get('summary', {}).get('questionCount', 0)}")

    # 使用简短的基名（文件 stem 去掉 _analysis 后缀）
    base_name = result_path.stem
    if base_name.endswith('_analysis'):
        base_name = base_name[:-len('_analysis')]

    progress("初始化 DeepSeek 客户端...")
    client = get_client()

    text_data = data.get('text_analysis', {})
    text_items = [(k, v) for k, v in text_data.items() if v and v.get('top_keywords')]
    total = len(text_items)

    reports = []

    if total > 0:
        progress(f"发现 {total} 道文本题，开始逐题分析...")

        for i, (key, ta) in enumerate(text_items, 1):
            analysis = analyze_text_question(client, ta, i, total)
            if not analysis:
                continue

            # 使用简短文件名：{base}_llm_{序号}.md
            safe_name = f"{base_name}_llm_{i:02d}"
            report_path = out_dir / f"{safe_name}.md"

            with open(report_path, 'w', encoding='utf-8') as f:
                f.write(f"# LLM 深度分析\n\n**题目**: {ta.get('column', key)}\n\n{analysis}")

            progress(f"  ✓ 已保存: {report_path.name}")
            reports.append({
                "label": ta.get('column', key)[:60],
                "file": report_path.name,
                "path": str(report_path),
            })
            print(f"[RESULT] {report_path}", flush=True)
    else:
        progress("没有文本题，跳过逐题分析")

    # 综合洞察报告
    comprehensive = generate_comprehensive_report(client, data)
    if comprehensive:
        comp_path = out_dir / f"{base_name}_comprehensive.md"
        with open(comp_path, 'w', encoding='utf-8') as f:
            f.write(f"# {data.get('dataset', '问卷分析')} — 综合洞察报告\n\n")
            f.write(f"*基于 DeepSeek LLM 分析 | 样本量: {data.get('total_records', 0)}*\n\n")
            f.write(comprehensive)

        progress(f"  ✓ 综合报告: {comp_path.name}")
        reports.append({
            "label": "综合洞察报告",
            "file": comp_path.name,
            "path": str(comp_path),
        })
        print(f"[RESULT] {comp_path}", flush=True)

    # 输出报告清单供 Node.js 读取
    progress(f"LLM 分析完成! 共生成 {len(reports)} 份报告")
    print(f"[DONE] {json.dumps(reports, ensure_ascii=False)}", flush=True)

    # 复制到 public/llm-reports/
    public_dir = Path(__file__).parent.parent / "public" / "llm-reports"
    public_dir.mkdir(parents=True, exist_ok=True)
    for r in reports:
        src = Path(r["path"])
        dst = public_dir / src.name
        dst.write_text(src.read_text('utf-8'))
    progress(f"报告已同步到 public/llm-reports/")

if __name__ == '__main__':
    main()
