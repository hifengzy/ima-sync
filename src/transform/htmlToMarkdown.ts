/**
 * 正文格式转换（对应开发方案 6.1 / PRD FR-7.1）。
 *
 * get_doc_content(target_content_format=1) 实测返回 Markdown（探针确认），
 * 仅混入少量内联 HTML（<span>）与实体（&#x20;）。
 *
 * 策略：自适应三种返回格式
 *  - HTML（含块级标签）-> turndown 转 Markdown
 *  - Markdown -> 轻量清洗（解码实体、剥离样式 span、<br> 换行）
 *  - 纯文本 -> 按段落包装
 */
import TurndownService from "turndown";
import { logger } from "../utils/logger";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
});

// 移除 style/script/nav 等无关节点
turndown.remove(["style", "script", "nav", "header", "footer", "noscript"]);

/** 常见 HTML 实体解码 */
const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&#x20;": " ",
  "&#160;": " ",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&[a-zA-Z]+;|&#x[0-9a-fA-F]+;|&#\d+;/g, (m) => ENTITY_MAP[m] ?? m);
}

/** 剥离样式包装标签（span/font/mark），保留内部文本；<br> -> 换行 */
function stripStyleTags(html: string): string {
  return html
    .replace(/<br\s*\/?>(\n)?/gi, "\n")
    .replace(/<\/?(span|font|mark|s|u|strike)\b[^>]*>/gi, "");
}

/** 是否疑似 HTML（含块级标签） */
function looksLikeHtml(content: string): boolean {
  const lower = content.slice(0, 2000).toLowerCase();
  return (
    /^\s*<(!doctype|html|body|div|p|article|section|table|ul|ol|h[1-6])\b/.test(lower) ||
    /<(div|p|article|section|table|tbody|thead|tr|td|th|ul|ol|li|h[1-6]|pre|blockquote)\b/.test(lower)
  );
}

/** HTML -> Markdown（turndown + 实体解码） */
export function turndownHtml(html: string): string {
  try {
    const md = turndown.turndown(html);
    return decodeEntities(md).trim();
  } catch (e) {
    logger.warn("turndown 失败，回退为清洗后原文", e);
    return decodeEntities(stripStyleTags(html)).trim();
  }
}

/** 轻量清洗 Markdown（剥离样式 span、解码实体、去除冗余空行） */
export function cleanMarkdown(content: string): string {
  const cleaned = decodeEntities(stripStyleTags(content));
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 自适应正文 -> Markdown。
 * @param raw get_doc_content 返回的 content
 */
export function convertToMarkdown(raw: string): string {
  if (!raw || !raw.trim()) return "";
  if (looksLikeHtml(raw)) {
    return turndownHtml(raw);
  }
  // 含少量内联 HTML 但主体为 Markdown
  const cleaned = cleanMarkdown(raw);
  // 若清洗后仍含明显块级 HTML 残留，再 turndown 一次
  if (looksLikeHtml(cleaned)) {
    return turndownHtml(cleaned);
  }
  return cleaned;
}

/** 纯文本包装为 Markdown 段落 */
export function plainTextToMarkdown(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n\n");
}
