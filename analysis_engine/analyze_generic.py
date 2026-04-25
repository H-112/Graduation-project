"""
通用问卷分析引擎 — 支持任意CSV/Excel文件
模式1：自动检测题型 → 描述性统计 + NLP + 图表数据
用法: python3 analyze_generic.py <input_file> <output_dir>
"""
import sys
import json
import csv
import math
import os
from pathlib import Path
from collections import Counter
import re

def progress(msg):
    """输出进度标记，前端通过 SSE 实时接收"""
    print(f"[PROGRESS] {msg}", flush=True)

def load_csv(filepath):
    """加载CSV文件"""
    rows = []
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        for row in reader:
            rows.append(row)
    return headers, rows

def load_excel(filepath):
    """加载Excel文件"""
    import openpyxl
    wb = openpyxl.load_workbook(filepath)
    ws = wb.active
    headers = [ws.cell(1, c).value or f"Column{c}" for c in range(1, ws.max_column + 1)]
    rows = []
    for r in range(2, ws.max_row + 1):
        row = {}
        for c, h in enumerate(headers, 1):
            val = ws.cell(r, c).value
            row[h] = str(val).strip() if val is not None else ""
        rows.append(row)
    return headers, rows

# ============================================
# 数据清洗模块
# ============================================

def clean_data(headers, rows):
    """数据清洗流水线：去重→去空→筛选低质→标准化"""
    stats = {
        "original_count": len(rows),
        "removed_empty": 0,
        "removed_duplicates": 0,
        "removed_low_quality": 0,
        "final_count": 0,
    }

    # 1. 去除完全空行
    non_empty = []
    for row in rows:
        has_data = any(str(row.get(h, '')).strip() for h in headers)
        if has_data:
            non_empty.append(row)
    stats["removed_empty"] = len(rows) - len(non_empty)
    rows = non_empty

    # 2. 去除重复行（基于所有非空值）
    seen = set()
    unique = []
    for row in rows:
        fingerprint = tuple(str(row.get(h, '')).strip() for h in headers if str(row.get(h, '')).strip())
        if fingerprint not in seen:
            seen.add(fingerprint)
            unique.append(row)
    stats["removed_duplicates"] = len(rows) - len(unique)
    rows = unique

    # 3. 标记低质量行（缺失值超过80%）
    clean_rows = []
    for row in rows:
        non_empty_count = sum(1 for h in headers if str(row.get(h, '')).strip())
        missing_ratio = 1 - (non_empty_count / len(headers))
        if missing_ratio < 0.8:
            clean_rows.append(row)
    stats["removed_low_quality"] = len(rows) - len(clean_rows)
    rows = clean_rows

    # 4. 标准化文本值（去除首尾空白）
    for row in rows:
        for h in headers:
            val = row.get(h, '')
            if isinstance(val, str):
                row[h] = val.strip()

    # 5. 将跳过/缺失标记替换为空值
    SKIP_MARKERS = {'(跳过)', '（跳过）', '(跳过)', '（跳过）'}
    skip_replaced = 0
    for row in rows:
        for h in headers:
            val = row.get(h, '')
            if isinstance(val, str) and val in SKIP_MARKERS:
                row[h] = ''
                skip_replaced += 1
    if skip_replaced > 0:
        stats["removed_skips"] = skip_replaced

    stats["final_count"] = len(rows)
    return rows, stats


MULTI_SELECT_SEPARATOR = '┋'

