"use client";

import { useMemo } from "react";
import {
  FileSpreadsheet,
  LayoutList,
  BarChart3,
  TrendingUp,
  Sparkles,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Lightbulb,
  Target,
  GitBranch,
  ShieldAlert,
} from "lucide-react";
import type { AnalysisMode, ProgressEntry, SkillLevels } from "@/components/analysis/AnalysisProvider";
import { InlineMarkdown } from "@/components/MarkdownRenderer";

interface PipelineStepDef {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface ParallelGroupDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  children: PipelineStepDef[];
}

type StepItem = PipelineStepDef | ParallelGroupDef;

const isParallelGroup = (item: StepItem): item is ParallelGroupDef =>
  "children" in item;

/** Skill name → Icon 映射（用于动态披露） */
const SKILL_ICONS: Record<string, React.ReactNode> = {
  FileLoading: <FileSpreadsheet className="w-4 h-4" />,
  LlmStructureAnalysis: <LayoutList className="w-4 h-4" />,
  DescriptiveAnalysis: <BarChart3 className="w-4 h-4" />,
  LlmLikertAnalysis: <TrendingUp className="w-4 h-4" />,
  LlmTextInsight: <Sparkles className="w-4 h-4" />,
  DeepResearch: <Search className="w-4 h-4" />,
  ActionableInsight: <Target className="w-3.5 h-3.5" />,
  CausalInferenceHint: <GitBranch className="w-3.5 h-3.5" />,
  ResearchGap: <Search className="w-3.5 h-3.5" />,
  SampleBiasAssessment: <ShieldAlert className="w-3.5 h-3.5" />,
  TheoryMapping: <Lightbulb className="w-3.5 h-3.5" />,
  NlpKeywordExtraction: <Sparkles className="w-4 h-4" />,
};

/** 将后端推送的 SkillLevels 转换为前端 StepItem[] */
function buildDynamicSteps(levels: SkillLevels): StepItem[] {
  const items: StepItem[] = [];
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    if (level.length === 1) {
      const s = level[0];
      items.push({
        id: s.name,
        label: s.displayName || s.name,
        icon: SKILL_ICONS[s.name] || <Circle className="w-4 h-4" />,
      });
    } else {
      // 并行组：使用同层第一个 skill 的 displayName 共性或通用标签
      items.push({
        id: `Parallel_${i}`,
        label: "并行任务组",
        icon: <Lightbulb className="w-4 h-4" />,
        children: level.map((s) => ({
          id: s.name,
          label: s.displayName || s.name,
          icon: SKILL_ICONS[s.name] || <Circle className="w-3.5 h-3.5" />,
        })),
      });
    }
  }
  return items;
}

const STEPS: Record<AnalysisMode, StepItem[]> = {
  quick_overview: [
    { id: "FileLoading", label: "加载数据文件", icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: "LlmStructureAnalysis", label: "识别问卷结构", icon: <LayoutList className="w-4 h-4" /> },
    { id: "DescriptiveAnalysis", label: "运行统计分析", icon: <BarChart3 className="w-4 h-4" /> },
  ],
  ai_insights: [
    { id: "FileLoading", label: "加载数据文件", icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: "LlmStructureAnalysis", label: "识别问卷结构", icon: <LayoutList className="w-4 h-4" /> },
    { id: "DescriptiveAnalysis", label: "运行统计分析", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "LlmLikertAnalysis", label: "量表深度解读 (LLM)", icon: <TrendingUp className="w-4 h-4" /> },
    { id: "LlmTextInsight", label: "文本洞察分析 (LLM)", icon: <Sparkles className="w-4 h-4" /> },
  ],
  deep_research: [
    { id: "FileLoading", label: "加载数据文件", icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: "LlmStructureAnalysis", label: "识别问卷结构", icon: <LayoutList className="w-4 h-4" /> },
    { id: "DescriptiveAnalysis", label: "运行统计分析", icon: <BarChart3 className="w-4 h-4" /> },
    { id: "LlmLikertAnalysis", label: "量表深度解读 (LLM)", icon: <TrendingUp className="w-4 h-4" /> },
    { id: "LlmTextInsight", label: "文本洞察分析 (LLM)", icon: <Sparkles className="w-4 h-4" /> },
    { id: "DeepResearch", label: "深度研究探索", icon: <Search className="w-4 h-4" /> },
    {
      id: "ParallelInsights",
      label: "扩展洞察",
      icon: <Lightbulb className="w-4 h-4" />,
      children: [
        { id: "ActionableInsight", label: "可操作建议", icon: <Target className="w-3.5 h-3.5" /> },
        { id: "CausalInferenceHint", label: "因果推断提示", icon: <GitBranch className="w-3.5 h-3.5" /> },
        { id: "ResearchGap", label: "研究缺口分析", icon: <Search className="w-3.5 h-3.5" /> },
        { id: "SampleBiasAssessment", label: "样本偏差诊断", icon: <ShieldAlert className="w-3.5 h-3.5" /> },
        { id: "TheoryMapping", label: "理论映射", icon: <Lightbulb className="w-3.5 h-3.5" /> },
      ],
    },
  ],
};

