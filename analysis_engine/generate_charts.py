"""
可视化图表生成器
从分析结果 JSON 生成高质量图表
"""
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"
CHARTS_DIR = OUTPUT_DIR / "charts"
CHARTS_DIR.mkdir(parents=True, exist_ok=True)

# 尝试设置中文字体
for fname in ['PingFang SC', 'Heiti SC', 'STHeiti', 'SimHei', 'Arial Unicode MS']:
    try:
        fm.findfont(fname, fallback_to_default=False)
        plt.rcParams['font.sans-serif'] = [fname]
        print(f"Using font: {fname}")
        break
    except:
        continue
plt.rcParams['axes.unicode_minus'] = False

COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
          '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1']

def load_analysis(dataset_id):
    path = OUTPUT_DIR / f"dataset{dataset_id}_analysis.json"
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def chart_demographics(data, dataset_id):
    """人口学分布图"""
    dem = data.get('demographics', {})
    keys_to_chart = []
    for k, v in dem.items():
        if v and len(v.get('distribution', [])) > 1 and len(v['distribution']) <= 12:
            keys_to_chart.append(k)

    for key in keys_to_chart:
        d = dem[key]
        labels = [item['label'][:15] for item in d['distribution']]
        values = [item['count'] for item in d['distribution']]

        fig, ax = plt.subplots(figsize=(10, 5))
        bars = ax.barh(range(len(labels)), values, color=COLORS[:len(labels)])
        ax.set_yticks(range(len(labels)))
        ax.set_yticklabels(labels, fontsize=9)
        ax.set_xlabel('Count', fontsize=11)
        ax.set_title(d['column'], fontsize=13, fontweight='bold')
        ax.invert_yaxis()

        for i, (bar, val, pct) in enumerate(zip(bars, values,
            [item['percentage'] for item in d['distribution']])):
            ax.text(val + max(values)*0.01, bar.get_y() + bar.get_height()/2,
                    f'{val} ({pct}%)', va='center', fontsize=8)

        plt.tight_layout()
        safe_name = d['column'].replace('/', '_').replace(':', '_')[:50]
        path = CHARTS_DIR / f"d{dataset_id}_dem_{safe_name}.png"
        plt.savefig(path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close()
        print(f"  ✓ {path.name}")

def chart_likert_radar(data, dataset_id):
    """Likert量表雷达图"""
    likert = data.get('likert_scales', {})

    for group_name, items in likert.items():
        if not items or len(items) < 3:
            continue

        labels = []
        means = []
        for item in items:
            # 简化标签
            full = item['column']
            if '—' in full:
                label = full.split('—')[-1].strip()
            elif ':' in full:
                label = full.split(':')[-1].strip()
            else:
                label = full.strip()
            if len(label) > 12:
                label = label[:11] + '…'
            labels.append(label)
            means.append(item['mean'])

        n = len(labels)
        angles = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
        angles += angles[:1]
        means_plot = means + means[:1]
        labels_plot = labels + labels[:1]

        fig, ax = plt.subplots(figsize=(8, 8), subplot_kw=dict(polar=True))
        ax.fill(angles, means_plot, alpha=0.25, color=COLORS[0])
        ax.plot(angles, means_plot, 'o-', linewidth=2, color=COLORS[0])
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(labels, fontsize=8)
        ax.set_ylim(1, 5)
        ax.set_yticks([1, 2, 3, 4, 5])
        ax.set_yticklabels(['1', '2', '3', '4', '5'], fontsize=7)
        ax.set_title(items[0]['group'], fontsize=13, fontweight='bold', pad=20)

        plt.tight_layout()
        safe_name = items[0]['group'].replace('/', '_')[:40]
        path = CHARTS_DIR / f"d{dataset_id}_radar_{safe_name}.png"
        plt.savefig(path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close()
        print(f"  ✓ {path.name}")

def chart_likert_grouped_bar(data, dataset_id):
    """Likert量表分组柱状图"""
    likert = data.get('likert_scales', {})

    for group_name, items in likert.items():
        if not items or len(items) < 2:
            continue

        labels = []
        dist_matrix = {1:[], 2:[], 3:[], 4:[], 5:[]}

        for item in items:
            full = item['column']
            if '—' in full:
                label = full.split('—')[-1].strip()[:12]
            else:
                label = full.strip()[:12]
            labels.append(label)
            for score in range(1, 6):
                dist_matrix[score].append(
                    next((d['percentage'] for d in item['distribution']
                          if d['score'] == score), 0)
                )

        fig, ax = plt.subplots(figsize=(12, max(5, len(items)*0.6)))
        x = np.arange(len(labels))
        width = 0.15
        score_colors = {1: '#EF4444', 2: '#F97316', 3: '#F59E0B', 4: '#10B981', 5: '#3B82F6'}

        for offset, score in enumerate(range(1, 6)):
            bars = ax.barh(x + (offset - 2) * width, dist_matrix[score],
                          width, label=f'{score}分', color=score_colors[score], alpha=0.85)
            # 标注>20%的数值
            for bar, val in zip(bars, dist_matrix[score]):
                if val > 20:
                    ax.text(bar.get_x() + bar.get_width()/2, bar.get_y() + bar.get_height()/2,
                           f'{val:.0f}%', ha='center', va='center', fontsize=6, fontweight='bold')

        ax.set_yticks(x)
        ax.set_yticklabels(labels, fontsize=8)
        ax.set_xlabel('Percentage (%)', fontsize=10)
        ax.set_title(items[0]['group'], fontsize=12, fontweight='bold')
        ax.legend(loc='lower right', fontsize=7, ncol=5)
        ax.invert_yaxis()

        plt.tight_layout()
        safe_name = items[0]['group'].replace('/', '_')[:40]
        path = CHARTS_DIR / f"d{dataset_id}_likert_{safe_name}.png"
        plt.savefig(path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close()
        print(f"  ✓ {path.name}")

def chart_keywords(data, dataset_id):
    """关键词柱状图"""
    text_data = data.get('text_analysis', {})

    for key, ta in text_data.items():
        if not ta or 'top_keywords' not in ta or not ta['top_keywords']:
            continue

        keywords = ta['top_keywords'][:20]
        words = [k['word'] for k in keywords][::-1]
        counts = [k['count'] for k in keywords][::-1]

        fig, ax = plt.subplots(figsize=(10, 7))
        bar_colors = [COLORS[i % len(COLORS)] for i in range(len(words))]
        ax.barh(words, counts, color=bar_colors, alpha=0.85, height=0.7)

        for i, (w, c) in enumerate(zip(words, counts)):
            ax.text(c + max(counts)*0.01, i, str(c), va='center', fontsize=8)

        ax.set_xlabel('Frequency', fontsize=11)
        ax.set_title(ta.get('column', key)[:80], fontsize=12, fontweight='bold')
        plt.tight_layout()
        safe_name = ta.get('column', key).replace('/', '_').replace(':', '_')[:60]
        path = CHARTS_DIR / f"d{dataset_id}_kw_{safe_name}.png"
        plt.savefig(path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close()
        print(f"  ✓ {path.name}")

def chart_mean_comparison(data, dataset_id, group_name, title):
    """Likert均值对比图"""
    likert = data.get('likert_scales', {})
    if group_name not in likert:
        return

    items = likert[group_name]
    if not items:
        return

    labels = []
    means = []
    stds = []
    for item in items:
        full = item['column']
        if '—' in full:
            label = full.split('—')[-1].strip()
        elif ':' in full:
            label = full.split(':')[-1].strip()
        else:
            label = full.strip()
        if len(label) > 15:
            label = label[:14] + '…'
        labels.append(label)
        means.append(item['mean'])
        stds.append(item['std'])

    fig, ax = plt.subplots(figsize=(10, max(5, len(labels)*0.5)))
    y_pos = range(len(labels))
    colors_list = []
    for m in means:
        if m >= 4: colors_list.append('#10B981')
        elif m >= 3: colors_list.append('#F59E0B')
        else: colors_list.append('#EF4444')

    ax.barh(y_pos, means, xerr=stds, color=colors_list, alpha=0.85,
            capsize=3, error_kw={'linewidth': 1})
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, fontsize=9)
    ax.set_xlim(1, 5)
    ax.set_xlabel('Mean Score (1-5)', fontsize=11)
    ax.set_title(title, fontsize=13, fontweight='bold')
    ax.axvline(x=3, color='gray', linestyle='--', alpha=0.5)
    ax.invert_yaxis()

    for i, (m, sd) in enumerate(zip(means, stds)):
        ax.text(m + 0.05, i, f'{m:.2f}±{sd:.2f}', va='center', fontsize=8)

    plt.tight_layout()
    path = CHARTS_DIR / f"d{dataset_id}_comparison_{title[:30]}.png"
    plt.savefig(path, dpi=150, bbox_inches='tight', facecolor='white')
    plt.close()
    print(f"  ✓ {path.name}")

def main():
    print("=" * 60)
    print("图表生成器")
    print("=" * 60)

    for ds_id, title in [(5, '数据集#5: GenAI影响调查'),
                          (4, '数据集#4: 学习方式调查')]:
        print(f"\n{'='*40}")
        print(f"  {title}")
        print(f"{'='*40}")

        data = load_analysis(ds_id)

        print("  人口学分布图...")
        chart_demographics(data, ds_id)

        print("  Likert雷达图...")
        chart_likert_radar(data, ds_id)

        print("  Likert分组柱状图...")
        chart_likert_grouped_bar(data, ds_id)

        print("  关键词柱状图...")
        chart_keywords(data, ds_id)

        # 关键对比图
        print("  均值对比图...")
        if ds_id == 5:
            chart_mean_comparison(data, ds_id, 'genai_usage_style', 'GenAI使用方式评分')
            chart_mean_comparison(data, ds_id, 'current_course_learning', '当前课程学习情况')
        else:
            chart_mean_comparison(data, ds_id, 'genai_impact', 'GenAI对学习的影响评估')

    print(f"\n✓ 所有图表已生成到: {CHARTS_DIR}")

if __name__ == '__main__':
    main()
