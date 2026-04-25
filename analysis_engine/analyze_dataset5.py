"""
数据集 #5 分析引擎：生成式人工智能对大学生影响的调查（2246份）
模式1：描述性统计 + 频数分析 + 文本分析
"""
import openpyxl
import json
import os
import re
import math
from collections import Counter
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR = Path(__file__).parent / "output"
FNAME = "295603991_按文本_生成式人工智能对大学生影响的调查_3025_2246.xlsx"

def load_data():
    """加载并清理数据"""
    wb = openpyxl.load_workbook(DATA_DIR / FNAME)
    ws = wb.active
    headers = [ws.cell(1, c).value for c in range(1, ws.max_column + 1)]

    # 读取所有行
    rows = []
    for r in range(2, ws.max_row + 1):
        row = [ws.cell(r, c).value for c in range(1, ws.max_column + 1)]
        rows.append(row)

    # 构建字典列表
    records = []
    for row in rows:
        rec = {}
        for i, h in enumerate(headers):
            rec[h] = row[i] if i < len(row) else None
        records.append(rec)

    return headers, records

def describe_categorical(records, col_name):
    """分类变量的频数统计"""
    counter = Counter()
    for r in records:
        val = r.get(col_name)
        if val is not None and str(val).strip():
            counter[str(val).strip()] += 1

    total = sum(counter.values())
    return {
        "column": col_name,
        "total_valid": total,
        "total_records": len(records),
        "missing": len(records) - total,
        "distribution": [
            {"label": k, "count": v, "percentage": round(v / total * 100, 1)}
            for k, v in counter.most_common()
        ]
    }

