// ============================================
// 问卷分析系统 — 核心类型定义
// ============================================

export type QuestionType = 'single_choice' | 'multiple_choice' | 'text' | 'rating' | 'matrix';

export type AnalysisMode = 'quick_overview' | 'ai_insights' | 'deep_research';
export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed';

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
}

// 频数分析
export interface FrequencyResult {
  questionId: string;
  questionTitle: string;
  options: Array<{ label: string; count: number; percentage: number }>;
  totalResponses: number;
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
export interface TextAnalysisResult {
  column: string;
  total_answers: number;
  avg_answer_length: number;
  total_words_extracted: number;
  unique_words: number;
  top_keywords: Array<{ word: string; count: number; rank: number }>;
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
}

// 分析结果
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
}

export interface AnalysisTask {
  id: string;
  questionnaireId: string;
  mode: AnalysisMode;
  status: AnalysisStatus;
  progress: number;
  result: QuickOverviewResult | null;
  duration_ms: number | null;
  created_at: string;
}
