/**
 * 单元测试：MediaType 常量 / isFolder / isNoteType
 *
 * 验证 enum -> as const 对象 重构后运行时行为不变。
 *
 * 运行：npx esbuild test/verify-constants.ts --bundle --platform=node --format=esm
 *   --outfile=test/verify-constants.mjs --alias:obsidian=./test/mock-obsidian.ts && node test/verify-constants.mjs
 */
import { MediaType, isFolder, isNoteType } from "../src/constants";

let pass = 0;
let fail = 0;

function assert(cond: boolean, label: string): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
    process.exitCode = 1;
  }
}

// ===== 0. MediaType 常量值 sanity check（确认 as const 对象保留原数值） =====
console.log("\n--- MediaType 常量值 ---");
assert(MediaType.NOTE === 11, `MediaType.NOTE === 11，实际: ${MediaType.NOTE}`);
assert(MediaType.FOLDER === 99, `MediaType.FOLDER === 99，实际: ${MediaType.FOLDER}`);
assert(MediaType.WEB_ARTICLE === 6, `MediaType.WEB_ARTICLE === 6，实际: ${MediaType.WEB_ARTICLE}`);
assert(typeof MediaType === "object", "MediaType 是对象（非 enum）");
assert(MediaType.NOTE !== MediaType.FOLDER, "NOTE 与 FOLDER 值不同");

// ===== 1. isFolder =====
console.log("\n--- isFolder ---");
assert(isFolder(99) === true, "isFolder(99) 文件夹 -> true");
assert(isFolder(11) === false, "isFolder(11) 笔记 -> false");
assert(isFolder(6) === false, "isFolder(6) 网页文章 -> false");
assert(isFolder(0) === false, "isFolder(0) 未知类型 -> false");
assert(isFolder(-1) === false, "isFolder(-1) 负数 -> false");
assert(isFolder(99.0) === true, "isFolder(99.0) 等值浮点 -> true");
assert(isFolder(100) === false, "isFolder(100) 相邻值 -> false");
assert(isFolder(98) === false, "isFolder(98) 相邻值 -> false");

// ===== 2. isNoteType =====
console.log("\n--- isNoteType ---");
// media_type=11 系列：无论 notebookId 如何，都应为 true
assert(isNoteType(11) === true, "isNoteType(11) 笔记(无 notebookId) -> true");
assert(isNoteType(11, "nb_id") === true, "isNoteType(11, 'nb_id') 笔记+notebookId -> true");
assert(isNoteType(11, null) === true, "isNoteType(11, null) 笔记+null -> true");
assert(isNoteType(11, undefined) === true, "isNoteType(11, undefined) 笔记+undefined -> true");
assert(isNoteType(11, "") === true, "isNoteType(11, '') 笔记+空串 -> true（mediaType 已命中）");

// 非 11 系列：依赖 notebookId 真假
assert(isNoteType(99) === false, "isNoteType(99) 文件夹(无 notebookId) -> false");
assert(isNoteType(99, "nb_id") === true, "isNoteType(99, 'nb_id') 文件夹+notebookId -> true");
assert(isNoteType(99, null) === false, "isNoteType(99, null) 文件夹+null -> false");
assert(isNoteType(99, undefined) === false, "isNoteType(99, undefined) 文件夹+undefined -> false");
assert(isNoteType(99, "") === false, "isNoteType(99, '') 文件夹+空串 -> false（Boolean('')===false）");

assert(isNoteType(6, null) === false, "isNoteType(6, null) 网页文章+null -> false");
assert(isNoteType(6, undefined) === false, "isNoteType(6, undefined) 网页文章+undefined -> false");
assert(isNoteType(6, "nb_id") === true, "isNoteType(6, 'nb_id') 网页文章+notebookId -> true");

assert(isNoteType(0) === false, "isNoteType(0) 未知类型 -> false");
assert(isNoteType(0, "nb_id") === true, "isNoteType(0, 'nb_id') 未知类型+notebookId -> true");
assert(isNoteType(0, "") === false, "isNoteType(0, '') 未知类型+空串 -> false");

// 边界：notebookId 为纯空白字符串（Boolean(' ')===true，仅空串为 false）
assert(isNoteType(99, " ") === true, "isNoteType(99, ' ') 空白串 -> true（Boolean(' ')===true）");

// ===== 结果 =====
console.log(`\n${"=".repeat(40)}`);
console.log(`结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
