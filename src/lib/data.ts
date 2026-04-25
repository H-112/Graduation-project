// ============================================
// 数据加载层 — 从预计算 JSON 或动态 URL 加载分析结果
// ============================================

import type { QuickOverviewResult } from './types';

export interface DatasetMeta {
  id: string;
  title: string;
  description: string;
  file: string;
  records: number;
  fields: number;
  source: string;
  /** 是否是预加载的静态数据集 */
  preloaded: boolean;
}

export const DATASETS: DatasetMeta[] = [
  {
    id: '5',
    title: '生成式AI对大学生影响的调查',
    description: '2246份 · GenAI使用行为、课程学习/科研/生活三维度现状与变化评估',
    file: 'dataset5_analysis.json',
    records: 2246,
    fields: 75,
    source: '问卷星 295603991',
    preloaded: true,
  },
  {
    id: '4',
    title: '生成式AI对大学生学习方式的影响',
    description: '915份 · GenAI在课堂、作业、科研、论文四大场景的使用深度分析',
    file: 'dataset4_analysis.json',
    records: 915,
    fields: 91,
    source: '问卷星 265987486',
    preloaded: true,
  },
  {
    id: 'bus1',
    title: '校园巴士服务调查 (2025春)',
    description: '695份 · 校巴乘坐频率、满意度、调整方案评价',
    file: '23072848_202604241744528431_analysis.json',
    records: 695,
    fields: 149,
    source: '问卷星 23072848',
    preloaded: true,
  },
  {
    id: 'bus2',
    title: '校园巴士服务调查 (方案调整)',
    description: '555份 · 校巴调整后评价、电瓶车服务、收费意愿',
    file: '23072874_202604241746012871_analysis.json',
    records: 555,
    fields: 187,
    source: '问卷星 23072874',
    preloaded: true,
  },
  {
    id: 'focus',
    title: '课堂专注力调查',
    description: '39份 · 学生课堂专注状态、教师行为影响、分心因素',
    file: '25162701_202604242312269507_analysis.json',
    records: 39,
    fields: 25,
    source: '问卷星 25162701',
    preloaded: true,
  },
  {
    id: 'plugin',
    title: '智能学习IDE插件需求调查',
    description: '63份 · 编程学习痛点、AI辅助功能需求评分',
    file: '304937068_按文本_智能学习插件需求调查_63_63_analysis.json',
    records: 63,
    fields: 26,
    source: '问卷星 304937068',
    preloaded: true,
  },
  {
    id: 'deco',
    title: 'Deco Lounge留学群聊需求调查',
    description: '79份 · 留学意向、经验分享意愿、群聊功能需求',
    file: '307505746_按文本_Deco Lounge 需求调查_79_79_analysis.json',
    records: 79,
    fields: 31,
    source: '问卷星 307505746',
    preloaded: true,
  },
];

export async function loadAnalysisData(datasetId: string): Promise<QuickOverviewResult> {
  const ds = DATASETS.find(d => d.id === datasetId);
  if (!ds) throw new Error(`Dataset ${datasetId} not found`);

  const basePath = ds.preloaded ? `/data/` : `/data/results/`;
  const res = await fetch(`${basePath}${ds.file}`);
  if (!res.ok) throw new Error(`Failed to load ${ds.file}`);
  const raw = await res.json();

  return raw as QuickOverviewResult;
}

export function getDatasetMeta(datasetId: string): DatasetMeta | undefined {
  return DATASETS.find(d => d.id === datasetId);
}