# ── 文本型 Likert 量表自动检测 ──
# 常见中文 Likert 量表选项集合及其 1-5 分值映射
# 规则引擎据此识别非数字的等级选项（如 非常满意/比较满意/一般/比较不满意/非常不满意）
KNOWN_LIKERT_VALUE_SETS = [
    # 满意度
    {'非常满意': 5, '比较满意': 4, '一般': 3, '比较不满意': 2, '非常不满意': 1},
    {'很满意': 5, '满意': 4, '一般': 3, '不满意': 2, '很不满意': 1},
    # 同意度
    {'非常同意': 5, '比较同意': 4, '一般': 3, '比较不同意': 2, '非常不同意': 1},
    {'很同意': 5, '同意': 4, '一般': 3, '不同意': 2, '很不同意': 1},
    # 符合度
    {'非常符合': 5, '比较符合': 4, '一般': 3, '比较不符合': 2, '非常不符合': 1},
    # 重要性
    {'非常重要': 5, '比较重要': 4, '一般': 3, '不太重要': 2, '完全不重要': 1},
    # 频率
    {'总是': 5, '经常': 4, '有时': 3, '偶尔': 2, '从不': 1},
    {'非常频繁': 5, '比较频繁': 4, '一般': 3, '偶尔使用': 2, '从不使用': 1},
    # 密度/充足度
    {'太多': 5, '偏多': 4, '合理': 3, '合适': 3, '适中': 3, '偏少': 2, '太少': 1},
    {'过多': 5, '偏多': 4, '适中': 3, '合适': 3, '偏少': 2, '过少': 1},
    # 好坏评价
    {'非常好': 5, '比较好': 4, '一般': 3, '比较差': 2, '非常差': 1},
    {'很好': 5, '较好': 4, '一般': 3, '较差': 2, '很差': 1},
    # 了解程度
    {'非常了解': 5, '比较了解': 4, '一般': 3, '不太了解': 2, '完全不了解': 1},
    # 帮助程度
    {'非常有帮助': 5, '比较有帮助': 4, '一般': 3, '帮助不大': 2, '完全没有帮助': 1},
    # 难易度
    {'非常容易': 5, '比较容易': 4, '一般': 3, '比较困难': 2, '非常困难': 1},
    # 意愿
    {'非常愿意': 5, '比较愿意': 4, '一般': 3, '不太愿意': 2, '完全不愿意': 1},
    {'非常希望': 5, '比较希望': 4, '一般': 3, '不太希望': 2, '完全不希望': 1},
]

def detect_text_likert_map(values):
    """检测文本型 Likert 量表并将选项映射为 1-5 分值
    返回 (value_map: dict) 或 None
    """
    # 收集清洗后的非空唯一值
    cleaned_vals = set()
    for v in values:
        v = v.strip()
        if not v:
            continue
        # 去除可能的前缀（A. B. 1. 等）
        v = re.sub(r'^[A-Ea-e][\.\、）\)]\s*', '', v)
        v = re.sub(r'^\d+[\.\、）\)]\s*', '', v)
        if v:
            cleaned_vals.add(v)

    if len(cleaned_vals) < 3 or len(cleaned_vals) > 7:
        return None

    # 尝试匹配已知 Likert 集合
    best_match = None
    best_overlap = 0
    for known_map in KNOWN_LIKERT_VALUE_SETS:
        known_keys = set(known_map.keys())
        overlap = len(cleaned_vals & known_keys)
        # 至少要有 3 个匹配，且覆盖 ≥80% 的实际值
        if overlap >= 3 and overlap >= len(cleaned_vals) * 0.75:
            if overlap > best_overlap:
                best_overlap = overlap
                best_match = known_map

    return best_match

# 由 detect_question_type 填入：文本 Likert 的 {header: value_map}
_text_likert_maps = {}

