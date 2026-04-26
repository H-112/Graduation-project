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

from utils import progress, tokenize_chinese, STOPWORDS, analyze_sentiment, analyze_length_distribution, validate_path, sanitize_prompt_text

def _dedupe_headers(headers):
    """给重复列名添加后缀，确保唯一性"""
    seen = {}
    result = []
    for h in headers:
        if h in seen:
            seen[h] += 1
            result.append(f"{h}_{seen[h]}")
        else:
            seen[h] = 0
            result.append(h)
    return result

def load_csv(filepath):
    """加载CSV文件 — 使用 csv.reader 保留重复列"""
    rows = []
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        raw_headers = next(reader)
        headers = _dedupe_headers(raw_headers)
        for row in reader:
            # 按索引映射，确保重复列的数据都被保留
            new_row = {}
            for i, h in enumerate(headers):
                val = row[i] if i < len(row) else ''
                new_row[h] = val.strip() if isinstance(val, str) else str(val) if val is not None else ''
            rows.append(new_row)
    return headers, rows

def load_excel(filepath):
    """加载Excel文件"""
    import openpyxl
    wb = openpyxl.load_workbook(filepath)
    ws = wb.active
    raw_headers = [ws.cell(1, c).value or f"Column{c}" for c in range(1, ws.max_column + 1)]
    headers = _dedupe_headers(raw_headers)
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
        "examples": {
            "low_quality": [],
            "duplicates": [],
        },
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
    seen = {}
    unique = []
    dup_groups = {}  # fingerprint -> count
    for row in rows:
        fingerprint = tuple(str(row.get(h, '')).strip() for h in headers if str(row.get(h, '')).strip())
        if fingerprint not in seen:
            seen[fingerprint] = row
            unique.append(row)
        dup_groups[fingerprint] = dup_groups.get(fingerprint, 0) + 1
    stats["removed_duplicates"] = len(rows) - len(unique)
    # 记录重复示例（取重复次数最多的前3组）
    dup_examples = [
        {"count": c, "sample": " | ".join(fingerprint[:3])}
        for fingerprint, c in sorted(dup_groups.items(), key=lambda x: -x[1])
        if c > 1
    ][:3]
    stats["examples"]["duplicates"] = dup_examples
    rows = unique

    # 3. 标记低质量行（缺失值超过80%）
    clean_rows = []
    low_quality_examples = []
    for row in rows:
        non_empty_count = sum(1 for h in headers if str(row.get(h, '')).strip())
        missing_ratio = 1 - (non_empty_count / len(headers))
        if missing_ratio < 0.8:
            clean_rows.append(row)
        elif len(low_quality_examples) < 3:
            # 记录低质量行元数据（不暴露完整原始值）
            filled = [h for h in headers if str(row.get(h, '')).strip()][:5]
            low_quality_examples.append({
                "missing_rate": round(missing_ratio * 100, 1),
                "non_empty_count": non_empty_count,
                "total_fields": len(headers),
                "filled_columns": filled,
            })
    stats["removed_low_quality"] = len(rows) - len(clean_rows)
    stats["examples"]["low_quality"] = low_quality_examples
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


