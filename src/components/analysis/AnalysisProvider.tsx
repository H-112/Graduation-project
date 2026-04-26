"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

export type AnalysisMode = "quick_overview" | "ai_insights" | "deep_research";

export type AnalysisStatus =
  | "idle"
  | "uploading"
  | "analyzing"
  | "done"
  | "error";

export interface ProgressEntry {
  text: string;
  stage: string;
  timestamp: number;
}

export type SkillLevelStep = {
  name: string;
  displayName?: string;
  description: string;
};

export type SkillLevels = SkillLevelStep[][];

export interface AnalysisResult {
  id?: string;
  resultUrl: string;
  mode: string;
  summary: {
    records: number;
    fields: number;
    demographics: number;
    usageItems: number;
    likertGroups: number;
    textFields: number;
  };
  llmReports?: { file: string; url: string }[];
  likertReports?: { file: string; url: string }[];
  deepResearchReport?: string;
  theoryMapping?: string;
  actionableInsights?: string;
  researchGaps?: string;
  causalHints?: string;
  sampleBias?: string;
  tokenUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AnalysisJob {
  id: string;
  filePath: string;
  mode: AnalysisMode;
  datasetName: string;
  status: AnalysisStatus;
  progressLog: ProgressEntry[];
  roundProgress: { current: number; total: number; title: string } | null;
  skillSteps: SkillLevels | null;
  result: AnalysisResult | null;
  error: string;
  errorDetail: string;
  createdAt: number;
}

interface AnalysisContextValue {
  activeJob: AnalysisJob | null;
  startAnalysis: (
    filePath: string,
    mode: AnalysisMode,
    datasetName: string
  ) => void;
  dismissJob: () => void;
}

const AnalysisContext = createContext<AnalysisContextValue | undefined>(
  undefined
);

function createJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [activeJob, setActiveJob] = useState<AnalysisJob | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const dismissJob = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setActiveJob(null);
  }, []);

  const startAnalysis = useCallback(
    (filePath: string, mode: AnalysisMode, datasetName: string) => {
      // 如果已有正在运行的分析，先 abort 掉（防止同时跑多个）
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const job: AnalysisJob = {
        id: createJobId(),
        filePath,
        mode,
        datasetName,
        status: "analyzing",
        progressLog: [],
        roundProgress: null,
        skillSteps: null,
        result: null,
        error: "",
        errorDetail: "",
        createdAt: Date.now(),
      };
      setActiveJob(job);

      const controller = new AbortController();
      abortRef.current = controller;

      fetch("/api/analysis/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, mode, datasetName }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            setActiveJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: "error",
                    error: `请求失败 (HTTP ${response.status})`,
                  }
                : prev
            );
            return;
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const messages = buffer.split("\n\n");
              buffer = messages.pop() || "";

              for (const msg of messages) {
                const lines = msg.split("\n");
                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  try {
                    const event = JSON.parse(line.slice(6));
                    handleSSEEvent(event, mode);
                  } catch {
                    // Skip malformed JSON
                  }
                }
              }
            }

            if (buffer.trim()) {
              for (const line of buffer.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const event = JSON.parse(line.slice(6));
                  handleSSEEvent(event, mode);
                } catch {
                  /* skip */
                }
              }
            }
          } catch (err) {
            if ((err as Error).name === "AbortError") return;
            setActiveJob((prev) =>
              prev
                ? {
                    ...prev,
                    status: "error",
                    error: "读取分析流失败",
                    errorDetail:
                      err instanceof Error ? err.message : String(err),
                  }
                : prev
            );
          }
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setActiveJob((prev) =>
            prev
              ? {
                  ...prev,
                  status: "error",
                  error: "分析请求失败，网络错误",
                  errorDetail: err instanceof Error ? err.message : String(err),
                }
              : prev
          );
        });
    },
    []
  );

  const handleSSEEvent = (
    event: Record<string, unknown>,
    mode: AnalysisMode
  ) => {
    switch (event.type) {
      case "skills": {
        setActiveJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            skillSteps: (event.levels as SkillLevels) || null,
          };
        });
        break;
      }

      case "progress": {
        const msg = event.message as string;
        let roundProgress: AnalysisJob["roundProgress"] = null;
        const roundMatch = msg.match(/Round\s+(\d)\/(\d)[\s:：]+(.+)/);
        if (roundMatch && mode === "deep_research") {
          roundProgress = {
            current: parseInt(roundMatch[1], 10),
            total: parseInt(roundMatch[2], 10),
            title: roundMatch[3].trim(),
          };
        }
        setActiveJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            progressLog: [
              ...prev.progressLog,
              {
                text: msg,
                stage: (event.stage as string) || "progress",
                timestamp: Date.now(),
              },
            ],
            roundProgress: roundProgress ?? prev.roundProgress,
          };
        });
        break;
      }

      case "log": {
        setActiveJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            progressLog: [
              ...prev.progressLog,
              {
                text: event.message as string,
                stage:
                  (event.level as string) === "stderr" ? "stderr" : "log",
                timestamp: Date.now(),
              },
            ],
          };
        });
        break;
      }

      case "result": {
        setActiveJob((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: "done",
            result: {
              id: event.id as string | undefined,
              resultUrl: event.resultUrl as string,
              mode: event.mode as string,
              summary: event.summary as AnalysisResult["summary"],
              llmReports: event.llmReports as AnalysisResult["llmReports"],
              likertReports: event.likertReports as AnalysisResult["likertReports"],
              deepResearchReport: event.deepResearchReport as string | undefined,
              theoryMapping: event.theoryMapping as string | undefined,
              actionableInsights: event.actionableInsights as string | undefined,
              researchGaps: event.researchGaps as string | undefined,
              causalHints: event.causalHints as string | undefined,
              sampleBias: event.sampleBias as string | undefined,
              tokenUsage: event.tokenUsage as AnalysisResult["tokenUsage"],
            },
          };
        });
        break;
      }

      case "error": {
        const errMsg = (event.error as string) || "分析失败";
        const errDetail = (event.detail as string) || "";
        setActiveJob((prev) => {
          if (!prev) return prev;
          const updated: AnalysisJob = {
            ...prev,
            status: "error",
            error: errMsg,
            errorDetail: errDetail,
          };
          if (event.fallbackResult) {
            const fb = event.fallbackResult as Record<string, unknown>;
            updated.result = {
              id: fb.id as string | undefined,
              resultUrl: fb.resultUrl as string,
              mode: fb.mode as string,
              summary: {} as AnalysisResult["summary"],
              llmReports: fb.llmReports as AnalysisResult["llmReports"],
              likertReports: fb.likertReports as AnalysisResult["likertReports"],
              deepResearchReport: fb.deepResearchReport as string | undefined,
              theoryMapping: fb.theoryMapping as string | undefined,
              actionableInsights: fb.actionableInsights as string | undefined,
              researchGaps: fb.researchGaps as string | undefined,
              causalHints: fb.causalHints as string | undefined,
              sampleBias: fb.sampleBias as string | undefined,
            };
          }
          return updated;
        });
        break;
      }

      case "done":
        break;
    }
  };

  return (
    <AnalysisContext.Provider value={{ activeJob, startAnalysis, dismissJob }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext);
  if (!ctx) {
    throw new Error("useAnalysis must be used within AnalysisProvider");
  }
  return ctx;
}