def detect_question_type(header, values):
    """自动检测题目类型"""
    header_lower = header.lower()
    non_empty = [v for v in values if v.strip()]

    if len(non_empty) == 0:
        return 'skip'

    # 跳过元数据列
    skip_keywords = ['编号', '序号', 'id', '时间', 'ip', 'ua', 'referrer', '来源',
                     '地理位置', '国家', '省份', '城市', '自定义', '语言', '清洗',
                     '邮箱', '手机', '总分', '所用时间', '提交答卷时间', '开始答题时间',
                     '结束答题时间', '答题时长', '提交时间']
    for kw in skip_keywords:
        if kw in header_lower:
            return 'skip'

    # 检测是否为 Likert 量表 — 排除多选分隔符值
    numeric_vals = []
    for v in non_empty:
        if MULTI_SELECT_SEPARATOR in v:
            continue  # 含分隔符的不是 Likert
        try:
            n = int(float(v))
            if 1 <= n <= 5:
                numeric_vals.append(n)
        except ValueError:
            pass

    if len(numeric_vals) > len(non_empty) * 0.7:
        return 'likert'

    # 检测文本型 Likert（如 非常满意/比较满意/一般/比较不满意/非常不满意）
    text_likert_map = detect_text_likert_map(non_empty)
    if text_likert_map is not None:
        _text_likert_maps[header] = text_likert_map
        return 'likert'

    # 检测多选分隔符
    has_separator = sum(1 for v in non_empty if MULTI_SELECT_SEPARATOR in v or ';' in v or '；' in v)
    if has_separator > len(non_empty) * 0.15:
        return 'multi_select_single_col'

    # 检测选项分列格式（header 含 ":" 且值为空或重复 header 后缀）
    # 列如 "6.通勤地点:一丹图书馆"，值如 "D.一丹图书馆" 或 ""
    # 注意：排除冒号后为空（如 "4、您所在的年级:"）或冒号前是长问题的情况
    if ':' in header:
        after_colon = header.split(':', 1)[1].strip()
        before_colon = header.split(':', 1)[0].strip()
        # 冒号后为空 → 只是普通标点，不是多选分列格式
        if not after_colon:
            pass  # skip multi_select_column detection
        # 冒号前超过30字 → 很可能是问题文本，不是多选前缀
        elif len(before_colon) > 30:
            pass
        else:
            option_like = sum(1 for v in non_empty if v.strip() and len(v.strip()) < 100)
            if option_like > len(non_empty) * 0.1:
                return 'multi_select_column'

    # 检测单选题（选项包含 A. B. C. 或 数字编号前缀）
    has_letter_option = sum(1 for v in non_empty if re.match(r'^[A-Ea-e][\.\、）\)]', v.strip()))
    has_number_option = sum(1 for v in non_empty if re.match(r'^\d+[\.\、）\)]', v.strip()))
    if has_letter_option > len(non_empty) * 0.3 or has_number_option > len(non_empty) * 0.3:
        return 'single_choice'

    # 唯一值很少 → 单选
    unique = len(set(non_empty))
    if unique <= 15:
        return 'single_choice'

    # 默认：文本题
    return 'text'


def parse_single_choice_value(val):
    """解析单选题值，去除前缀如 A. B. 1. 2. 等"""
    val = val.strip()
    val = re.sub(r'^[A-Ea-e][\.\、）\)]\s*', '', val)
    val = re.sub(r'^\d+[\.\、）\)]\s*', '', val)
    return val


def describe_multi_select_single_col(values, header):
    """统计多选单列：值被 ┋ 分隔，拆分后独立计数，百分比基于有效答卷人数"""
    all_selections = []
    respondent_count = 0

    for v in values:
        parts = [p.strip() for p in v.replace(';', MULTI_SELECT_SEPARATOR).replace('；', MULTI_SELECT_SEPARATOR).split(MULTI_SELECT_SEPARATOR) if p.strip()]
        if parts:
            respondent_count += 1
            # 清洗每个选项去除前缀
            cleaned = [parse_single_choice_value(p) for p in parts]
            all_selections.extend(cleaned)

    counter = Counter(all_selections)

    return {
        "column": header,
        "type": "multi_select",
        "total_respondents": respondent_count,
        "total_records": len(values),
        "total_selections": len(all_selections),
        "avg_selections_per_respondent": round(len(all_selections) / max(respondent_count, 1), 2),
        "distribution": [
            {
                "label": k,
                "count": c,
                "percentage_in_respondents": round(c / max(respondent_count, 1) * 100, 1),
                "percentage_in_total": round(c / max(len(values), 1) * 100, 1),
            }
            for k, c in counter.most_common()
        ]
    }


