"use client";

import { useMemo } from "react";

interface AcademicMarkdownProps {
  content: string;
  className?: string;
}

/**
 * 学术风格 Markdown 渲染组件
 * 字体: Times New Roman + 宋体 (serif)
 * 排版: 16px 正文, 1.75 行距, 适合长文阅读
 */
export function AcademicMarkdown({ content, className = "" }: AcademicMarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div
      className={`academic-markdown text-base leading-[1.75] text-gray-800 dark:text-gray-200 space-y-5 ${className}`}
      style={{ fontFamily: "'Times New Roman', '宋体', 'SimSun', serif" }}
    >
      {blocks.map((block, i) => (
        <BlockElement key={i} block={block} />
      ))}
    </div>
  );
}

type Block =
  | { type: "heading"; level: number; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "ordered_list"; items: string[]; start: number }
  | { type: "blockquote"; lines: string[] }
  | { type: "hr" }
  | { type: "code"; lang?: string; code: string };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fa5]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50);
}

function parseMarkdown(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const id = slugify(text);
      blocks.push({ type: "heading", level, text, id });
      i++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", lines: quoteLines });
      continue;
    }

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

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      const start = parseInt(orderedMatch[1], 10);
      const items: string[] = [];
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
        1: "text-[28px] font-bold text-gray-900 dark:text-gray-100 mt-8 mb-6 pb-2 border-b border-gray-300 dark:border-gray-700",
        2: "text-[22px] font-bold text-gray-800 dark:text-gray-200 mt-7 mb-4",
        3: "text-lg font-bold text-gray-800 dark:text-gray-200 mt-6 mb-3",
        4: "text-base font-bold text-gray-800 dark:text-gray-200 mt-5 mb-2",
        5: "text-sm font-bold text-gray-700 dark:text-gray-300 mt-4 mb-2",
        6: "text-sm font-semibold text-gray-700 dark:text-gray-300 mt-3 mb-1",
      };
      const className = sizes[block.level] || sizes[3];
      const children = <InlineMarkdown text={block.text} />;
      switch (block.level) {
        case 1: return <h1 id={block.id} className={className}>{children}</h1>;
        case 2: return <h2 id={block.id} className={className}>{children}</h2>;
        case 3: return <h3 id={block.id} className={className}>{children}</h3>;
        case 4: return <h4 id={block.id} className={className}>{children}</h4>;
        case 5: return <h5 id={block.id} className={className}>{children}</h5>;
        case 6: return <h6 id={block.id} className={className}>{children}</h6>;
        default: return <h3 id={block.id} className={className}>{children}</h3>;
      }
    }
    case "paragraph":
      return (
        <p className="text-gray-700 dark:text-gray-300 text-justify indent-[2em]">
          <InlineMarkdown text={block.text} />
        </p>
      );
    case "bullet_list":
      return (
        <ul className="list-disc pl-8 space-y-2 my-4">
          {block.items.map((item, idx) => (
            <li key={idx} className="text-gray-700 dark:text-gray-300">
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ul>
      );
    case "ordered_list":
      return (
        <ol className="list-decimal pl-8 space-y-2 my-4" start={block.start}>
          {block.items.map((item, idx) => (
            <li key={idx} className="text-gray-700 dark:text-gray-300">
              <InlineMarkdown text={item} />
            </li>
          ))}
        </ol>
      );
    case "blockquote":
      return (
        <blockquote className="border-l-[3px] border-amber-400 dark:border-amber-600 pl-5 py-2 my-5 bg-amber-50/30 dark:bg-amber-950/20 italic text-gray-600 dark:text-gray-400">
          {block.lines.map((line, idx) => (
            <p key={idx} className="mb-1 last:mb-0"><InlineMarkdown text={line} /></p>
          ))}
        </blockquote>
      );
    case "hr":
      return <hr className="my-8 border-gray-300 dark:border-gray-700" />;
    case "code":
      return (
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono my-5 leading-relaxed">
          <code>{block.code}</code>
        </pre>
      );
    default:
      return null;
  }
}

let keyCounter = 0;
function nextKey(): string {
  return `am-${keyCounter++}`;
}

export function InlineMarkdown({ text }: { text: string }) {
  function processText(str: string, isBold = false, isItalic = false): React.ReactNode[] {
    const result: React.ReactNode[] = [];
    let rest = str;

    while (rest.length > 0) {
      const boldMatch = rest.match(/^(.*?)\*\*(.+?)\*\*(.*)$/);
      if (boldMatch) {
        if (boldMatch[1]) result.push(...processText(boldMatch[1], isBold, isItalic));
        result.push(...processText(boldMatch[2], true, isItalic));
        rest = boldMatch[3];
        continue;
      }

      const italicMatch = rest.match(/^(.*?)\*(.+?)\*(.*)$/);
      if (italicMatch) {
        if (italicMatch[1]) result.push(...processText(italicMatch[1], isBold, isItalic));
        result.push(...processText(italicMatch[2], isBold, true));
        rest = italicMatch[3];
        continue;
      }

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