def describe_likert(records, col_names, group_label):
    """Likert量表的描述性统计"""
    results = []
    for col_name in col_names:
        values = []
        for r in records:
            val = r.get(col_name)
            if val is not None and str(val).strip():
                try:
                    v = int(float(str(val).strip()))
                    if 1 <= v <= 5:
                        values.append(v)
                except ValueError:
                    pass

        if not values:
            continue

        n = len(values)
        mean_v = sum(values) / n
        variance = sum((x - mean_v) ** 2 for x in values) / (n - 1) if n > 1 else 0
        std_v = math.sqrt(variance)
        sorted_vals = sorted(values)

        # 频数分布
        dist = Counter(values)

        results.append({
            "column": col_name,
            "group": group_label,
            "n": n,
            "mean": round(mean_v, 3),
            "median": sorted_vals[n // 2],
            "std": round(std_v, 3),
            "min": sorted_vals[0],
            "max": sorted_vals[-1],
            "distribution": [
                {"score": i, "count": dist.get(i, 0),
                 "percentage": round(dist.get(i, 0) / n * 100, 1)}
                for i in range(1, 6)
            ]
        })

    return results

def describe_multi_select(records, col_prefix, col_names_map):
    """多选题统计"""
    # col_names_map: {col_header: short_label}
    counts = {short: 0 for short in col_names_map.values()}
    valid_count = 0

    for r in records:
        has_any = False
        for col_h, short_l in col_names_map.items():
            val = r.get(col_h)
            if val is not None and str(val).strip():
                # 多选题，选中即计数
                counts[short_l] += 1
                has_any = True
        if has_any:
            valid_count += 1

    return {
        "type": "multi_select",
        "valid_respondents": valid_count,
        "total_respondents": len(records),
        "distribution": [
            {"label": k, "count": v,
             "percentage_in_respondents": round(v / valid_count * 100, 1) if valid_count else 0,
             "percentage_in_total": round(v / len(records) * 100, 1)}
            for k, v in sorted(counts.items(), key=lambda x: -x[1])
        ]
    }

def tokenize_chinese(text):
    """简单的中文分词（基于jieba，如不可用则用字符级）"""
    try:
        import jieba
        return list(jieba.cut(str(text)))
    except ImportError:
        # Fallback: 2-gram字符级分词
        text = str(text)
        result = []
        i = 0
        while i < len(text):
            if '\u4e00' <= text[i] <= '\u9fff':
                # 中文字符，取双字
                if i + 1 < len(text) and '\u4e00' <= text[i+1] <= '\u9fff':
                    result.append(text[i:i+2])
                    i += 2
                else:
                    result.append(text[i])
                    i += 1
            elif text[i].isalpha():
                j = i
                while j < len(text) and text[j].isalpha():
                    j += 1
                result.append(text[i:j].lower())
                i = j
            else:
                i += 1
        return result

STOPWORDS = set([
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
    '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
    '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些',
    '这个', '那个', '可以', '觉得', '因为', '所以', '但是', '如果', '虽然',
    '而且', '或者', '还是', '应该', '能够', '需要', '已经', '比较', '非常',
    '什么', '怎么', '怎样', '吗', '呢', '吧', '啊', '哦', '嗯', '被',
    '把', '让', '给', '用', '对', '从', '以', '之', '与', '及', '等',
    '其', '所', '而', '且', '或', '但', '于', '为', '则', '更', '还',
    '能', '会', '要', '想', '做', '来', '去', '过', '出', '到', '中',
    '后', '前', '下', '时', '里', '现在', '今天', '今年', '学校',
    '进行', '通过', '使用', '其中', '主要', '一般', '目前', '一些',
    '可能', '情况', '方面', '问题', '方法', '方式', '内容', '过程',
    '不同', '部分', '相关', '其他', '比较', '之后', '之前', '以上',
    '之间', '最后', '第一', '第二', '第三', '利用', '认为', '提出',
    '存在', '发展', '提供', '关注', '帮助', '了解', '研究', '表示',
    '包括', '完成', '实现', '采用', '因此', '此外', '经过', '根据',
    '对于', '关于', '以及', '然后', '首先', '其次', '接着', '比如',
    '通常', '是否', '只是', '之间', '当中', '一点', '感觉', '很多',
])

def text_analysis(records, col_name):
    """开放题文本分析"""
    texts = []
    for r in records:
        val = r.get(col_name)
        if val is not None and str(val).strip():
            texts.append(str(val).strip())

    if not texts:
        return {"column": col_name, "total_answers": 0, "note": "No text responses"}

    # 词频统计
    all_words = []
    answer_lengths = []
    for text in texts:
        words = tokenize_chinese(text)
        words = [w for w in words if len(w) >= 2 and w not in STOPWORDS]
        all_words.extend(words)
        answer_lengths.append(len(text))

    word_counter = Counter(all_words)
    top_keywords = word_counter.most_common(50)

    # 平均长度
    avg_len = sum(answer_lengths) / len(answer_lengths)

    return {
        "column": col_name,
        "total_answers": len(texts),
        "avg_answer_length": round(avg_len, 1),
        "total_words_extracted": len(all_words),
        "unique_words": len(word_counter),
        "top_keywords": [
            {"word": w, "count": c, "rank": i+1}
            for i, (w, c) in enumerate(top_keywords)
        ]
    }

def main():
    print("=" * 60)
    print("数据集 #5 分析引擎")
    print("生成式人工智能对大学生影响的调查")
    print("=" * 60)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. 加载数据
    print("\n[1/6] 加载数据...")
    headers, records = load_data()
    print(f"  总记录数: {len(records)}")
    print(f"  总字段数: {len(headers)}")

    # 2. 基本信息分布
    print("\n[2/6] 基础人口学分析...")
    demographics = {}

    # 高校类型
    gender = describe_categorical(records, '2、您的性别:')
    demographics['gender'] = gender

    grade = describe_categorical(records, '4、您所在的年级:')
    demographics['grade'] = grade

    discipline = describe_categorical(records, '5、您所学习的学科:')
    demographics['discipline'] = discipline

    study_time = describe_categorical(records, '6、您的每天平均学习时间（不含上课）:')
    demographics['daily_study_time'] = study_time

    academic_perf = describe_categorical(records, '7、您自我感觉您的学业表现在班级或年级的位置:')
    demographics['academic_performance'] = academic_perf

    research_participation = describe_categorical(records, '8、您是否参与过科研活动?')
    demographics['research_participation'] = research_participation

    # 3. GenAI使用行为
    print("\n[3/6] GenAI使用行为分析...")
    genai_usage = {}

    genai_know = describe_categorical(records, '10、您是否了解生成式人工智能工具（如ChatGPT、文心一言等）?')
    genai_usage['awareness'] = genai_know

    genai_scenes = describe_categorical(records, '11、您是否在以下场景中使用过GenAI?')
    genai_usage['usage_scenes'] = genai_scenes

    no_use_reason = describe_categorical(records, '12、您不使用GenAI的主要原因是什么?')
    genai_usage['no_use_reason'] = no_use_reason

    start_time = describe_categorical(records, '13、您开始使用GenAI的时间:')
    genai_usage['start_time'] = start_time

    frequency = describe_categorical(records, '14、您使用GenAI的频率:')
    genai_usage['frequency'] = frequency

    typical_usage = describe_categorical(records, '15、您的典型使用方式')
    genai_usage['typical_usage'] = typical_usage

    functions_used = describe_categorical(records, '16、您主要使用GenAI的哪些功能?')
    genai_usage['functions_used'] = functions_used

    answer_use = describe_categorical(records, '17、您怎样使用GenAI的答案?')
    genai_usage['answer_usage'] = answer_use

    # 4. Likert量表：GenAI使用方式
    print("\n[4/6] Likert量表分析...")
    likert_results = {}

    genai_use_items = [
        '18、您如何使用GenAI（1=完全不符合，5=完全符合）:—我会提前准备好明确的问题再使用GenAI',
        '18、我会根据GenAI的回答继续追问和深入探讨',
        '18、我会主动调整提问方式以获得更好的答案',
        '18、我会验证和核实GenAI提供的信息',
        '18、我会将GenAI的回答与其他资源对比分析',
        '18、我会对GenAI的回答进行批判性思考',
        '18、我会基于GenAI的建议形成自己的见解',
    ]
    # Short labels for these items
    genai_use_labels = {
        genai_use_items[0]: '提前准备明确问题',
        genai_use_items[1]: '继续追问深入探讨',
        genai_use_items[2]: '主动调整提问方式',
        genai_use_items[3]: '验证核实信息',
        genai_use_items[4]: '与其他资源对比',
        genai_use_items[5]: '批判性思考',
        genai_use_items[6]: '形成自己见解',
    }

    likert_results['genai_usage_style'] = describe_likert(records, genai_use_items, 'GenAI使用方式')

    # 当前课程学习情况
    course_items = [
        '19、您目前课程学习的情况（1=完全不符合，5=完全符合）—课堂测验中正确回答专业问题',
        '19、实践作业中解决具体问题',
        '19、独立完成课程作业任务',
        '19、课后主动查阅补充资料',
        '19、专注听课',
        '19、与同学讨论课程难点',
    ]
    likert_results['current_course_learning'] = describe_likert(records, course_items, '当前课程学习')

    # 科研活动情况
    research_items = [
        '20、您目前科研活动的情况（1=完全不符合，5=完全符合）—准确理解文献核心内容',
        '20、规律阅读最新学术期刊',
        '20、主动参与科研讨论',
        '20、提出有创新性的研究思路',
        '20、独立完成数据处理工作',
        '20、与导师和同学交流研究',
    ]
    likert_results['current_research'] = describe_likert(records, research_items, '当前科研活动')

    # 校园生活
    life_items = [
        '21、您目前校园生活的情况（1=完全不符合，5=完全符合）—按计划完成日常任务',
        '21、积极参与校园活动',
        '21、主动结识新朋友',
        '21、有效处理人际关系',
        '21、参与团队合作项目',
        '21、规划并执行个人发展',
    ]
    likert_results['current_campus_life'] = describe_likert(records, life_items, '当前校园生活')

    # 与学期初相比的变化
    course_change_items = [
        '22、您目前课程学习的情况与学期初相比（1=显著下降，5=显著提升）—课堂测验中正确回答专业问题',
        '22、实践作业中解决具体问题',
        '22、独立完成课程作业任务',
        '22、课后主动查阅补充资料',
        '22、此题请选2',
        '22、专注听课',
        '22、与同学讨论课程难点',
    ]
    # Filter out trap question
    course_change_items = [x for x in course_change_items if '此题请选2' not in x]
    likert_results['course_learning_change'] = describe_likert(records, course_change_items, '课程学习变化')

    research_change_items = [
        '23、您目前科研活动的情况与学期初相比（1=显著下降，5=显著提升）—准确理解文献核心内容',
        '23、规律阅读最新学术期刊',
        '23、主动参与科研讨论',
        '23、提出有创新性的研究思路',
        '23、独立完成数据处理工作',
        '23、与导师和同学交流研究',
    ]
    likert_results['research_change'] = describe_likert(records, research_change_items, '科研活动变化')

    life_change_items = [
        '24、您目前校园生活的情况与学期初相比（1=显著下降，5=显著提升）—按计划完成日常任务',
        '24、积极参与校园活动',
        '24、主动结识新朋友',
        '24、有效处理人际关系',
        '24、参与团队合作项目',
        '24、规划并执行个人发展',
    ]
    likert_results['campus_life_change'] = describe_likert(records, life_change_items, '校园生活变化')

    # 5. 开放题文本分析
    print("\n[5/6] 开放题文本分析...")
    text_results = {}

    q25 = text_analysis(records, '25、请举例说明GenAI是如何帮助您完成某项具体任务的?效果如何?')
    text_results['genai_task_examples'] = q25

    q26 = text_analysis(records, '26、在遇到学习或生活难题时，您通常会采取哪些解决方法?')
    text_results['problem_solving_methods'] = q26

    q27 = text_analysis(records, '27、基于您的经历，您认为GenAI在哪些具体场景下最有帮助?哪些场景下可能存在局限?')
    text_results['genai_scenarios_limitations'] = q27

    # 6. 组装输出
    print("\n[6/6] 生成结果文件...")

    result = {
        "dataset": "生成式人工智能对大学生影响的调查",
        "file": FNAME,
        "total_records": len(records),
        "total_fields": len(headers),
        "analysis_mode": "quick_overview",
        "demographics": demographics,
        "genai_usage": genai_usage,
        "likert_scales": likert_results,
        "text_analysis": text_results,
    }

    # 保存完整结果
    output_path = OUTPUT_DIR / "dataset5_analysis.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n  ✓ 完整结果: {output_path} ({output_path.stat().st_size / 1024:.1f} KB)")

    # 生成摘要报告
    summary = generate_summary(result)
    summary_path = OUTPUT_DIR / "dataset5_summary.md"
    with open(summary_path, 'w', encoding='utf-8') as f:
        f.write(summary)
    print(f"  ✓ 摘要报告: {summary_path}")

    print("\n" + "=" * 60)
    print("分析完成!")
    print("=" * 60)

    return result