def describe_multi_select_columns(question_label, columns_values):
    """统计选项分列的多选题 — 每个列是一个选项，值非空表示选中"""
    # columns_values: [(col_header, values_array), ...]
    options = []
    respondent_count = 0
    total_selections = 0

    for header, values in columns_values:
        selected_count = sum(1 for v in values if v.strip())
        # 标签：取 header ":" 后面的部分，去除首尾空格和选项前缀
        label = header.split(':', 1)[1].strip() if ':' in header else header
        label = parse_single_choice_value(label)
        # 合并相同标签（防止 "理学院" 和 " 理学院" 重复）
        existing = next((opt for opt in options if opt["label"] == label), None)
        if existing:
            existing["count"] += selected_count
        else:
            options.append({"label": label, "count": selected_count})
        respondent_count = max(respondent_count, selected_count)
        total_selections += selected_count

    # 实际答卷人数：至少选了一个选项的行数
    n = len(columns_values[0][1]) if columns_values else 0
    actual_respondents = 0
    for i in range(n):
        if any(str(columns_values[j][1][i]).strip() for j in range(len(columns_values))):
            actual_respondents += 1

    options.sort(key=lambda x: -x["count"])

    return {
        "column": question_label,
        "type": "multi_select_columns",
        "total_respondents": actual_respondents,
        "total_records": n,
        "option_columns": len(columns_values),
        "total_selections": total_selections,
        "avg_selections_per_respondent": round(total_selections / max(actual_respondents, 1), 2),
        "distribution": [
            {
                "label": opt["label"],
                "count": opt["count"],
                "percentage_in_respondents": round(opt["count"] / max(actual_respondents, 1) * 100, 1),
                "percentage_in_total": round(opt["count"] / max(n, 1) * 100, 1),
            }
            for opt in options
        ]
    }


def describe_categorical(values, header):
    """单选题统计"""
    valid = [parse_single_choice_value(v) for v in values if v.strip()]
    counter = Counter(valid)
    total = len(valid)
    return {
        "column": header,
        "type": "single_choice",
        "total_valid": total,
        "total_records": len(values),
        "missing": len(values) - total,
        "distribution": [
            {"label": k, "count": c, "percentage": round(c / total * 100, 1)}
            for k, c in counter.most_common()
        ]
    }

def describe_likert(header, values, llm_value_map=None):
    """Likert量表统计 — 支持数字，也接受 LLM 提供的文本→分值动态映射"""
    nums = []
    used_text_map = False
    text_scores = llm_value_map or {}

    for v in values:
        v = v.strip()
        if not v:
            continue
        # 尝试数字解析
        try:
            n = int(float(v))
            if 1 <= n <= 5:
                nums.append(n)
                continue
        except ValueError:
            pass
        # 清洗前缀 (A. B. 1. 2. 等) 后查 LLM 映射
        cleaned = re.sub(r'^[A-Ea-e][\.\、）\)]\s*', '', v)
        cleaned = re.sub(r'^\d+[\.\、）\)]\s*', '', cleaned)
        if cleaned in text_scores:
            nums.append(text_scores[cleaned])
            used_text_map = True

    if not nums:
        return None

    n = len(nums)
    mean_v = sum(nums) / n
    variance = sum((x - mean_v)**2 for x in nums) / (n - 1) if n > 1 else 0
    std_v = math.sqrt(variance)
    dist = Counter(nums)

    return {
        "column": header,
        "group": "自动检测",
        "n": n,
        "mean": round(mean_v, 3),
        "median": sorted(nums)[n // 2],
        "std": round(std_v, 3),
        "min": min(nums),
        "max": max(nums),
        "text_labels_parsed": used_text_map,
        "distribution": [
            {"score": i, "count": dist.get(i, 0), "percentage": round(dist.get(i, 0) / n * 100, 1)}
            for i in range(1, 6)
        ]
    }

def tokenize_chinese(text):
    """中文分词"""
    try:
        import jieba
        return list(jieba.cut(str(text)))
    except ImportError:
        text = str(text)
        result = []
        i = 0
        while i < len(text):
            if '\u4e00' <= text[i] <= '\u9fff':
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
    '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看',
    '好', '自己', '这', '他', '她', '它', '们', '那', '些', '可以',
    '觉得', '因为', '所以', '但是', '如果', '虽然', '而且', '或者',
    '还是', '应该', '能够', '需要', '已经', '比较', '非常', '什么',
    '怎么', '怎样', '吗', '呢', '吧', '啊', '哦', '嗯', '被', '把',
    '让', '给', '用', '对', '从', '以', '之', '与', '及', '等',
    '能', '会', '要', '想', '做', '来', '过', '出', '中', '后',
    '前', '下', '时', '里', '现在', '学校', '进行', '通过', '使用',
    '主要', '一般', '目前', '一些', '可能', '情况', '方面', '问题',
    '方法', '方式', '内容', '过程', '不同', '部分', '相关', '其他',
])

