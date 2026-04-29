// ============================================
// 问卷分析系统 — 核心类型定义
// ============================================

export type QuestionType = 'single_choice' | 'multiple_choice' | 'text' | 'rating' | 'matrix';

export type AnalysisMode = 'quick_overview' | 'ai_insights' | 'deep_research';
export const ANALYSIS_MODES: AnalysisMode[] = ['quick_overview', 'ai_insights', 'deep_research'];

// 后端分析任务状态（用于持久化）
export type AnalysisJobStatus = 'pending' | 'running' | 'completed' | 'failed';

// 人口学分布
export interface DistributionItem {
  label: string;
  count: number;
  /** 单选题使用 */
  percentage?: number;
  /** 多选题 — 占答卷人数的百分比 */
  percentage_in_respondents?: number;
  /** 多选题 — 占总记录的百分比 */
  percentage_in_total?: number;
}

export interface CategoricalResult {
  column: string;
  type?: string;
  total_valid?: number;
  total_respondents?: number;
  total_records: number;
  missing?: number;
  total_selections?: number;
  avg_selections_per_respondent?: number;
  distribution: DistributionItem[];
  merged_from?: string[];
}

// 描述性统计
export interface DescriptiveStats {
  column: string;
  group: string;
  n: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  distribution: Array<{ score: number; count: number; percentage: number }>;
}

// 文本分析
export interface SentimentDistribution {
  label: string;
  count: number;
  percentage: number;
}

export interface LengthDistribution {
  label: string;
  count: number;
  percentage: number;
}

export interface TextAnalysisResult {
  column: string;
  total_answers: number;
  avg_answer_length: number;
  total_words_extracted: number;
  unique_words: number;
  top_keywords: Array<{ word: string; count: number; rank: number }>;
  sentiment?: {
    avg_score: number;
    positive_ratio: number;
    neutral_ratio: number;
    negative_ratio: number;
    distribution: SentimentDistribution[];
    samples?: {
      positive: Array<{ text: string; score: number }>;
      neutral: Array<{ text: string; score: number }>;
      negative: Array<{ text: string; score: number }>;
    };
  };
  length_distribution?: {
    avg_length: number;
    short_count: number;
    short_ratio: number;
    medium_count: number;
    medium_ratio: number;
    long_count: number;
    long_ratio: number;
    very_long_count: number;
    very_long_ratio: number;
    distribution: LengthDistribution[];
  };
}

// 数据清洗信息
export interface CleaningStats {
  original_count: number;
  removed_empty: number;
  removed_duplicates: number;
  removed_low_quality: number;
  removed_skips?: number;
  final_count: number;
  retention_rate: number;
  examples?: {
    low_quality: Array<{
      missing_rate: number;
      non_empty_count: number;
      total_fields: number;
      filled_columns: string[];
    }>;
    duplicates: Array<{
      count: number;
      sample: string;
    }>;
  };
}

// 每题数据质量
export interface QuestionQuality {
  column: string;
  detected_type: string;
  total_records: number;
  missing: number;
  valid: number;
  missing_rate: number;
  valid_rate: number;
}

// 数据质量看板
export interface QualityMetrics {
  per_question: QuestionQuality[];
  overall_missing_avg: number;
  high_missing_count: number;
  extreme_missing_count: number;
}

// 分析结果
// 交叉分析
export interface CrosstabRow {
  label: string;
  total: number;
  values: Array<{ label: string; count: number; percentage: number }>;
}

export interface CrossAnalysisResult {
  title: string;
  description: string;
  var_a: { column: string; label: string };
  var_b: { column: string; label: string };
  crosstab: CrosstabRow[];
  chi2: number;
  p_value: number;
  cramers_v: number;
  is_significant: boolean;
  sample_size: number;
  insight: string;
}

// 结构识别元数据（可解释性）
export interface StructureMetaItem {
  column: string;
  detected_type: string;
  sample_values: string[];
  unique_count: number;
  non_empty_count: number;
  llm_override?: boolean;
  llm_reason?: string;
  rule_type?: string;
}

export interface QuickOverviewResult {
  dataset?: string;
  file?: string;
  total_records: number;
  total_fields: number;
  analysis_mode: string;
  cleaning?: CleaningStats;
  summary: {
    totalResponses: number;
    questionCount: number;
  };
  demographics: Record<string, CategoricalResult>;
  genai_usage?: Record<string, CategoricalResult>;
  likert_scales: Record<string, DescriptiveStats[]>;
  text_analysis: Record<string, TextAnalysisResult>;
  cross_analysis?: CrossAnalysisResult[];
  quality_metrics?: QualityMetrics;
  structure_meta?: StructureMetaItem[];
}