def compute_quality_metrics(rows, headers, col_types, multi_select_groups=None):
    """计算每列的数据质量指标：缺失率、有效回答数等"""
    total_records = len(rows)
    per_question = []

    for h in headers:
        qtype = col_types.get(h, 'unknown')
        if qtype in ('skip', 'multi_select_column'):
            continue

        values = [row.get(h, '') for row in rows]
        # 统计缺失值（空字符串或仅空白字符）
        missing = sum(1 for v in values if not str(v).strip())
        valid = total_records - missing
        missing_rate = round(missing / total_records * 100, 1) if total_records > 0 else 0
        valid_rate = round(valid / total_records * 100, 1) if total_records > 0 else 0

        per_question.append({
            "column": h,
            "detected_type": qtype,
            "total_records": total_records,
            "missing": missing,
            "valid": valid,
            "missing_rate": missing_rate,
            "valid_rate": valid_rate,
        })

    # 为 multi_select_column 的 parent question 补充一行汇总
    # “缺失”定义为所有子列都为空的人数
    for parent_label, columns in (multi_select_groups or {}).items():
        missing = 0
        n = len(columns[0][1]) if columns else 0
        for i in range(n):
            if not any(str(columns[j][1][i]).strip() for j in range(len(columns))):
                missing += 1
        valid = n - missing
        missing_rate = round(missing / max(n, 1) * 100, 1)
        per_question.append({
            "column": parent_label,
            "detected_type": "multi_select_columns",
            "total_records": n,
            "missing": missing,
            "valid": valid,
            "missing_rate": missing_rate,
            "valid_rate": round(valid / max(n, 1) * 100, 1),
        })

    # 按缺失率降序排列
    per_question.sort(key=lambda x: x["missing_rate"], reverse=True)

    # 汇总指标
    overall_missing_avg = round(sum(q["missing_rate"] for q in per_question) / len(per_question), 1) if per_question else 0
    high_missing = sum(1 for q in per_question if q["missing_rate"] > 30)
    extreme_missing = sum(1 for q in per_question if q["missing_rate"] > 70)

    return {
        "per_question": per_question,
        "overall_missing_avg": overall_missing_avg,
        "high_missing_count": high_missing,
        "extreme_missing_count": extreme_missing,
    }


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

def detect_question_type(header, values):
    """自动检测题目类型。返回 (类型, 文本likert映射或None)"""
    header_lower = header.lower()
    non_empty = [v for v in values if v.strip()]

    if len(non_empty) == 0:
        return 'skip', None

    # 跳过元数据列（身份标识、系统字段等不应参与分析）
    skip_keywords = ['编号', '序号', 'id', '时间', 'ip', 'ua', 'referrer', '来源',
                     '地理位置', '国家', '省份', '城市', '自定义', '语言', '清洗',
                     '邮箱', '手机', '总分', '所用时间', '提交答卷时间', '开始答题时间',
                     '结束答题时间', '答题时长', '提交时间',
                     '提交者', '姓名', '名字', '昵称', '用户', '账号', '学号', '工号']
    for kw in skip_keywords:
        if kw in header_lower:
            return 'skip', None

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
        return 'likert', None

    # 检测文本型 Likert（如 非常满意/比较满意/一般/比较不满意/非常不满意）
    text_likert_map = detect_text_likert_map(non_empty)
    if text_likert_map is not None:
        return 'likert', text_likert_map

    # 检测多选分隔符
    has_separator = sum(1 for v in non_empty if MULTI_SELECT_SEPARATOR in v or ';' in v or '；' in v)
    if has_separator > len(non_empty) * 0.15:
        return 'multi_select_single_col', None

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
                return 'multi_select_column', None

    # 检测单选题（选项包含 A. B. C. 或 数字编号前缀）
    has_letter_option = sum(1 for v in non_empty if re.match(r'^[A-Ea-e][\.\、）\)]', v.strip()))
    has_number_option = sum(1 for v in non_empty if re.match(r'^\d+[\.\、）\)]', v.strip()))
    if has_letter_option > len(non_empty) * 0.3 or has_number_option > len(non_empty) * 0.3:
        return 'single_choice', None

    # 唯一值很少 → 单选
    unique = len(set(non_empty))
    if unique <= 15:
        return 'single_choice', None

    # 默认：文本题
    return 'text', None


