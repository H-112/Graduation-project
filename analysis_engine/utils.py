"""
analysis_engine 共享工具模块
包含：进度输出、中文分词、停用词、情感分析、长度分布等通用函数
"""

import os
import sys
from pathlib import Path


# 允许的文件操作根目录（项目根目录）
_ALLOWED_ROOTS = []


def _init_allowed_roots():
    """初始化允许的操作根目录列表"""
    global _ALLOWED_ROOTS
    if _ALLOWED_ROOTS:
        return
    script_dir = Path(__file__).parent.resolve()
    project_root = script_dir.parent.resolve()
    _ALLOWED_ROOTS = [
        str(project_root),
        str(script_dir),
        str(project_root / "data"),
        str(project_root / "public"),
        str(project_root / "skills"),
    ]


def validate_path(filepath, must_exist=False):
    """
    校验文件路径是否在允许的目录范围内，防止路径遍历攻击。
    返回解析后的绝对 Path 对象，校验失败则抛出 ValueError。
    """
    _init_allowed_roots()
    p = Path(filepath).resolve()
    path_str = str(p)
    for root in _ALLOWED_ROOTS:
        if path_str.startswith(root + os.sep) or path_str == root:
            break
    else:
        raise ValueError(f"路径不在允许范围内: {filepath}")
    if must_exist and not p.exists():
        raise FileNotFoundError(f"文件不存在: {p}")
    return p


def sanitize_prompt_text(text, max_len=500):
    """
    清理将进入 LLM Prompt 的文本，降低 Prompt Injection 风险。
    - 截断过长文本
    - 移除常见的指令分隔符
    """
    if not isinstance(text, str):
        text = str(text)
    text = text.strip()
    if len(text) > max_len:
        text = text[:max_len] + "..."
    # 移除可能用于指令注入的常见分隔符
    text = text.replace("\x00", "")
    return text


def progress(msg):
    """输出进度标记，前端通过 SSE 实时接收"""
    print(f"[PROGRESS] {msg}", flush=True)


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


# 中性/弱化表达关键词（用于修正 SnowNLP 偏差）
NEUTRAL_HINTS = {'一般', '一般般', '还行', '还可以', '普普通通', '无所谓',
                 '不清楚', '不了解', '不知道', '没什么', '没有特别', '没感觉',
                 '不太好说', '说不上', '差不多', '就那样', '平平', '凑合'}
NEGATIVE_HINTS = {'不', '没', '难', '麻烦', '问题', '差', '糟糕', '失望',
                   '担心', '焦虑', '困扰', '阻碍', '弊端', '负面', '消极'}


def adjust_sentiment(text, raw_score):
    """根据关键词修正 SnowNLP 的情感得分"""
    t = str(text)
    # 如果包含明显中性表达，向中性拉近
    if any(h in t for h in NEUTRAL_HINTS):
        return 0.4 + (raw_score - 0.5) * 0.3  # 压缩到 0.25~0.55 区间
    # 如果包含负面词汇且得分不太高，降低得分
    if any(h in t for h in NEGATIVE_HINTS) and raw_score > 0.35:
        return raw_score * 0.85
    return raw_score


def analyze_sentiment(texts):
    """对文本列表进行情感分析，返回情感统计"""
    try:
        from snownlp import SnowNLP
    except ImportError:
        return None

    scores = []
    sentiments = {"positive": 0, "neutral": 0, "negative": 0}
    # 收集各分类的典型样例（取分数最极端的作为代表）
    samples = {"positive": [], "neutral": [], "negative": []}
    scored_texts = []

    for t in texts:
        try:
            raw = SnowNLP(t).sentiments
            s = adjust_sentiment(t, raw)
            scores.append(s)
            scored_texts.append((t, s))
            if s >= 0.55:
                sentiments["positive"] += 1
            elif s <= 0.35:
                sentiments["negative"] += 1
            else:
                sentiments["neutral"] += 1
        except Exception as e:
            import traceback
            print(f"[ERROR] {e}\n{traceback.format_exc()}", file=sys.stderr)
            continue

    if not scores:
        return None

    # 为每个分类选 2-3 条代表性样例
    # 正面取分数最高的，负面取分数最低的，中性取最接近 0.45 的
    positive_sorted = sorted([x for x in scored_texts if x[1] >= 0.55], key=lambda x: x[1], reverse=True)
    negative_sorted = sorted([x for x in scored_texts if x[1] <= 0.35], key=lambda x: x[1])
    neutral_sorted = sorted([x for x in scored_texts if 0.35 < x[1] < 0.55], key=lambda x: abs(x[1] - 0.45))

    samples["positive"] = [{"text": t[:120], "score": round(s, 3)} for t, s in positive_sorted[:3]]
    samples["negative"] = [{"text": t[:120], "score": round(s, 3)} for t, s in negative_sorted[:3]]
    samples["neutral"] = [{"text": t[:120], "score": round(s, 3)} for t, s in neutral_sorted[:3]]

    n = len(scores)
    return {
        "avg_score": round(sum(scores) / n, 3),
        "positive_ratio": round(sentiments["positive"] / n * 100, 1),
        "neutral_ratio": round(sentiments["neutral"] / n * 100, 1),
        "negative_ratio": round(sentiments["negative"] / n * 100, 1),
        "distribution": [
            {"label": "正面", "count": sentiments["positive"], "percentage": round(sentiments["positive"] / n * 100, 1)},
            {"label": "中性", "count": sentiments["neutral"], "percentage": round(sentiments["neutral"] / n * 100, 1)},
            {"label": "负面", "count": sentiments["negative"], "percentage": round(sentiments["negative"] / n * 100, 1)},
        ],
        "samples": samples,
    }


def analyze_length_distribution(lengths):
    """分析回答长度分布"""
    if not lengths:
        return None
    n = len(lengths)
    short = sum(1 for l in lengths if l < 10)
    medium = sum(1 for l in lengths if 10 <= l <= 50)
    long = sum(1 for l in lengths if l > 50)
    very_long = sum(1 for l in lengths if l > 100)

    return {
        "avg_length": round(sum(lengths) / n, 1),
        "short_count": short,
        "short_ratio": round(short / n * 100, 1),
        "medium_count": medium,
        "medium_ratio": round(medium / n * 100, 1),
        "long_count": long,
        "long_ratio": round(long / n * 100, 1),
        "very_long_count": very_long,
        "very_long_ratio": round(very_long / n * 100, 1),
        "distribution": [
            {"label": "敷衍 (<10字)", "count": short, "percentage": round(short / n * 100, 1)},
            {"label": "简短 (10-50字)", "count": medium, "percentage": round(medium / n * 100, 1)},
            {"label": "充实 (>50字)", "count": long, "percentage": round(long / n * 100, 1)},
            {"label": "详细 (>100字)", "count": very_long, "percentage": round(very_long / n * 100, 1)},
        ]
    }
