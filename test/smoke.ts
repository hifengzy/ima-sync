/**
 * 端到端冒烟测试：用真实 API 凭证验证插件的 API 集成层（ImaClient + ImaApi）。
 *
 * 运行：IMA_CLIENT_ID=... IMA_API_KEY=... node test/smoke.mjs
 * 验证项：
 *  1. listAllKnowledgeBases 全量分页（next_cursor）
 *  2. listAllNotes 全量分页（数字 offset 翻页修复）
 *  3. getDocContent 笔记正文（Markdown）
 *  4. listKnowledgeLevel 知识库当前层级（next_cursor）
 *  5. getMediaInfo 媒体元信息（url_info）
 */
import { ImaClient } from "../src/api/imaClient";
import { ImaApi } from "../src/api/endpoints";
import { ImaQuotaExceededError } from "../src/api/errors";

const clientId = process.env.IMA_CLIENT_ID;
const apiKey = process.env.IMA_API_KEY;
if (!clientId || !apiKey) {
  console.error("请设置 IMA_CLIENT_ID 和 IMA_API_KEY 环境变量");
  process.exit(1);
}

function expect(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("✗ 断言失败:", msg);
    process.exit(1);
  }
  console.log("✓", msg);
}

async function main(): Promise<void> {
  const client = new ImaClient(clientId, apiKey);
  const api = new ImaApi(client);

  console.log("\n=== 1. listAllKnowledgeBases ===");
  const kbs = await api.listAllKnowledgeBases();
  console.log("知识库数:", kbs.length);
  expect(kbs.length > 0, "知识库列表非空");
  kbs.slice(0, 5).forEach((k) =>
    console.log(`  - ${k.kb_name} | base_type=${k.base_type} | content_count=${k.content_count}`),
  );

  console.log("\n=== 2. listAllNotes（验证 offset 翻页修复，应 >20）===");
  const notes = await api.listAllNotes();
  console.log("笔记总数:", notes.length);
  expect(notes.length > 20, `笔记全量翻页生效（${notes.length} > 20，非仅首页）`);
  notes.slice(0, 3).forEach((n) =>
    console.log(`  - ${n.title} | docid=${n.docid} | modify=${n.modify_time}`),
  );

  console.log("\n=== 3. getDocContent（笔记正文 Markdown）===");
  const content = await api.getDocContent(notes[0].docid);
  console.log("正文长度:", content.length);
  expect(content.length > 0, "笔记正文非空");

  console.log("\n=== 4. listKnowledgeLevel（知识库当前层级）===");
  const target = kbs.find((k) => k.base_type.includes("个人")) ?? kbs.find((k) => Number(k.content_count) > 0) ?? kbs[0];
  const page = await api.listKnowledgeLevel(target.kb_id, "");
  console.log(`知识库「${target.kb_name}」当前层级条目数:`, page.items.length);
  expect(page.items.length > 0, "知识库内容列表非空");
  page.items.slice(0, 3).forEach((i) =>
    console.log(`  - ${i.title} | media_type=${i.media_type} | media_id=${i.media_id}`),
  );

  console.log("\n=== 5. getMediaInfo（媒体元信息 url_info）===");
  // 跳过文件夹（media_type=99），取一个真实媒体条目
  const article = page.items.find((i) => i.media_type !== 99);
  if (!article) {
    console.log("（当前层级无非文件夹条目，跳过）");
  } else {
    console.log(`选取条目：「${article.title}」media_type=${article.media_type}`);
    try {
      const media = await api.getMediaInfo(article.media_id);
      console.log("media_type:", media.media_type, "| url:", media.url_info?.url?.slice(0, 60));
      expect(Boolean(media.url_info?.url), "媒体 url_info.url 非空");
    } catch (e) {
      const isQuota = e instanceof ImaQuotaExceededError;
      const msg = e instanceof Error ? e.message : String(e);
      console.log("getMediaInfo 抛错:", msg, "| ImaQuotaExceededError:", isQuota);
      const readable = msg.length > 15 && !/^\[.+\] HTTP \d+$/.test(msg);
      if (isQuota && msg.includes("请求超量")) {
        console.log("✓ 配额超限识别为 ImaQuotaExceededError，提示可读");
      } else if (!isQuota && readable) {
        console.log("✓ 错误消息可读（含响应体原因）");
      } else {
        console.log("✗ 错误未识别或提示不可读");
        process.exit(1);
      }
    }
  }

  console.log("\n=== 冒烟测试全部通过 ===");
  console.log(`统计：${kbs.length} 知识库，${notes.length} 笔记，知识库「${target.kb_name}」${page.items.length} 条目`);
}

main().catch((e) => {
  console.error("冒烟测试失败:", e);
  process.exit(1);
});
