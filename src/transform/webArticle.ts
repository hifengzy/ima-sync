/**
 * 网页正文提取与转换（对应开发方案 6.4 / PRD FR-7.7/7.8）。
 *
 * MVP 启发式提取：优先 <article>/<main>/#js_content(微信) 等，回退最大文本密度区块。
 * 剔除 nav/header/footer/script/style 等噪声节点，turndown 转 Markdown。
 * 正文内图片经 localizeImages 本地化。
 * 抓取失败 / 非 HTML / 正文为空 -> 降级为标题 + 原链接 + 摘要（FR-7.8）。
 *
 * 注：extractFromHtml 不发起请求，由调用方（SyncManager）先抓取并按 Content-Type 分支后传入 HTML，
 * 避免对同一 URL 重复下载。
 */
import type { App } from "obsidian";
import type { ImaClient } from "../api/imaClient";
import { turndownHtml } from "./htmlToMarkdown";
import { localizeImages } from "./imageDownloader";
import { logger } from "../utils/logger";

export interface WebArticleResult {
  body: string;
  source: string;
  degraded: boolean;
}

const MAIN_CONTENT_SELECTORS = [
  "article",
  "main",
  "#js_content", // 微信公众号
  "[role='main']",
  ".article-content",
  ".post-content",
  ".entry-content",
  "#content",
  "#article",
];

function pickMainContent(doc: Document): Element | null {
  for (const sel of MAIN_CONTENT_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el && (el.textContent ?? "").trim().length > 200) return el;
  }
  let best: Element | null = null;
  let bestLen = 0;
  doc.querySelectorAll("div").forEach((div) => {
    const len = (div.textContent ?? "").length;
    if (len > bestLen) {
      bestLen = len;
      best = div;
    }
  });
  return best ?? doc.body;
}

function removeJunk(root: Element): void {
  root
    .querySelectorAll("script,style,nav,header,footer,aside,iframe,form,noscript,svg")
    .forEach((n) => n.remove());
}

function readMetaContent(doc: Document, prop: string): string {
  const el = doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
  return el?.getAttribute("content") ?? "";
}

function degrade(title: string, url: string, summary: string): WebArticleResult {
  const parts = [`# ${title}`, "", `[原文链接](${url})`, ""];
  if (summary && summary.trim()) {
    parts.push(`> ${summary.trim()}`);
  } else {
    parts.push("> 正文抓取失败，仅保留链接。");
  }
  return { body: parts.join("\n"), source: url, degraded: true };
}

/**
 * 从已抓取的 HTML 提取正文并转 Markdown。
 * 不发起网络请求。
 */
export async function extractFromHtml(opts: {
  app: App;
  client: ImaClient;
  html: string;
  url: string;
  title: string;
  docId: string;
  attachmentDir: string;
}): Promise<WebArticleResult> {
  const { app, client, html, url, title, docId, attachmentDir } = opts;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const main = pickMainContent(doc);
    if (!main) {
      return degrade(title, url, readMetaContent(doc, "og:description"));
    }
    removeJunk(main);
    if ((main.textContent ?? "").trim().length < 80) {
      return degrade(title, url, readMetaContent(doc, "og:description"));
    }
    let md = turndownHtml(main.innerHTML);
    const img = await localizeImages({ app, client, content: md, attachmentDir, docId });
    md = img.content;
    const body = `# ${title}\n\n[原文链接](${url})\n\n${md.trim()}`;
    return { body, source: url, degraded: false };
  } catch (e) {
    logger.warn(`网页正文解析失败，降级: ${url}`, e);
    return degrade(title, url, "");
  }
}

/** 兼容独立调用：自行抓取后提取 */
export async function extractWebArticle(opts: {
  app: App;
  client: ImaClient;
  url: string;
  title: string;
  docId: string;
  attachmentDir: string;
}): Promise<WebArticleResult> {
  const { app, client, url, title, docId, attachmentDir } = opts;
  try {
    const resp = await client.fetchUrl(url);
    if (!resp.contentType.toLowerCase().includes("text/html") || !resp.text) {
      return degrade(title, url, (resp.text ?? "").trim().substring(0, 200));
    }
    return extractFromHtml({ app, client, html: resp.text, url, title, docId, attachmentDir });
  } catch (e) {
    logger.warn(`网页抓取失败，降级: ${url}`, e);
    return degrade(title, url, "");
  }
}
