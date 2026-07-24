/**
 * 验证问题3修复：微信文章 data-src 懒加载图片能被正确提取并经 turndown 输出。
 * 用 jsdom 提供 DOMParser/Document，模拟插件 extractFromHtml 的核心逻辑。
 *
 * 运行：node test/verify-images.mjs
 */
import { JSDOM } from "jsdom";

const ARTICLE_URL = "https://mp.weixin.qq.com/s/VYKTuE3jFIAXg8g2FrDD3Q";

const resp = await fetch(ARTICLE_URL, {
  headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
});
const html = await resp.text();
console.log(`抓取 HTML: ${html.length} bytes`);

const dom = new JSDOM(html);
const doc = dom.window.document;

// 修复前：统计 data-src 图片
const beforeDataSrc = doc.querySelectorAll("img[data-src]").length;
console.log(`\n修复前: ${beforeDataSrc} 个 img 带 data-src`);
let beforeMmbizSrc = 0;
doc.querySelectorAll("img").forEach((img) => {
  if ((img.getAttribute("src") || "").includes("mmbiz.qpic.cn")) beforeMmbizSrc++;
});
console.log(`修复前: ${beforeMmbizSrc} 个 img.src 是 mmbiz 真实图片`);

// 执行修复：data-src -> src（与 extractFromHtml 一致）
doc.querySelectorAll("img[data-src]").forEach((img) => {
  const ds = img.getAttribute("data-src");
  if (ds) img.setAttribute("src", ds);
});

// 修复后：统计 mmbiz src
let afterMmbizSrc = 0;
doc.querySelectorAll("img").forEach((img) => {
  if ((img.getAttribute("src") || "").includes("mmbiz.qpic.cn")) afterMmbizSrc++;
});
console.log(`修复后: ${afterMmbizSrc} 个 img.src 是 mmbiz 真实图片`);

// turndown 转换（模拟 htmlToMarkdown.turndownHtml）
global.DOMParser = dom.window.DOMParser;
global.Document = dom.window.Document;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.HTMLElement = dom.window.HTMLElement;
const TurndownService = (await import("turndown")).default;
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.remove(["style", "script", "nav", "header", "footer", "noscript"]);

const main = doc.querySelector("#js_content") || doc.body;
const md = turndown.turndown(main.innerHTML);
const mdImgs = md.match(/!\[[^\]]*\]\(([^)]+)\)/g) || [];
const mmbizMd = mdImgs.filter((s) => s.includes("mmbiz.qpic.cn")).length;
console.log(`\nturndown 输出: ${mdImgs.length} 个图片引用，其中 ${mmbizMd} 个 mmbiz 真实图片`);
console.log("\n前 3 个图片引用:");
mdImgs.slice(0, 3).forEach((s) => console.log("  ", s.slice(0, 140)));

console.log("\n=== 结论 ===");
if (afterMmbizSrc > beforeMmbizSrc && mmbizMd > 0) {
  console.log(`✓ 修复生效：data-src 图片被提取（${beforeMmbizSrc} -> ${afterMmbizSrc}），turndown 输出 ${mmbizMd} 个真实图片引用`);
} else {
  console.log("✗ 修复未生效");
  process.exit(1);
}