type StepStatus = "pending" | "running" | "completed" | "error";

const STATUS_PRIORITY: Record<StepStatus, number> = {
  error: 3,
  running: 2,
  completed: 1,
  pending: 0,
};

function getStepStatus(stepId: string, logMap: Map<string, ProgressEntry[]>, isAnalyzing: boolean): StepStatus {
  const relevant = logMap.get(stepId) || [];
  if (relevant.length === 0) return "pending";

  for (let i = relevant.length - 1; i >= 0; i--) {
    const t = relevant[i].text;
    if (t.startsWith(`[${stepId}] 完成`)) return "completed";
    if (t.startsWith(`[${stepId}] 错误`)) return "error";
  }

  const last = relevant[relevant.length - 1];
  if (isAnalyzing && (last.stage === stepId || last.text.startsWith(`[${stepId}]`))) {
    return "running";
  }

  return "completed";
}

function getParallelGroupStatus(
  children: PipelineStepDef[],
  logMap: Map<string, ProgressEntry[]>,
  isAnalyzing: boolean
): StepStatus {
  const statuses = children.map((c) => getStepStatus(c.id, logMap, isAnalyzing));
  // 取优先级最高的状态
  return statuses.reduce((acc, s) =>
    STATUS_PRIORITY[s] > STATUS_PRIORITY[acc] ? s : acc
  );
}

function getRunningMessage(stepId: string, logMap: Map<string, ProgressEntry[]>): string {
  const relevant = logMap.get(stepId) || [];
  const last = relevant[relevant.length - 1];
  if (!last) return "";
  // Strip the [SkillName] prefix
  return last.text.replace(new RegExp(`^\\[${stepId}\\]\\s*`), "").trim();
}

function getParallelGroupRunningMessage(
  children: PipelineStepDef[],
  logMap: Map<string, ProgressEntry[]>
): string {
  const runningChildren = children.filter(
    (c) => getStepStatus(c.id, logMap, true) === "running"
  );
  if (runningChildren.length === 0) return "";
  return `${runningChildren.length} 个任务并行运行中`;
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "error":
      return <XCircle className="w-5 h-5 text-red-500" />;
    case "running":
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    default:
      return <Circle className="w-5 h-5 text-gray-300 dark:text-gray-600" />;
  }
}

function ChildStatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    case "error":
      return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    case "running":
      return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />;
  }
}

