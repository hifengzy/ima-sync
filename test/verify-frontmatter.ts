/**
 * 验证问题4修复：frontmatter 仅含 title/created/source/tags，无内部字段。
 * 运行：npx esbuild test/verify-frontmatter.ts --bundle --platform=node --format=esm --outfile=test/verify-frontmatter.mjs --external:obsidian && node test/verify-frontmatter.mjs
 */
import {
  buildFrontmatterYaml,
  buildMarkdownWithFrontmatter,
  type FrontmatterProps,
} from "../src/transform/frontmatter";

const props: FrontmatterProps = {
  title: "测试文章",
  created: "2026-07-24T10:30:00",
  source: "https://mp.weixin.qq.com/s/xxx",
  tags: ["clippings"],
};

const yaml = buildFrontmatterYaml(props);
console.log("=== buildFrontmatterYaml 输出 ===");
console.log(yaml);

console.log("\n=== 完整 Markdown（新建文件用）===");
console.log(buildMarkdownWithFrontmatter(props, "正文内容"));

// 断言：不含内部字段
const forbidden = ["ima_doc_id", "ima_kb_id", "ima_kb_name", "ima_update_time", "synced_at"];
const found = forbidden.filter((k) => yaml.includes(k));
if (found.length > 0) {
  console.log(`\n✗ 仍含内部字段: ${found.join(", ")}`);
  process.exit(1);
}
// 断言：含 created
if (!yaml.includes("created:")) {
  console.log("\n✗ 缺少 created");
  process.exit(1);
}
// 断言：含 title/source/tags
for (const k of ["title:", "source:", "tags:"]) {
  if (!yaml.includes(k)) {
    console.log(`\n✗ 缺少 ${k}`);
    process.exit(1);
  }
}

// 无 source 场景（笔记）
const propsNoSource: FrontmatterProps = {
  title: "笔记",
  created: "2026-07-24T10:30:00",
  tags: ["clippings"],
};
const yamlNoSource = buildFrontmatterYaml(propsNoSource);
if (yamlNoSource.includes("source:")) {
  console.log("\n✗ 无 source 时仍输出 source");
  process.exit(1);
}
console.log("\n=== 无 source 场景（笔记）===");
console.log(yamlNoSource);

console.log("\n✓ frontmatter 仅含 title/created/source/tags，无内部字段，source 可选");
