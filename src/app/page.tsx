import Link from "next/link";
import { DATASETS } from "@/lib/data";
import { ArrowRight, BarChart3, Clock, Sparkles, Brain } from "lucide-react";

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
      {/* Hero */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 rounded-2xl p-8 text-white">
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-8 h-8" />
          <h2 className="text-2xl font-bold">智能体辅助问卷分析系统</h2>
        </div>
        <p className="text-blue-100 text-sm max-w-2xl leading-relaxed">
          基于大语言模型的渐进式问卷分析平台。支持三种分析深度：
          从秒级描述性统计，到分钟级AI洞察，再到深度自主调研，逐层递进。
        </p>
      </div>

      {/* Analysis Modes */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">三种分析模式</h3>
        <div className="grid grid-cols-3 gap-4">
          <ModeCard
            icon={BarChart3}
            title="模式1 · 快速概览"
            time="15-30秒"
            color="blue"
            features={["描述性统计", "频数分析", "关键词提取", "基础图表"]}
            note="纯本地计算，不调用LLM"
          />
          <ModeCard
            icon={Sparkles}
            title="模式2 · AI 洞察"
            time="1-2分钟"
            color="purple"
            features={["模式1所有能力", "LLM情感分析", "主题聚类", "AI洞察生成"]}
            note="引入 DeepSeek 大模型"
          />
          <ModeCard
            icon={Brain}
            title="模式3 · 深度调研"
            time="2-5分钟"
            color="amber"
            features={["模式2所有能力", "五轮探索循环", "统计推断+关联挖掘", "完整研究报告"]}
            note="自主Agent多轮假设验证"
          />
        </div>
      </div>

      {/* Datasets */}
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-4">已有分析数据</h3>
        <div className="grid grid-cols-2 gap-4">
          {DATASETS.map((ds) => (
            <Link
              key={ds.id}
              href={`/datasets/${ds.id}`}
              className="group bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg hover:border-blue-200 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                  {ds.title}
                </h4>
                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" />
              </div>
              <p className="text-sm text-gray-500 mb-3 line-clamp-2">{ds.description}</p>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>样本: {ds.records} 份</span>
                <span>字段: {ds.fields} 列</span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{ds.source}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  icon: Icon,
  title,
  time,
  color,
  features,
  note,
  disabled = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  time: string;
  color: string;
  features: string[];
  note: string;
  disabled?: boolean;
}) {
  const colors: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50/50",
    purple: "border-purple-200 bg-purple-50/50",
    amber: "border-amber-200 bg-amber-50/50",
  };
  const iconColors: Record<string, string> = {
    blue: "text-blue-600 bg-blue-100",
    purple: "text-purple-600 bg-purple-100",
    amber: "text-amber-600 bg-amber-100",
  };

  return (
    <div className={`rounded-xl border p-5 ${colors[color]} ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconColors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h4 className="font-semibold text-sm text-gray-900">{title}</h4>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="w-3 h-3" />
            {time}
          </div>
        </div>
      </div>
      <ul className="space-y-1 mb-3">
        {features.map((f) => (
          <li key={f} className="text-xs text-gray-600 flex items-center gap-1.5">
            <span className={`w-1 h-1 rounded-full ${disabled ? "bg-gray-300" : "bg-green-400"}`} />
            {f}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-gray-400 italic">{note}</p>
    </div>
  );
}
