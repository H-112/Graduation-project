#!/usr/bin/env node
// ============================================
// nlp-stdio-server.ts — 官方 MCP SDK 标准 NLP Server
// 基于 @modelcontextprotocol/sdk + stdio 传输
// 复用原有分词/关键词提取逻辑，内容格式对齐官方标准
// ============================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── 停用词表（与 NlpServer.ts / analyze_generic.py 保持一致）──

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

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (CHINESE_CHAR.test(ch)) {
      if (i + 1 < text.length && CHINESE_CHAR.test(text[i + 1])) {
        tokens.push(text.slice(i, i + 2));
        i += 2;
      } else {
        tokens.push(ch);
        i += 1;
      }
    } else if (ALPHA_CHAR.test(ch)) {
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

interface KeywordEntry {
  word: string;
  count: number;
}

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

const server = new McpServer({
  name: "nlp-server",
  version: "1.0.0",
});

// tool: tokenize
server.registerTool(
  "tokenize",
  {
    description:
      "对中文文本进行分词。使用二元组切分 + 英文词保留策略，与 Python jieba 回退算法一致。",
    inputSchema: z.object({
      text: z.string().describe("待分词的中文文本"),
    }),
  },
  async ({ text }) => {
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

    const result = {
      raw_tokens: tokens,
      filtered_tokens: filtered,
      raw_count: tokens.length,
      filtered_count: filtered.length,
    };

    // 官方 SDK 不支持 type: "json"，用 text + JSON.stringify 对齐标准
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  }
);

// tool: extract_keywords
server.registerTool(
  "extract_keywords",
  {
    description:
      "从文本数组或单个字符串中提取高频关键词。支持 texts（数组）或 text（单字符串）两种输入方式。流水线：分词 → 去停用词 → 过滤 → 统计 → 排序。",
    inputSchema: z.object({
      texts: z.array(z.string()).optional().describe("文本数组"),
      text: z.string().optional().describe("单个文本字符串（会自动包装为数组）"),
      topN: z.number().optional().describe("返回前 N 个关键词（默认 50）"),
    }),
  },
  async ({ texts, text, topN }) => {
    let targetTexts: string[] = [];
    if (text) {
      targetTexts = [text];
    } else if (texts && texts.length > 0) {
      targetTexts = texts;
    } else {
      return {
        content: [
          {
            type: "text",
            text: "Missing required parameter: provide either 'text' (string) or 'texts' (array)",
          },
        ],
        isError: true,
      };
    }

    const keywords = extractKeywords(targetTexts, topN ?? 50);

    const result = {
      total_texts: targetTexts.length,
      unique_keywords: keywords.length,
      keywords,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  }
);

// ── stdio 传输 ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[nlp-stdio-server] Fatal error:", err);
  process.exit(1);
});
