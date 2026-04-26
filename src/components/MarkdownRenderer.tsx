"use client";

import { useMemo } from "react";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * 统一的 Markdown 渲染组件
 * 支持: 标题、粗体、斜体、无序/有序列表、引用块、分隔线、普通段落
 */
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className={`text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-3 ${className}`}>
      {blocks.map((block, i) => (
        <BlockElement key={i} block={block} />
      ))}
    </div>
  );
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "ordered_list"; items: string[]; start: number }
  | { type: "blockquote"; lines: string[] }
  | { type: "hr" }
  | { type: "code"; lang?: string; code: string };

function parseMarkdown(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal rule
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

    // Bullet list
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))
      ) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ type: "bullet_list", items });
      continue;
    }

    // Ordered list
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const start = parseInt(orderedMatch[1], 10);
      const items: string[] = [];
      // First item already matched
      items.push(orderedMatch[2]);
      i++;
      while (i < lines.length) {
        const m = lines[i].trim().match(/^(\d+)\.\s+(.*)$/);
        if (m) {
          items.push(m[2]);
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: "ordered_list", items, start });
      continue;
    }

    // Paragraph (accumulate until empty line or special block)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith("- ") &&
      !lines[i].trim().startsWith("* ") &&
      !lines[i].trim().startsWith("> ") &&
      !lines[i].trim().startsWith("```") &&
      !/^\d+\.\s/.test(lines[i].trim()) &&
      !/^(---|___|\*\*\*)$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return blocks;
}

function BlockElement({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const sizes: Record<number, string> = {
        1: "text-xl font-bold text-gray-900 dark:text-gray-100 mt-2",
        2: "text-lg font-bold text-gray-900 dark:text-gray-100 mt-4",
        3: "text-base font-bold text-gray-900 dark:text-gray-100 mt-4",
        4: "text-sm font-bold text-gray-900 dark:text-gray-100 mt-3",
        5: "text-sm font-semibold text-gray-900 dark:text-gray-100 mt-2",
        6: "text-xs font-semibold text-gray-900 dark:text-gray-100 mt-2",
      };
      return (
        <div className={sizes[block.level] || sizes[3]}>
          <InlineMarkdown text={block.text} />
        </div>
      );
    }
    case "paragraph":
      return (
        <p className="text-gray-600 dark:text-gray-400">
          <InlineMarkdown text={block.text} />
        </p>
      );
    case "bullet_list":
      return (
        <ul className="list-disc list-inside space-y-1">
          {block.items.map((item, idx) => (
            <li key={idx} className="text-gray-600 dark:text-gray-400">
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ul>
      );
    case "ordered_list":
      return (
        <ol className="list-decimal list-inside space-y-1" start={block.start}>
          {block.items.map((item, idx) => (
            <li key={idx} className="text-gray-600 dark:text-gray-400">
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ol>
      );
    case "blockquote":
      return (
        <blockquote className="border-l-4 border-amber-300 dark:border-amber-700 pl-3 py-1 my-2 bg-amber-50/50 dark:bg-amber-950/20 italic text-gray-600 dark:text-gray-400">
          {block.lines.map((line, idx) => (
            <p key={idx}><InlineMarkdown text={line} /></p>
          ))}
        </blockquote>
      );
    case "hr":
      return <hr className="my-4 border-gray-200 dark:border-gray-700" />;
    case "code":
      return (
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-xs font-mono my-3">
          <code>{block.code}</code>
        </pre>
      );
    default:
      return null;
  }
}

/** 行内 Markdown: 粗体 **text** 和斜体 *text* */
export function InlineMarkdown({ text }: { text: string }) {
  // 使用闭包计数器确保所有递归调用中的 key 全局唯一
  let keyCounter = 0;
  function nextKey(): string {
    return `mk-${keyCounter++}`;
  }

  function processText(str: string, isBold = false, isItalic = false): React.ReactNode[] {
    const result: React.ReactNode[] = [];
    let rest = str;

    while (rest.length > 0) {
      // Try bold first
      const boldMatch = rest.match(/^(.*?)\*\*(.+?)\*\*(.*)$/);
      if (boldMatch) {
        if (boldMatch[1]) result.push(...processText(boldMatch[1], isBold, isItalic));
        result.push(...processText(boldMatch[2], true, isItalic));
        rest = boldMatch[3];
        continue;
      }

      // Try italic
      const italicMatch = rest.match(/^(.*?)\*(.+?)\*(.*)$/);
      if (italicMatch) {
        if (italicMatch[1]) result.push(...processText(italicMatch[1], isBold, isItalic));
        result.push(...processText(italicMatch[2], isBold, true));
        rest = italicMatch[3];
        continue;
      }

      // No more formatting
      if (rest) {
        let className = "";
        if (isBold && isItalic) className = "font-bold italic";
        else if (isBold) className = "font-bold";
        else if (isItalic) className = "italic";

        if (className) {
          result.push(<span key={nextKey()} className={className}>{rest}</span>);
        } else {
          result.push(<span key={nextKey()}>{rest}</span>);
        }
      }
      break;
    }
    return result;
  }

  return <>{processText(text)}</>;
}
