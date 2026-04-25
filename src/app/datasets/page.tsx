import Link from "next/link";
import { DATASETS } from "@/lib/data";
import { ArrowRight, Database } from "lucide-react";

export default function DatasetsPage() {
  return (
    <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">数据集</h2>
        <p className="text-sm text-gray-500 mt-1">当前系统中已导入的问卷数据</p>
      </div>

      <div className="space-y-3">
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
                  <span className="px-2 py-0.5 bg-gray-100 rounded-full">样本: {ds.records} 份</span>
                  <span className="px-2 py-0.5 bg-gray-100 rounded-full">字段: {ds.fields} 列</span>
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
