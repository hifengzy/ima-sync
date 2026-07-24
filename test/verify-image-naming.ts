/**
 * 验证图片命名跨文档唯一性（修复 wechatar-1.png 串图 bug）。
 * 真实 doc_id 样本：微信文章 media_id 前缀对所有文章相同，唯一的是最后一段。
 *
 * 运行：npx esbuild test/verify-image-naming.ts --bundle --platform=node --format=esm --outfile=test/verify-image-naming.mjs --external:obsidian && node test/verify-image-naming.mjs
 */
import { buildImageFilename } from "../src/transform/imageNaming";

// 真实 doc_id 样本（来自探针）：前缀 wechatarticle_01e2d2a52b08d61e95e22027f1b7f834 对所有文章相同
const article1 = "wechatarticle_01e2d2a52b08d61e95e22027f1b7f834_2aa86be7d727d40924d721e67776856d7483545924684360";
const article2 = "wechatarticle_01e2d2a52b08d61e95e22027f1b7f834_410868ce35e3115e00723236dd2e58007310913954674002";
const article3 = "wechatarticle_01e2d2a52b08d61e95e22027f1b7f834_0b243181781a3125e9ce334f47cb80117310913954674002";
const noteId = "7343806521302447";
const folderId = "folder_7435514672058702";

const f1 = buildImageFilename(article1, 1, "png");
const f2 = buildImageFilename(article2, 1, "png");
const f3 = buildImageFilename(article3, 1, "png");
const fn = buildImageFilename(noteId, 1, "png");
const ff = buildImageFilename(folderId, 1, "png");

console.log("文章1 图片1:", f1);
console.log("文章2 图片1:", f2);
console.log("文章3 图片1:", f3);
console.log("笔记 图片1:", fn);
console.log("文件夹 图片1:", ff);

// 断言：不同文档的图片名不同（旧 bug 下全是 wechatar-1.png）
const names = [f1, f2, f3, fn, ff];
const unique = new Set(names);
if (unique.size !== names.length) {
  console.log("✗ 存在同名冲突:", names);
  process.exit(1);
}
// 断言：不以 wechatar 开头（旧 bug 前缀）
for (const n of names) {
  if (n.startsWith("wechatar") || n.startsWith("weburl_0")) {
    console.log("✗ 仍用固定前 8 位前缀:", n);
    process.exit(1);
  }
}
// 断言：同文档不同 index 不同
if (buildImageFilename(article1, 1, "png") === buildImageFilename(article1, 2, "png")) {
  console.log("✗ 同文档不同 index 同名");
  process.exit(1);
}

console.log("\n✓ 跨文档图片命名唯一（5 个不同文档各不相同），同文档不同 index 唯一");
