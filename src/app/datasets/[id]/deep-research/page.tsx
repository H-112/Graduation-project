"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AcademicMarkdown } from "@/components/analysis/AcademicMarkdown";
import { Loader2, ArrowLeft, Printer, List } from "lucide-react";

interface TocItem {
  id: string;
  label: string;
  level: number;
}

export default function DeepResearchPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [content, setContent] = useState("");
  const [title, setTitle] = useState("深度研究报告");
  const [datasetName, setDatasetName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 加载 Markdown 内容
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const controller = new AbortController();

    async function load() {
      try {
        // 1. 获取 history record
        const historyRes = await fetch(`/api/history/${id}`, {
          signal: controller.signal,
        });
        const record = historyRes.ok ? await historyRes.json() : null;

        if (record?.datasetName) {
          setDatasetName(record.datasetName);
        }

        // 2. 获取 deepReportUrl
        let url = record?.deepReportUrl || "";

        // 3. 兜底：根据 resultUrl 推算
        if (!url && record?.resultUrl) {
          const match = record.resultUrl.match(/\/(\w+)_analysis\.json$/);
          if (match) {
            url = `/data/results/${match[1]}_deep_research.md`;
          }
        }

        if (!url) {
          setError("未找到深度研究报告");
          setLoading(false);
          return;
        }

        // 4. fetch Markdown
        const mdRes = await fetch(url, { signal: controller.signal });
        if (!mdRes.ok) {
          setError(`加载失败: ${mdRes.status}`);
          setLoading(false);
          return;
        }

        const text = await mdRes.text();
        setContent(text);

        // 提取标题（第一个 # 行）
        const titleMatch = text.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          setTitle(titleMatch[1]);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError("加载出错");
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [id]);

  // 解析目录
  const tocItems = useMemo(() => {
    const items: TocItem[] = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^(#{2,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const id = text
          .toLowerCase()
          .replace(/[^\w\s\u4e00-\u9fa5]/g, "")
          .replace(/\s+/g, "-")
          .substring(0, 50);
        items.push({ id, label: text, level });
      }
    }
    return items;
  }, [content]);

  // IntersectionObserver 监听章节滚动
  useEffect(() => {
    if (tocItems.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          const topmost = intersecting.reduce((best, cur) =>
            cur.boundingClientRect.top < best.boundingClientRect.top ? cur : best
          );
          setActiveId(topmost.target.id);
        }
      },
      { rootMargin: "-100px 0px -80% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    for (const item of tocItems) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [tocItems]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
      setMobileMenuOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
          <p className="text-gray-600 dark:text-gray-400">加载深度研究报告...🫠</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md mx-auto px-4">
          <p className="text-red-600 dark:text-red-400 mb-4">{error} 😅</p>
          <Link
            href={`/datasets/${id}`}
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
          >
            ← 返回报告概览
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/datasets/${id}`}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </Link>
            <div className="hidden sm:block">
              <h1 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[300px] lg:max-w-[500px]">
                {datasetName || title}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">深度研究报告</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 移动端目录按钮 */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <List className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>

            {/* 打印按钮 */}
            <button
              onClick={() => window.print()}
              className="no-print inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">导出 PDF</span>
            </button>
          </div>
        </div>

        {/* 移动端目录下拉 */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 max-h-[60vh] overflow-y-auto">
            <nav className="px-4 py-3">
              {tocItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full text-left py-2 text-sm transition-colors ${
                    item.level === 3 ? "pl-4" : ""
                  } ${
                    activeId === item.id
                      ? "text-blue-600 dark:text-blue-400 font-medium"
                      : "text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* 主体内容 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* 左侧目录 - 桌面端 */}
          {tocItems.length > 0 && (
            <aside className="hidden lg:block w-64 shrink-0">
              <div className="sticky top-24">
                <div className="flex items-center gap-2 mb-4">
                  <List className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    目录
                  </span>
                </div>
                <nav className="space-y-1">
                  {tocItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => scrollToSection(item.id)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                        item.level === 3 ? "pl-6 text-xs" : ""
                      } ${
                        activeId === item.id
                          ? "text-blue-600 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-950/30"
                          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>
          )}

          {/* 主内容 */}
          <main className="flex-1 min-w-0">
            <article className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 sm:p-12">
              {/* 元信息 */}
              <div className="mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  {datasetName && <span>{datasetName} · </span>}
                  深度研究报告
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {title}
                </h1>
              </div>

              {/* Markdown 内容 */}
              <AcademicMarkdown content={content} />

              {/* 底部 */}
              <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-center text-sm text-gray-500 dark:text-gray-400">
                报告由智能体辅助问卷分析系统自动生成 · {new Date().toLocaleDateString("zh-CN")}
              </div>
            </article>
          </main>
        </div>
      </div>
    </div>
  );
}
