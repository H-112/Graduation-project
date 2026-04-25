"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DATASETS } from "@/lib/data";
import { ArrowRight, Database, Loader2, AlertCircle, Clock, BarChart3, Sparkles, Search } from "lucide-react";

interface DynamicDataset {
  id: string;
  title: string;
  description: string;
  records: number;
  fields: number;
  source: string;
  resultUrl?: string;
  timestamp: string;
}

export default function DatasetsPage() {
  const [dynamicDatasets, setDynamicDatasets] = useState<DynamicDataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setDynamicDatasets(data.datasets || []);
      })
      .catch((e) => {
        console.error("Failed to load datasets:", e);
        // 不设置 error，静默失败，仍然展示静态数据集
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">数据集</h2>
        <p className="text-sm text-gray-500 mt-1">
          当前系统中已导入的问卷数据 · {DATASETS.length} 个预加载 + {dynamicDatasets.length} 个上传
        </p>
      </div>

      {/* 用户上传的数据集 */}
      {dynamicDatasets.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            最近上传与分析
          </h3>
          {dynamicDatasets.map((ds) => (
            <Link
              key={ds.id}
              href={ds.resultUrl ? `/datasets/uploaded?url=${encodeURIComponent(ds.resultUrl)}` : "#"}
              className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-blue-200 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">{ds.title}</h3>
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{ds.description}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full">
                      样本: {ds.records} 份
                    </span>
                    <span className="px-2 py-0.5 bg-gray-100 rounded-full">
                      字段: {ds.fields} 列
                    </span>
                    <span>{ds.source}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 预加载数据集 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Database className="w-4 h-4" />
          预加载数据集
        </h3>
        {DATASETS.map((ds) => (
          <Link
            key={ds.id}
            href={`/datasets/${ds.id}`}
            className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md hover:border-blue-200 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{ds.title}</h3>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 mt-1">{ds.description}</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                  <span className="px-2 py-0.5 bg-gray-100 rounded-full">
                    样本: {ds.records} 份
                  </span>
                  <span className="px-2 py-0.5 bg-gray-100 rounded-full">
                    字段: {ds.fields} 列
                  </span>
                  <span>来源: {ds.source}</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