def text_analysis(header, values):
    """文本题分析"""
    texts = [v.strip() for v in values if v.strip() and len(v.strip()) > 3]
    if not texts:
        return None

    all_words = []
    lengths = []
    for t in texts:
        words = tokenize_chinese(t)
        words = [w for w in words if len(w) >= 2 and w not in STOPWORDS]
        all_words.extend(words)
        lengths.append(len(t))

    word_counter = Counter(all_words)
    top50 = word_counter.most_common(50)

    return {
        "column": header,
        "total_answers": len(texts),
        "avg_answer_length": round(sum(lengths) / len(lengths), 1),
        "total_words_extracted": len(all_words),
        "unique_words": len(word_counter),
        "top_keywords": [
            {"word": w, "count": c, "rank": i+1}
            for i, (w, c) in enumerate(top50)
        ]
    }

def load_llm_map(llm_map_arg):
    """加载 LLM 结构分类结果（JSON 字符串或文件路径）
    返回: (type_map, value_map)
      - type_map: {column: type}
      - value_map: {column: {label: score}}
    """
    import json as _json
    raw = llm_map_arg
    p = Path(llm_map_arg)
    if p.exists():
        raw = p.read_text('utf-8')
    data = _json.loads(raw) if isinstance(raw, str) else raw
    columns = data.get('classification', data.get('columns', []))
    type_map = {}
    value_map = {}
    for c in columns:
        type_map[c['column']] = c['type']
        if c.get('value_map'):
            value_map[c['column']] = c['value_map']
    return type_map, value_map


def apply_llm_overrides(col_types, llm_type_map, headers, col_values):
    """用 LLM 分类覆盖规则引擎的误判"""
    overrides = {}
    for header in headers:
        llm_type = llm_type_map.get(header)
        if not llm_type or llm_type == 'unknown':
            continue
        rule_type = col_types.get(header, 'skip')

        # 规则1: LLM 判定为 demographic → 强制归入人口学
        # （LLM 能识别"书院/院系/住宿地"等语义，而规则引擎只看唯一值数量）
        if llm_type == 'demographic' and rule_type != 'skip':
            overrides[header] = 'single_choice'  # 作为单选题处理，后续路由到 demographics
            progress(f"  [LLM校正] {header[:50]}... {rule_type} → demographic")

        # 规则2: LLM 判定为 likert → 如果规则判定为 single_choice，信任 LLM 的语义判断
        # （LLM 已看到列名+采样值，能识别文本型等级选项如 太多/偏多/合理/偏少/太少）
        elif llm_type == 'likert' and rule_type == 'single_choice':
            overrides[header] = 'likert'
            progress(f"  [LLM校正] {header[:50]}... {rule_type} → likert")

        # 规则3: LLM 判定为 text → 如果规则判定为 skip，恢复为文本分析
        elif llm_type == 'text' and rule_type == 'skip':
            values = col_values.get(header, [])
            non_empty = [v for v in values if v.strip() and len(v.strip()) > 3]
            # 确认确实有长文本内容
            if non_empty and sum(len(v) for v in non_empty) / len(non_empty) > 15:
                overrides[header] = 'text'
                progress(f"  [LLM校正] {header[:50]}... {rule_type} → text")

        # 规则4: LLM 判定为 skip → 如果规则误判，跳过
        elif llm_type == 'skip' and rule_type not in ('skip', 'multi_select_column'):
            overrides[header] = 'skip'
            progress(f"  [LLM校正] {header[:50]}... {rule_type} → skip")

    # 应用覆盖
    for h, t in overrides.items():
        col_types[h] = t
    return col_types