def parse_single_choice_value(val):
    """解析单选题值，去除前缀如 A. B. AA. 1. 2. 等"""
    val = val.strip()
    # 支持任意字母前缀（A-Z, AA, AB, AK 等），限制最多3个字母避免误伤英文单词
    val = re.sub(r'^[A-Za-z]{1,3}[\.\、）\)]\s*', '', val)
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
    """统计选项分列的多选题 — 每个列是一个选项，值非空表示选中
    支持同一选项出现在多个列中的情况（按 respondent 做 OR 合并）
    """
    n = len(columns_values[0][1]) if columns_values else 0

    # 第一步：按标签归并，同一 respondent 只要任一列非空就算选中
    label_to_selections: dict[str, list[bool]] = {}

    for header, values in columns_values:
        # 提取选项标签
        label = header.split(':', 1)[1].strip() if ':' in header else header
        label = parse_single_choice_value(label)
        # 去除 _dedupe_headers 添加的 _N 后缀（如 "理学院_1" → "理学院"）
        label = re.sub(r'_\d+$', '', label)

        if label not in label_to_selections:
            label_to_selections[label] = [False] * n
        for i, v in enumerate(values):
            if str(v).strip():
                label_to_selections[label][i] = True

    # 第二步：统计
    total_selections = 0
    actual_respondents = 0
    for i in range(n):
        if any(label_to_selections[label][i] for label in label_to_selections):
            actual_respondents += 1

    options = []
    for label, selections in label_to_selections.items():
        count = sum(selections)
        total_selections += count
        options.append({"label": label, "count": count})

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

    result = {
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

    # 情感分析
    sentiment = analyze_sentiment(texts)
    if sentiment:
        result["sentiment"] = sentiment

    # 长度分布
    length_dist = analyze_length_distribution(lengths)
    if length_dist:
        result["length_distribution"] = length_dist

    return result

def load_llm_map(llm_map_arg):
    """加载 LLM 结构分类结果（JSON 字符串或文件路径）
    返回: (type_map, value_map, reason_map)
      - type_map: {column: type}
      - value_map: {column: {label: score}}
      - reason_map: {column: reason}
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
    reason_map = {}
    for c in columns:
        type_map[c['column']] = c['type']
        if c.get('value_map'):
            value_map[c['column']] = c['value_map']
        if c.get('reason'):
            reason_map[c['column']] = c['reason']
    return type_map, value_map, reason_map


def apply_llm_overrides(col_types, llm_type_map, headers, col_values):
    """用 LLM 分类覆盖规则引擎的误判
    返回: (col_types, override_log)
      - override_log: [{column, from, to, reason}, ...]
    """
    overrides = {}
    override_log = []
    for header in headers:
        llm_type = llm_type_map.get(header)
        if not llm_type or llm_type == 'unknown':
            continue
        rule_type = col_types.get(header, 'skip')
        reason = ""

        # 规则1: LLM 判定为 demographic → 强制归入人口学
        if llm_type == 'demographic' and rule_type != 'skip':
            overrides[header] = 'single_choice'
            reason = "LLM识别为人口学变量"
            progress(f"  [LLM校正] {header[:50]}... {rule_type} → demographic")

        # 规则2: LLM 判定为 likert → 如果规则判定为 single_choice，信任 LLM
        elif llm_type == 'likert' and rule_type == 'single_choice':
            overrides[header] = 'likert'
            reason = "LLM识别为量表题"
            progress(f"  [LLM校正] {header[:50]}... {rule_type} → likert")

        # 规则3: LLM 判定为 text → 如果规则判定为 skip，恢复为文本分析
        elif llm_type == 'text' and rule_type == 'skip':
            values = col_values.get(header, [])
            non_empty = [v for v in values if v.strip() and len(v.strip()) > 3]
            if non_empty and sum(len(v) for v in non_empty) / len(non_empty) > 15:
                overrides[header] = 'text'
                reason = "LLM识别为文本题"
                progress(f"  [LLM校正] {header[:50]}... {rule_type} → text")

        # 规则4: LLM 判定为 skip → 如果规则误判，跳过
        elif llm_type == 'skip' and rule_type not in ('skip', 'multi_select_column'):
            overrides[header] = 'skip'
            reason = "LLM识别为跳过项"
            progress(f"  [LLM校正] {header[:50]}... {rule_type} → skip")

        if header in overrides and reason:
            override_log.append({
                "column": header,
                "from": rule_type,
                "to": overrides[header],
                "reason": reason,
            })

    # 应用覆盖
    for h, t in overrides.items():
        col_types[h] = t
    return col_types, override_log


# ============================================
# LLM-guided 交叉分析模块
# ============================================

def get_deepseek_client():
    """获取 DeepSeek API 客户端（复用项目统一配置）"""
    from openai import OpenAI
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return None
    return OpenAI(api_key=api_key, base_url="https://api.deepseek.com")


def generate_cross_hypotheses(question_specs):
    """
    使用 LLM 生成交叉分析假设。
    question_specs: [{"column": str, "type": str, "options": [str], "sample_values": [str]}]
    返回: [{"title", "description", "var_a_column", "var_b_column", "expected_insight"}]
    """
    client = get_deepseek_client()
    if not client:
        return []

    # 构建简洁的题目描述
    spec_lines = []
    for i, q in enumerate(question_specs[:30], 1):  # 最多30题，防止token过长
        safe_opts = [sanitize_prompt_text(opt) for opt in q["options"][:6]]
        opts = ", ".join(safe_opts)
        if len(q["options"]) > 6:
            opts += f" 等{len(q['options'])}个选项"
        spec_lines.append(f"{i}. [{q['type']}] {sanitize_prompt_text(q['column'])}\n   选项: {opts}")

    prompt = f"""你是一位社会科学研究专家，正在分析一份问卷数据。请基于以下题目信息，提出3-8个最有价值的交叉分析假设。

要求：
1. 只选择真正有分析价值的题目组合（如人口学变量×态度题、行为题×满意度题）
2. 避免无意义的组合（如两个完全不相关的开放题）
3. 每个假设应该有明确的研究问题，如"不同年级的学生对GenAI的态度是否存在差异？"
4. 优先选择与人口学变量（性别、年级、专业等）的交叉
5. 如果问卷有量表题，优先做量表×分组变量的交叉

注意：多选题的选项已拆分为独立值，交叉分析时每个被选中的选项都会独立统计。

题目列表：
{"\n".join(spec_lines)}

请输出JSON数组格式，不要任何其他文字：
[
  {{
    "title": "假设标题（简洁）",
    "description": "假设描述（研究问题）",
    "var_a_column": "第一个变量列名（必须是上面列表中的column）",
    "var_b_column": "第二个变量列名（必须是上面列表中的column）",
    "expected_insight": "预期能发现的洞察"
  }}
]
"""

    try:
        resp = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1500,
        )
        content = resp.choices[0].message.content
        # 提取JSON
        import json as _json
        # 尝试直接解析
        try:
            return _json.loads(content)
        except Exception:
            # 从markdown代码块中提取
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            return _json.loads(content)
    except Exception as e:
        progress(f"[交叉分析] LLM假设生成失败: {e}")
        return []


def run_cross_tab(rows, col_a, col_b, min_cell_count=5):
    """
    执行两列的交叉表分析 + 自适应卡方检验。
    先计算皮尔逊卡方和期望频数，根据期望频数条件自动选择：
      - 期望频数有 < 1 或 >20% < 5 时：
        · 2×2 表 → Fisher 精确检验
        · 其他表 → Yates 连续性校正（如适用）或标注不可靠
    返回: {"crosstab": [...], "chi2": float, "p_value": float, "cramers_v": float,
           "is_significant": bool, "method": str, "chi2_valid": bool,
           "expected": [[...]], "dropped_categories": [...]}
    """
    try:
        from scipy.stats import chi2_contingency, fisher_exact
    except ImportError:
        return None

    # 收集有效数据对（支持多选题拆分）
    _SEPS = ('┋', ';', '；')

    def _split_value(val: str):
        """拆分多选题值，返回单个选项列表"""
        parts = [val.strip()]
        for sep in _SEPS:
            new_parts = []
            for p in parts:
                new_parts.extend([s.strip() for s in p.split(sep) if s.strip()])
            parts = new_parts
        return parts

    pairs = []
    for row in rows:
        a_raw = str(row.get(col_a, "")).strip()
        b_raw = str(row.get(col_b, "")).strip()
        if not a_raw or not b_raw:
            continue
        if a_raw in {"(跳过)", "（跳过）", "nan", "None"} or b_raw in {"(跳过)", "（跳过）", "nan", "None"}:
            continue

        a_vals = _split_value(a_raw)
        b_vals = _split_value(b_raw)

        for a in a_vals:
            for b in b_vals:
                pairs.append((a, b))

    if len(pairs) < 10:
        return None

    # 获取唯一值
    vals_a = sorted({p[0] for p in pairs})
    vals_b = sorted({p[1] for p in pairs})

    if len(vals_a) < 2 or len(vals_b) < 2:
        return None
    if len(vals_a) > 15 or len(vals_b) > 15:
        return None

    # 构建频数表
    freq = {}
    for a, b in pairs:
        freq.setdefault(a, {}).setdefault(b, 0)
        freq[a][b] += 1

    # ── 过滤低频类别：行/列总频数低于阈值的删除 ──
    dropped = []

    row_margins = {a: sum(freq.get(a, {}).get(b, 0) for b in vals_b) for a in vals_a}
    vals_a = [a for a in vals_a if row_margins[a] >= min_cell_count]
    dropped.extend([{"axis": "row", "label": a, "count": row_margins[a]}
                    for a in row_margins if row_margins[a] < min_cell_count])

    col_margins = {b: sum(freq.get(a, {}).get(b, 0) for a in vals_a) for b in vals_b}
    vals_b = [b for b in vals_b if col_margins[b] >= min_cell_count]
    dropped.extend([{"axis": "col", "label": b, "count": col_margins[b]}
                    for b in col_margins if col_margins[b] < min_cell_count])

    if len(vals_a) < 2 or len(vals_b) < 2:
        return None

    # 重新构建二维数组（过滤后）
    table = []
    for a in vals_a:
        row_counts = []
        for b in vals_b:
            row_counts.append(freq.get(a, {}).get(b, 0))
        table.append(row_counts)

    n = sum(sum(r) for r in table)

    # ── 第一步：先算皮尔逊卡方 + 期望频数 ──
    try:
        chi2_pearson, p_pearson, dof, expected = chi2_contingency(table, correction=False)
    except Exception:
        return None

    # 期望频数分析
    expected_flat = [e for row in expected for e in row]
    min_expected = min(expected_flat)
    low_expected_count = sum(1 for e in expected_flat if e < 5)
    low_expected_ratio = low_expected_count / len(expected_flat)
    has_expected_lt_1 = min_expected < 1

    is_2x2 = len(vals_a) == 2 and len(vals_b) == 2
    method = "pearson"
    chi2_valid = True
    chi2 = chi2_pearson
    p = p_pearson

    # ── 第二步：根据期望频数决定检验方法 ──
    if has_expected_lt_1 or low_expected_ratio > 0.2:
        if is_2x2:
            # Fisher 精确检验（最稳妥，尤其当 n 很小时）
            try:
                oddsratio, fisher_p = fisher_exact(table)
                chi2 = chi2_pearson  # 保留皮尔逊卡方值用于 Cramér's V
                p = fisher_p
                method = "fisher_exact"
                chi2_valid = True
            except Exception:
                method = "pearson"
                chi2_valid = False
        else:
            # 非 2×2 表：尝试 Yates 校正（对 2×k 接近 2×2 的情况略有帮助）
            if len(vals_a) == 2 or len(vals_b) == 2:
                try:
                    chi2_yates, p_yates, _, _ = chi2_contingency(table, correction=True)
                    chi2 = chi2_yates
                    p = p_yates
                    method = "yates"
                except Exception:
                    pass
            # 若期望频数仍不满足，标记为不可靠
            if has_expected_lt_1:
                chi2_valid = False
            else:
                # 只有 >20% <5 但没有 <1 的 → 结果可接受但标注警告
                chi2_valid = True
                method = "pearson_warn"

    # Cramér's V (效应量，基于皮尔逊卡方值)
    cramers_v = 0.0
    if n > 0 and min(len(vals_a), len(vals_b)) > 1:
        cramers_v = math.sqrt(chi2 / (n * (min(len(vals_a), len(vals_b)) - 1)))

    # 按行计算百分比
    crosstab = []
    for a in vals_a:
        row_total = sum(freq.get(a, {}).get(b, 0) for b in vals_b)
        if row_total == 0:
            continue
        crosstab.append({
            "label": a,
            "total": row_total,
            "values": [
                {"label": b, "count": freq.get(a, {}).get(b, 0), "percentage": round(freq.get(a, {}).get(b, 0) / row_total * 100, 1)}
                for b in vals_b
            ]
        })

    return {
        "crosstab": crosstab,
        "chi2": round(float(chi2), 3),
        "p_value": round(float(p), 4),
        "cramers_v": round(float(cramers_v), 3),
        "is_significant": bool(float(p) < 0.05) and chi2_valid,
        "method": method,
        "chi2_valid": chi2_valid,
        "sample_size": int(n),
        "var_a_labels": vals_a,
        "var_b_labels": vals_b,
        "expected": [[round(e, 2) for e in row] for row in expected],
        "expected_stats": {
            "min": round(min_expected, 2),
            "low_count": low_expected_count,
            "low_ratio": round(low_expected_ratio, 2),
        },
        "dropped_categories": dropped,
    }


def interpret_cross_result(result, col_a, col_b):
    """根据交叉表结果生成洞察文本"""
    if not result:
        return ""

    crosstab = result["crosstab"]
    p = result["p_value"]
    cramers = result["cramers_v"]
    significant = result["is_significant"]
    method = result.get("method", "pearson")
    chi2_valid = result.get("chi2_valid", True)
    dropped = result.get("dropped_categories", [])
    expected_stats = result.get("expected_stats", {})

    method_label = {
        "pearson": "皮尔逊卡方",
        "pearson_warn": "皮尔逊卡方",
        "fisher_exact": "Fisher 精确检验",
        "yates": "Yates 校正卡方",
    }.get(method, "卡方检验")

    # 卡方检验不适用（期望频数有 < 1 的非 2×2 表）
    if not chi2_valid:
        lines = [
            f"⚠️ 期望频数不满足卡方条件（最小期望频数={expected_stats.get('min', '?')}, "
            f"{expected_stats.get('low_ratio', 0) * 100:.0f}% 单元格 < 5），结果仅供参考（p={p}）。"
        ]
        if dropped:
            dropped_labels = ", ".join(d["label"] for d in dropped[:5])
            lines.append(f"已自动忽略低频类别：{dropped_labels}" + (" 等" if len(dropped) > 5 else "") + "。")
        return "\n".join(lines)

    # 构建方法标注
    method_note = f"（{method_label}）"
    if method == "pearson_warn":
        method_note = f"（皮尔逊卡方，但 {expected_stats.get('low_ratio', 0) * 100:.0f}% 单元格期望频数 < 5，结果需谨慎解读）"
    elif method == "fisher_exact":
        method_note = "（Fisher 精确检验，因期望频数过低自动切换）"
    elif method == "yates":
        method_note = "（Yates 连续性校正）"

    # 显著性判断
    if significant:
        strength = "强" if cramers > 0.5 else ("中等" if cramers > 0.3 else "弱")
        lines = [f"两变量存在**{strength}程度**的显著关联 {method_note}（p={p}, Cramér's V={cramers}）。"]
    else:
        return f"两变量未呈现统计学显著关联 {method_note}（p={p}），暂无法得出可靠结论。"

    # 显著时，找出最突出的分布差异
    if len(crosstab) >= 2:
        all_b_labels = [v["label"] for v in crosstab[0]["values"]]
        for b_label in all_b_labels:
            max_pct = 0
            max_group = ""
            for row in crosstab:
                for v in row["values"]:
                    if v["label"] == b_label and v["percentage"] > max_pct:
                        max_pct = v["percentage"]
                        max_group = row["label"]
            if max_pct > 50 and max_group:
                lines.append(f"在 **{max_group}** 群体中，**{b_label}** 的占比最高（{max_pct}%）。")

    return "\n".join(lines)


def run_llm_guided_cross_analysis(rows, headers, col_types, demographics, usages, likert_scales):
    """
    主入口：LLM-guided 交叉分析。
    返回: [{title, description, var_a, var_b, crosstab, chi2, p_value, cramers_v, is_significant, insight}]
    """
    # 1. 构建题目规格
    question_specs = []
    valid_headers = [h for h in headers if col_types.get(h) not in ("skip", "multi_select_column")]

    # 多选题分隔符
    _SEPS = ('┋', ';', '；')

    for h in valid_headers:
        qtype = col_types.get(h, "unknown")
        values = [str(row.get(h, "")).strip() for row in rows if str(row.get(h, "")).strip()]
        unique_vals = sorted(set(v for v in values if v not in {"(跳过)", "（跳过）", "", "nan", "None"}))[:15]

        if qtype == "likert":
            question_specs.append({"column": h, "type": "量表题", "options": unique_vals[:5]})
        elif qtype == "single_choice":
            question_specs.append({"column": h, "type": "单选题", "options": unique_vals[:8]})
        elif qtype == "multi_select_single_col":
            # 拆分多选题的合并值，提取独立选项
            individual_opts = set()
            for v in unique_vals:
                # 按任意分隔符拆分
                parts = [v]
                for sep in _SEPS:
                    new_parts = []
                    for p in parts:
                        new_parts.extend([s.strip() for s in p.split(sep) if s.strip()])
                    parts = new_parts
                individual_opts.update(parts)
            opts = sorted(individual_opts)[:8]
            question_specs.append({"column": h, "type": "多选题", "options": opts})
        elif qtype == "text":
            # 文本题不做交叉分析
            continue

    if len(question_specs) < 3:
        return []

    # 2. LLM 生成假设
    progress("[交叉分析] 正在由 LLM 识别有价值的分析假设...")
    hypotheses = generate_cross_hypotheses(question_specs)
    if not hypotheses:
        return []

    # 3. 执行交叉分析
    results = []
    for hyp in hypotheses:
        col_a = hyp.get("var_a_column", "")
        col_b = hyp.get("var_b_column", "")
        if col_a not in headers or col_b not in headers or col_a == col_b:
            continue

        cross = run_cross_tab(rows, col_a, col_b)
        if not cross:
            continue

        insight = interpret_cross_result(cross, col_a, col_b)
        if not insight:
            continue

        results.append({
            "title": hyp.get("title", f"{col_a} × {col_b}"),
            "description": hyp.get("description", ""),
            "var_a": {"column": col_a, "label": col_a},
            "var_b": {"column": col_b, "label": col_b},
            "crosstab": cross["crosstab"],
            "chi2": cross["chi2"],
            "p_value": cross["p_value"],
            "cramers_v": cross["cramers_v"],
            "is_significant": cross["is_significant"],
            "sample_size": cross["sample_size"],
            "insight": insight,
        })

    # 按显著性排序
    results.sort(key=lambda x: (not x["is_significant"], x["p_value"]))
    return results


def main():
    import argparse
    ap = argparse.ArgumentParser(description='通用问卷分析引擎')
    ap.add_argument('input_file', nargs='?', help='输入 CSV/Excel 文件')
    ap.add_argument('output_dir', nargs='?', help='输出目录')
    ap.add_argument('--llm-map', help='LLM 结构分类 JSON（文件路径或 JSON 字符串）')
    ap.add_argument('--dataset-name', help='数据集展示名称（覆盖文件 stem）')
    ap.add_argument('--cross-analysis', action='store_true', help='启用 LLM-guided 交叉分析（模式2/3）')
    args = ap.parse_args()

    if not args.input_file:
        print("Usage: python3 analyze_generic.py <input_file> [output_dir] [--llm-map <json>]")
        sys.exit(1)

    try:
        input_path = validate_path(args.input_file, must_exist=True)
        output_dir = validate_path(args.output_dir) if args.output_dir else input_path.parent
        llm_map_path = validate_path(args.llm_map, must_exist=True) if args.llm_map else None
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    infile = input_path
    outdir = output_dir
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
    text_likert_maps = {}
    for header in headers:
        qtype, text_map = detect_question_type(header, col_values[header])
        col_types[header] = qtype
        if text_map is not None:
            text_likert_maps[header] = text_map

    # === LLM 结构校正 ===
    llm_value_maps = {}
    llm_reason_map = {}
    llm_override_log = []
    if args.llm_map:
        progress("正在应用 LLM 结构校正...")
        llm_type_map, llm_value_maps, llm_reason_map = load_llm_map(args.llm_map)
        col_types, llm_override_log = apply_llm_overrides(col_types, llm_type_map, headers, col_values)

    # 合并规则引擎检测到的文本 Likert value_map（LLM 优先）
    for h, vm in text_likert_maps.items():
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

    # === 交叉分析（LLM-guided，仅模式2/3启用）===
    if args.cross_analysis:
        progress("正在进行交叉分析...")
        cross_results = run_llm_guided_cross_analysis(
            rows, headers, col_types, demographics, usages, likert_scales
        )
        if cross_results:
            output["cross_analysis"] = cross_results
            progress(f"交叉分析完成: {len(cross_results)} 个有价值的发现")

    # 数据质量指标
    progress("正在计算数据质量指标...")
    quality_metrics = compute_quality_metrics(rows, headers, col_types, multi_select_groups)
    output["quality_metrics"] = quality_metrics

    # 结构识别元数据（可解释性）
    structure_meta = []
    for h in headers:
        qtype = col_types.get(h, 'unknown')
        if qtype in ('skip', 'multi_select_column'):
            continue
        values = col_values[h]
        non_empty = [v for v in values if str(v).strip()]
        unique = sorted(set(non_empty))[:5]
        meta = {
            "column": h,
            "detected_type": qtype,
            "sample_values": unique[:5],
            "unique_count": len(set(non_empty)),
            "non_empty_count": len(non_empty),
        }
        # 标记 LLM 覆盖的列
        for log in llm_override_log:
            if log["column"] == h:
                meta["llm_override"] = True
                meta["llm_reason"] = llm_reason_map.get(h, log["reason"])
                meta["rule_type"] = log["from"]
                break
        structure_meta.append(meta)

    # 为 multi_select_column 的 parent question 补充一行汇总
    for parent_label, columns in multi_select_groups.items():
        n = len(columns[0][1]) if columns else 0
        actual = 0
        for i in range(n):
            if any(str(columns[j][1][i]).strip() for j in range(len(columns))):
                actual += 1
        option_labels = [
            parse_single_choice_value(c[0].split(":", 1)[1].strip()) if ":" in c[0] else c[0]
            for c in columns[:5]
        ]
        structure_meta.append({
            "column": parent_label,
            "detected_type": "multi_select_columns",
            "sample_values": option_labels,
            "unique_count": len(columns),
            "non_empty_count": actual,
        })

    output["structure_meta"] = structure_meta

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
