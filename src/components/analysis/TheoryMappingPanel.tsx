"use client";

import { BookOpen, CheckCircle, XCircle, ArrowUpRight, MinusCircle, Lightbulb } from "lucide-react";

export interface TheoryMappingItem {
  theory: string;
  domain: string;
  relevance_score: number;
  alignment: "supported" | "contradicted" | "extended" | "neutral";
  evidence: Array<{ finding: string; source: string }>;
  gap_note?: string;
  contribution?: string;
}

export interface DetectedDomain {
  domain: string;
  confidence: number;
  reason?: string;
}

export interface TheoryMappingData {
  detected_domains: DetectedDomain[];
  primary_domain: string;
  mappings: TheoryMappingItem[];
  top_theories: string[];
  novel_finding?: string;
}

const ALIGNMENT_CONFIG = {
  supported: { label: "支持", color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", icon: CheckCircle },
  contradicted: { label: "反驳", color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", icon: XCircle },
  extended: { label: "扩展", color: "text-purple-700 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", icon: ArrowUpRight },
  neutral: { label: "中性", color: "text-gray-700 dark:text-gray-400", bg: "bg-gray-50 dark:bg-gray-800/50", border: "border-gray-200 dark:border-gray-700", icon: MinusCircle },
};

const DOMAIN_LABELS: Record<string, string> = {
  education_technology: "教育技术",
  education_psychology: "教育心理学",
  social_science: "社会科学",
  organizational_behavior: "组织行为",
  health_behavior: "健康行为",
  media_communication: "媒介传播",
};

export function TheoryMappingPanel({ data }: { data: TheoryMappingData | null }) {
  if (!data || !data.mappings?.length) {
    return (
      <div className="text-center py-12">
        <BookOpen className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">暂无理论映射数据</p>
      </div>
    );
  }

  const sortedMappings = [...data.mappings].sort((a, b) => b.relevance_score - a.relevance_score);
  const extendedMappings = sortedMappings.filter((m) => m.alignment === "extended");

  return (
    <div className="space-y-8">
      {/* Detected Domains */}
      <div className="flex flex-wrap gap-2">
        {data.detected_domains.map((d) => (
          <div
            key={d.domain}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800"
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            {DOMAIN_LABELS[d.domain] || d.domain}
            <span className="text-blue-400">({(d.confidence * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>

      {/* Theory Ranking */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">理论匹配度排行</h4>
        <div className="space-y-2">
          {sortedMappings.slice(0, 6).map((m) => {
            const config = ALIGNMENT_CONFIG[m.alignment] || ALIGNMENT_CONFIG.neutral;
            return (
              <div key={m.theory} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-32 truncate">{m.theory}</span>
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${m.alignment === "supported" ? "bg-green-400" : m.alignment === "contradicted" ? "bg-red-400" : m.alignment === "extended" ? "bg-purple-400" : "bg-gray-400"}`}
                    style={{ width: `${Math.max(m.relevance_score * 100, 5)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 w-10 text-right">{(m.relevance_score * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mapping Cards */}
      <div className="space-y-4">
        {sortedMappings.map((m) => {
          const config = ALIGNMENT_CONFIG[m.alignment] || ALIGNMENT_CONFIG.neutral;
          const Icon = config.icon;
          return (
            <div key={m.theory} className={`rounded-xl border p-5 ${config.bg} ${config.border}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{m.theory}</h4>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{DOMAIN_LABELS[m.domain] || m.domain}</span>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border ${config.bg} ${config.color} ${config.border}`}>
                  <Icon className="w-3 h-3" />
                  {config.label}
                </span>
              </div>

              {/* Evidence */}
              {m.evidence && m.evidence.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">证据</div>
                  <div className="space-y-1">
                    {m.evidence.map((e, idx) => (
                      <div key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                        <span className="text-gray-300 dark:text-gray-600 mt-0.5">·</span>
                        <span>{e.finding}</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">({e.source})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gap Note */}
              {m.gap_note && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 mb-2">
                  <span className="font-medium shrink-0">缺口:</span>
                  <span>{m.gap_note}</span>
                </div>
              )}

              {/* Contribution */}
              {m.contribution && (
                <div className="flex items-start gap-2 text-xs text-purple-700 dark:text-purple-400">
                  <span className="font-medium shrink-0">贡献:</span>
                  <span>{m.contribution}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Novel Finding */}
      {(extendedMappings.length > 0 || data.novel_finding) && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 rounded-xl border border-purple-100 dark:border-purple-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-purple-500" />
            <h4 className="text-sm font-bold text-purple-900 dark:text-purple-400">理论创新点</h4>
          </div>
          {data.novel_finding && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{data.novel_finding}</p>
          )}
          {extendedMappings.length > 0 && (
            <div className="space-y-2">
              {extendedMappings.slice(0, 3).map((m, idx) => (
                <div key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>
                  <span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{m.theory}</span>: {m.contribution}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
