// ============================================
// NlpServer — 中文 NLP MCP Server（纯 TypeScript 实现）
// 提供中文分词和关键词提取工具，无 Python 依赖
// 分词算法与 analyze_generic.py 中的 jieba 回退逻辑一致
// ============================================

import { McpServer } from "../McpServer";
import type { ServerManifest, ToolCallResult } from "../protocol";

// ── 停用词表（与 Python analyze_generic.py 保持一致）──

const STOPWORDS = new Set([
  "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
  "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看",
  "好", "自己", "这", "他", "她", "它", "们", "那", "些", "可以",
  "觉得", "因为", "所以", "但是", "如果", "虽然", "而且", "或者",
  "还是", "应该", "能够", "需要", "已经", "比较", "非常", "什么",
  "怎么", "怎样", "吗", "呢", "吧", "啊", "哦", "嗯", "被", "把",
  "让", "给", "用", "对", "从", "以", "之", "与", "及", "等",
  "能", "会", "要", "想", "做", "来", "过", "出", "中", "后",
  "前", "下", "时", "里", "现在", "学校", "进行", "通过", "使用",
  "主要", "一般", "目前", "一些", "可能", "情况", "方面", "问题",
  "方法", "方式", "内容", "过程", "不同", "部分", "相关", "其他",
]);

// ── 中文分词（jieba 回退算法的 TS 实现）──

const CHINESE_CHAR = /[\u4e00-\u9fff]/;
const ALPHA_CHAR = /[a-zA-Z]/;

/**
 * 简易中文分词
 * 策略：连续汉字按二元组切分，英文单词整体保留，其他字符跳过
 * 与 Python tokenize_chinese() 的 fallback 逻辑一致
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (CHINESE_CHAR.test(ch)) {
      // 二元组切分（模拟 jieba 缺失时的回退策略）
      if (i + 1 < text.length && CHINESE_CHAR.test(text[i + 1])) {
        tokens.push(text.slice(i, i + 2));
        i += 2;
      } else {
        tokens.push(ch);
        i += 1;
      }
    } else if (ALPHA_CHAR.test(ch)) {
      // 连续英文字母作为一个词
      let j = i;
      while (j < text.length && ALPHA_CHAR.test(text[j])) {
        j++;
      }
      tokens.push(text.slice(i, j).toLowerCase());
      i = j;
    } else {
      i += 1;
    }
  }

  return tokens;
}

// ── 关键词提取 ──

interface KeywordEntry {
  word: string;
  count: number;
}

/**
 * 从文本数组中提取高频关键词
 * 流水线: 分词 → 去停用词 → 过滤长度<2 → 统计频率 → 排序取 topN
 */
function extractKeywords(texts: string[], topN: number = 50): KeywordEntry[] {
  const counter = new Map<string, number>();

  for (const text of texts) {
    const tokens = tokenize(text);
    for (const token of tokens) {
      if (token.length >= 2 && !STOPWORDS.has(token)) {
        counter.set(token, (counter.get(token) || 0) + 1);
      }
    }
  }

  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));
}

// ── MCP Server ──

export class NlpServer extends McpServer {
  readonly manifest: ServerManifest = {
    name: "nlp-server",
    version: "1.0.0",
    description: "中文 NLP 服务：分词、关键词提取（纯 TypeScript 实现，无 Python 依赖）",
    capabilities: {
      tools: [
        {
          name: "tokenize",
          description:
            "对中文文本进行分词。使用二元组切分 + 英文词保留策略，与 Python jieba 回退算法一致。",
          inputSchema: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "待分词的中文文本",
              },
            },
            required: ["text"],
          },
        },
        {
          name: "extract_keywords",
          description:
            "从文本数组中提取高频关键词。流水线：分词 → 去停用词 → 过滤 → 统计 → 排序。",
          inputSchema: {
            type: "object",
            properties: {
              texts: {
                type: "array",
                items: { type: "string" },
                description: "文本数组",
              },
              topN: {
                type: "number",
                description: "返回前 N 个关键词（默认 50）",
              },
            },
            required: ["texts"],
          },
        },
      ],
    },
  };

  protected async executeTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<ToolCallResult> {
    switch (name) {
      case "tokenize":
        return this._tokenize(args.text as string);
      case "extract_keywords":
        return this._extractKeywords(
          args.texts as string[],
          (args.topN as number) || 50
        );
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  }

  private async _tokenize(text: string): Promise<ToolCallResult> {
    if (!text) {
      return {
        content: [{ type: "text", text: "Missing required parameter: text" }],
        isError: true,
      };
    }

    const tokens = tokenize(text);
    const filtered = tokens.filter(
      (t) => t.length >= 2 && !STOPWORDS.has(t)
    );

    return {
      content: [
        {
          type: "json",
          data: {
            raw_tokens: tokens,
            filtered_tokens: filtered,
            raw_count: tokens.length,
            filtered_count: filtered.length,
          },
        },
      ],
    };
  }

  private async _extractKeywords(
    texts: string[],
    topN: number
  ): Promise<ToolCallResult> {
    if (!texts || texts.length === 0) {
      return {
        content: [
          { type: "text", text: "Missing required parameter: texts (non-empty array)" },
        ],
        isError: true,
      };
    }

    const keywords = extractKeywords(texts, topN);

    return {
      content: [
        {
          type: "json",
          data: {
            total_texts: texts.length,
            unique_keywords: keywords.length,
            keywords,
          },
        },
      ],
    };
  }
}