def generate_summary(result):
    """生成Markdown摘要报告"""
    lines = []
    lines.append("# 数据集 #5 分析摘要：生成式人工智能对大学生影响的调查")
    lines.append(f"\n**样本量**: {result['total_records']} 份")
    lines.append(f"**字段数**: {result['total_fields']}")
    lines.append(f"**分析模式**: 快速概览（模式1）")

    # 人口学摘要
    lines.append("\n## 1. 样本构成")
    dem = result['demographics']

    for key in ['gender', 'grade', 'discipline']:
        if key in dem and 'distribution' in dem[key]:
            lines.append(f"\n### {dem[key]['column']}")
            for item in dem[key]['distribution'][:8]:
                lines.append(f"- {item['label']}: {item['count']} ({item['percentage']}%)")

    # GenAI使用摘要
    lines.append("\n## 2. GenAI 使用行为")
    gai = result['genai_usage']

    for key in ['start_time', 'frequency', 'typical_usage']:
        if key in gai and 'distribution' in gai[key]:
            lines.append(f"\n### {gai[key]['column']}")
            for item in gai[key]['distribution'][:5]:
                lines.append(f"- {item['label']}: {item['count']} ({item['percentage']}%)")

    # Likert量表摘要
    lines.append("\n## 3. 核心量表得分")
    for group_name, items in result['likert_scales'].items():
        if items:
            lines.append(f"\n### {items[0]['group'] if items else group_name}")
            for item in items[:8]:
                lines.append(f"- {item['column'].split('—')[-1] if '—' in item['column'] else item['column']}: "
                           f"均值={item['mean']}, SD={item['std']}")

    # 文本分析摘要
    lines.append("\n## 4. 开放题关键词")
    for key, ta in result['text_analysis'].items():
        lines.append(f"\n### {ta.get('column', key)}")
        lines.append(f"  有效回答: {ta.get('total_answers', 0)} 份")
        if 'top_keywords' in ta:
            top10 = ta['top_keywords'][:10]
            lines.append(f"  Top 10 关键词: {', '.join(w['word'] for w in top10)}")

    return '\n'.join(lines)

if __name__ == '__main__':
    main()