def main():
    import argparse
    ap = argparse.ArgumentParser(description='通用问卷分析引擎')
    ap.add_argument('input_file', nargs='?', help='输入 CSV/Excel 文件')
    ap.add_argument('output_dir', nargs='?', help='输出目录')
    ap.add_argument('--llm-map', help='LLM 结构分类 JSON（文件路径或 JSON 字符串）')
    ap.add_argument('--dataset-name', help='数据集展示名称（覆盖文件 stem）')
    args = ap.parse_args()

    if not args.input_file:
        print("Usage: python3 analyze_generic.py <input_file> [output_dir] [--llm-map <json>]")
        sys.exit(1)

    infile = Path(args.input_file)
    outdir = Path(args.output_dir) if args.output_dir else infile.parent / "output"
    outdir.mkdir(parents=True, exist_ok=True)

    progress(f"正在加载: {infile.name}...")

    # 加载数据
    ext = infile.suffix.lower()
    if ext == '.csv':
        headers, rows = load_csv(infile)
    elif ext in ('.xlsx', '.xls'):
        headers, rows = load_excel(infile)
    else:
        progress(f"错误: 不支持的文件格式 {ext}")
        sys.exit(1)

    progress(f"已加载: {len(headers)} 列, {len(rows)} 行")

    # 数据清洗
    progress("正在清洗数据...")
    rows, cleaning_stats = clean_data(headers, rows)
    progress(f"清洗完成: {cleaning_stats['final_count']} 条有效记录 "
          f"(去除空行 {cleaning_stats['removed_empty']}, 重复 {cleaning_stats['removed_duplicates']}, "
          f"低质量 {cleaning_stats['removed_low_quality']}, 跳过标记 {cleaning_stats.get('removed_skips', 0)})")

    # 提取每列的值
    col_values = {h: [row.get(h, '') for row in rows] for h in headers}

    progress("正在检测题目类型...")
    # === Pass 1: 检测所有列的类型 ===
    col_types = {}
    for header in headers:
        col_types[header] = detect_question_type(header, col_values[header])

    # === LLM 结构校正 ===
    llm_value_maps = {}
    if args.llm_map:
        progress("正在应用 LLM 结构校正...")
        llm_type_map, llm_value_maps = load_llm_map(args.llm_map)
        col_types = apply_llm_overrides(col_types, llm_type_map, headers, col_values)

    # 合并规则引擎检测到的文本 Likert value_map（LLM 优先）
    for h, vm in _text_likert_maps.items():
        if h not in llm_value_maps:
            llm_value_maps[h] = vm

    # === 分组：多选选项列 ===
    # 例: "6.通勤地点:一丹图书馆", "6.通勤地点:商学院" → group by "6.通勤地点"
    multi_select_groups = {}  # {parent_question: [(header, values), ...]}
    for header in headers:
        if col_types[header] == 'multi_select_column':
            parent = header.split(':', 1)[0].strip()
            if parent not in multi_select_groups:
                multi_select_groups[parent] = []
            multi_select_groups[parent].append((header, col_values[header]))

    # 已被分组的列不再单独处理
    grouped_headers = {h for g in multi_select_groups.values() for h, _ in g}

    progress("正在运行统计分析...")
    # 人口学关键词（用于路由判断，也用于纠正 text 误判）
    DEMOGRAPHIC_KEYWORDS = [
        '性别', '年级', '专业', '学科', '身份', '学校', '书院', '院系',
        '高校', '大学', '学院', '住宿', '年龄', '学历', '职业', '收入',
        '城市', '省份', '年', '月', '班级',
    ]

    # === Pass 2: 分类分析 ===
    demographics = {}
    likert_scales = {}
    usages = {}
    text_analysis_results = {}
    question_count = 0

    for header in headers:
        if header in grouped_headers:
            continue  # 稍后整组合并处理

        values = col_values[header]
        qtype = col_types[header]

        if qtype == 'skip':
            continue

        question_count += 1

        if qtype == 'single_choice':
            result = describe_categorical(values, header)
            hlower = header.lower()
            is_demographic = any(kw in hlower for kw in DEMOGRAPHIC_KEYWORDS)
            if is_demographic:
                demographics[header] = result
            else:
                usages[header] = result

        elif qtype == 'multi_select_single_col':
            result = describe_multi_select_single_col(values, header)
            usages[header] = result

        elif qtype == 'likert':
            result = describe_likert(header, values, llm_value_maps.get(header))
            if result:
                group = "量表题"
                if '学习' in header:
                    group = "学习相关"
                elif '科研' in header:
                    group = "科研相关"
                elif '生活' in header:
                    group = "生活相关"
                elif '使用' in header:
                    group = "使用相关"
                elif '满意' in header:
                    group = "满意度"
                elif '评价' in header:
                    group = "评价相关"
                result["group"] = group

                if group not in likert_scales:
                    likert_scales[group] = []
                likert_scales[group].append(result)

        elif qtype == 'text':
            hlower = header.lower()
            is_demographic = any(kw in hlower for kw in DEMOGRAPHIC_KEYWORDS)
            if is_demographic:
                # 高基数的人口学列（如高校名称、年级自由填写）→ 仍然做分类统计
                result = describe_categorical(values, header)
                demographics[header] = result
            else:
                result = text_analysis(header, values)
                if result:
                    text_analysis_results[header] = result

    # === 处理多选选项列组 ===
    for parent_label, columns in multi_select_groups.items():
        result = describe_multi_select_columns(parent_label, columns)
        hlower = parent_label.lower()
        is_demographic = any(kw in hlower for kw in DEMOGRAPHIC_KEYWORDS)
        if is_demographic:
            demographics[parent_label] = result
        else:
            usages[parent_label] = result
        question_count += 1

    # 重排 question_count: 加上跳过的分列数
    question_count += len(grouped_headers)  # 补回分列的实际列数

    # 组装结果
    dataset_label = args.dataset_name if args.dataset_name else infile.stem
    output = {
        "dataset": dataset_label,
        "file": infile.name,
        "total_records": len(rows),
        "total_fields": len(headers),
        "analysis_mode": "quick_overview",
        "llm_structure_used": bool(args.llm_map),
        "cleaning": {
            "original_count": cleaning_stats["original_count"],
            "removed_empty": cleaning_stats["removed_empty"],
            "removed_duplicates": cleaning_stats["removed_duplicates"],
            "removed_low_quality": cleaning_stats["removed_low_quality"],
            "removed_skips": cleaning_stats.get("removed_skips", 0),
            "final_count": cleaning_stats["final_count"],
            "retention_rate": round(cleaning_stats["final_count"] / max(cleaning_stats["original_count"], 1) * 100, 1),
        },
        "summary": {
            "totalResponses": len(rows),
            "questionCount": question_count,
        },
        "demographics": demographics,
        "genai_usage": usages,
        "likert_scales": likert_scales,
        "text_analysis": text_analysis_results,
    }

    # 保存
    outfile = outdir / f"{infile.stem}_analysis.json"
    progress("正在保存分析结果...")
    with open(outfile, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    progress(f"人口学维度: {len(demographics)} 项")
    progress(f"选择题分布: {len(usages)} 项")
    progress(f"量表题组: {len(likert_scales)} 组")
    progress(f"文本分析: {len(text_analysis_results)} 项")
    progress(f"结果已保存: {outfile} ({outfile.stat().st_size / 1024:.1f} KB)")
    # 输出最终结果路径供 Node.js 解析
    print(f"[RESULT] {outfile}", flush=True)

if __name__ == '__main__':
    main()