export function AnalysisPipeline({
  mode,
  steps: dynamicSteps,
  logs,
  isAnalyzing,
  roundProgress,
}: {
  mode: AnalysisMode;
  steps?: SkillLevels;
  logs: ProgressEntry[];
  isAnalyzing: boolean;
  roundProgress?: { current: number; total: number; title: string } | null;
}) {
  const steps = dynamicSteps ? buildDynamicSteps(dynamicSteps) : (STEPS[mode] || []);

  // 预计算日志映射表：O(n) 一次构建，后续查询 O(1)
  const logMap = useMemo(() => {
    const map = new Map<string, ProgressEntry[]>();
    for (const log of logs) {
      const key = log.stage || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return map;
  }, [logs]);

  // Compute status for each step
  const stepStates = steps.map((step) => {
    if (isParallelGroup(step)) {
      return {
        ...step,
        status: getParallelGroupStatus(step.children, logMap, isAnalyzing),
        message: getParallelGroupRunningMessage(step.children, logMap),
      };
    }
    return {
      ...step,
      status: getStepStatus(step.id, logMap, isAnalyzing),
      message: getRunningMessage(step.id, logMap),
    };
  });

  // Overall progress percentage — 并行组算 1 个步骤权重
  const completedCount = stepStates.filter((s) => s.status === "completed").length;
  const hasError = stepStates.some((s) => s.status === "error");
  const progressPct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            分析流水线
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {hasError
              ? "执行出错"
              : completedCount === steps.length
              ? "全部完成"
              : `${completedCount}/${steps.length} 步骤`}
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              hasError ? "bg-red-500" : "bg-blue-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="px-5 py-4">
        <div className="space-y-0">
          {stepStates.map((step, idx) => {
            const isLast = idx === stepStates.length - 1;
            const isActive = step.status === "running";

            return (
              <div key={step.id} className="relative">
                {/* Connector line */}
                {!isLast && (
                  <div
                    className={`absolute left-[9px] top-[28px] w-0.5 h-[calc(100%-8px)] ${
                      step.status === "completed"
                        ? "bg-green-200 dark:bg-green-900/40"
                        : "bg-gray-100 dark:bg-gray-800"
                    }`}
                  />
                )}

                <div className="flex items-start gap-3 py-2">
                  {/* Status icon */}
                  <div className="relative shrink-0 mt-0.5">
                    <StatusIcon status={step.status} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${
                          step.status === "running"
                            ? "text-blue-700 dark:text-blue-400"
                            : step.status === "completed"
                            ? "text-gray-700 dark:text-gray-300"
                            : step.status === "error"
                            ? "text-red-700 dark:text-red-400"
                            : "text-gray-400 dark:text-gray-500"
                        }`}
                      >
                        {step.label}
                      </span>
                      {step.status === "running" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-medium">
                          进行中
                        </span>
                      )}
                      {isParallelGroup(step) && step.status === "running" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400 font-medium">
                          并行
                        </span>
                      )}
                    </div>

                    {/* Running detail message */}
                    {isActive && step.message && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        <InlineMarkdown text={step.message} />
                      </p>
                    )}

                    {/* Deep Research round progress */}
                    {step.id === "DeepResearch" && isActive && roundProgress && (
                      <div className="mt-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          {Array.from({ length: roundProgress.total }, (_, i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-all ${
                                i < roundProgress.current
                                  ? "bg-amber-400"
                                  : i === roundProgress.current - 1
                                  ? "bg-amber-400 animate-pulse"
                                  : "bg-gray-200 dark:bg-gray-700"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                          第 {roundProgress.current}/{roundProgress.total} 轮 · {roundProgress.title}
                        </p>
                      </div>
                    )}

                    {/* Parallel group children */}
                    {isParallelGroup(step) && (
                      <div className="mt-2 space-y-1.5">
                        {step.children.map((child) => {
                          const childStatus = getStepStatus(child.id, logMap, isAnalyzing);
                          return (
                            <div
                              key={child.id}
                              className={`flex items-center gap-2 px-2 py-1 rounded-lg ${
                                childStatus === "running"
                                  ? "bg-blue-50/50 dark:bg-blue-950/20"
                                  : childStatus === "completed"
                                  ? "bg-green-50/50 dark:bg-green-950/20"
                                  : childStatus === "error"
                                  ? "bg-red-50/50 dark:bg-red-950/20"
                                  : "bg-gray-50/50 dark:bg-gray-800/30"
                              }`}
                            >
                              <ChildStatusIcon status={childStatus} />
                              <span
                                className={`text-xs ${
                                  childStatus === "running"
                                    ? "text-blue-700 dark:text-blue-400"
                                    : childStatus === "completed"
                                    ? "text-gray-600 dark:text-gray-400"
                                    : childStatus === "error"
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-gray-400 dark:text-gray-500"
                                }`}
                              >
                                {child.label}
                              </span>
                              {childStatus === "running" && (
                                <span className="text-[10px] text-blue-500 dark:text-blue-400">
                                  运行中
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
