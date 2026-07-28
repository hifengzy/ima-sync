/**
 * 单元测试：ImaSyncSettingTab.normalizeControlValue（private 方法）
 *
 * 验证声明式设置 control 值按 key 的类型归一化逻辑：
 *  - clientId / syncRootPath      -> String(value).trim()
 *  - syncNotes / scheduleEnabled / showRibbonIcon -> Boolean(value)
 *  - attachmentMode               -> String(value)（不 trim）
 *  - 其它 key                     -> 原值
 *
 * 实现方式：导入真实 ImaSyncSettingTab，用最小 stub 插件实例化，
 * 通过类型安全转换访问 private 方法（不修改生产代码、不复制逻辑）。
 *
 * 运行：npx esbuild test/verify-normalize.ts --bundle --platform=node --format=esm
 *   --outfile=test/verify-normalize.mjs --alias:obsidian=./test/mock-obsidian-settings.ts
 *   && node test/verify-normalize.mjs
 */
import { App, Plugin } from "obsidian";
import { ImaSyncSettingTab, ImaSyncPluginFacade } from "../src/settings/SettingTab";
import { ImaSyncSettings, DEFAULT_SETTINGS } from "../src/settings/types";

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

function assertStrictEq<T>(actual: T, expected: T, label: string): void {
  assert(Object.is(actual, expected), `${label}（实际: ${String(actual)}）`);
}

// ===== 构造真实 SettingTab 实例（最小 stub 插件，方法不会在测试中被调用） =====
const stubPlugin = Object.assign(new Plugin(), {
  app: {} as App,
  settings: { ...DEFAULT_SETTINGS } as ImaSyncSettings,
  async saveSettings(): Promise<void> {
    /* noop */
  },
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: "stub" };
  },
  async listAllKnowledgeBases(): Promise<never[]> {
    return [];
  },
  async triggerSync(): Promise<void> {
    /* noop */
  },
  async clearCache(): Promise<void> {
    /* noop */
  },
  async getIndexSize(): Promise<number> {
    return 0;
  },
  applySchedule(): void {
    /* noop */
  },
  applyRibbon(): void {
    /* noop */
  },
}) as unknown as ImaSyncPluginFacade;

const tab = new ImaSyncSettingTab(stubPlugin.app, stubPlugin);

/** 类型安全访问 private 方法 normalizeControlValue。 */
function normalize(key: string, value: unknown): unknown {
  return (
    tab as unknown as {
      normalizeControlValue: (k: string, v: unknown) => unknown;
    }
  ).normalizeControlValue(key, value);
}

// ===== 1. clientId / syncRootPath: String(value).trim() =====
console.log("\n--- clientId / syncRootPath: String(value).trim() ---");
for (const key of ["clientId", "syncRootPath"] as const) {
  assertStrictEq(normalize(key, "  abc  "), "abc", `${key}: '  abc  ' -> 'abc'`);
  assertStrictEq(normalize(key, "abc"), "abc", `${key}: 'abc' -> 'abc'（无空白）`);
  assertStrictEq(normalize(key, ""), "", `${key}: '' -> ''`);
  assertStrictEq(normalize(key, "   "), "", `${key}: '   ' -> ''（纯空白）`);
  assertStrictEq(normalize(key, "  ima  "), "ima", `${key}: '  ima  ' -> 'ima'`);
  assertStrictEq(normalize(key, "\t foo \n"), "foo", `${key}: '\\t foo \\n' -> 'foo'`);
  assertStrictEq(normalize(key, 123), "123", `${key}: 123 -> '123'（数字转字符串）`);
  assertStrictEq(normalize(key, 0), "0", `${key}: 0 -> '0'`);
  assertStrictEq(normalize(key, true), "true", `${key}: true -> 'true'`);
  assertStrictEq(normalize(key, false), "false", `${key}: false -> 'false'`);
  assertStrictEq(normalize(key, null), "null", `${key}: null -> 'null'`);
  assertStrictEq(normalize(key, undefined), "undefined", `${key}: undefined -> 'undefined'`);
  assertStrictEq(normalize(key, "A/B"), "A/B", `${key}: 'A/B' -> 'A/B'（路径保留）`);
}

// ===== 2. syncNotes / scheduleEnabled / showRibbonIcon: Boolean(value) =====
console.log("\n--- syncNotes / scheduleEnabled / showRibbonIcon: Boolean(value) ---");
const falsyInputs: Array<[unknown, string]> = [
  [0, "0"],
  [false, "false"],
  ["", "''"],
  [null, "null"],
  [undefined, "undefined"],
  [NaN, "NaN"],
];
const truthyInputs: Array<[unknown, string]> = [
  [1, "1"],
  [true, "true"],
  ["x", "'x'"],
  ["false", "'false'（非空字符串为真）"],
  [" ", "' '（空白字符串为真）"],
  [2, "2"],
  [42, "42"],
  ["anything", "'anything'"],
  [{}, "{}"],
  [[], "[]"],
];
for (const key of ["syncNotes", "scheduleEnabled", "showRibbonIcon"] as const) {
  for (const [input, label] of falsyInputs) {
    assertStrictEq(normalize(key, input), false, `${key}: ${label} -> false`);
  }
  for (const [input, label] of truthyInputs) {
    assertStrictEq(normalize(key, input), true, `${key}: ${label} -> true`);
  }
}

// ===== 3. attachmentMode: String(value)（不 trim） =====
console.log("\n--- attachmentMode: String(value)（不 trim） ---");
assertStrictEq(normalize("attachmentMode", "per-kb"), "per-kb", "attachmentMode: 'per-kb' -> 'per-kb'");
assertStrictEq(
  normalize("attachmentMode", "obsidian-global"),
  "obsidian-global",
  "attachmentMode: 'obsidian-global' -> 'obsidian-global'",
);
assertStrictEq(
  normalize("attachmentMode", "  per-kb  "),
  "  per-kb  ",
  "attachmentMode: '  per-kb  ' -> '  per-kb  '（不 trim，区别于 clientId）",
);
assertStrictEq(normalize("attachmentMode", 123), "123", "attachmentMode: 123 -> '123'");
assertStrictEq(normalize("attachmentMode", 0), "0", "attachmentMode: 0 -> '0'");
assertStrictEq(normalize("attachmentMode", true), "true", "attachmentMode: true -> 'true'");
assertStrictEq(normalize("attachmentMode", null), "null", "attachmentMode: null -> 'null'");
assertStrictEq(normalize("attachmentMode", undefined), "undefined", "attachmentMode: undefined -> 'undefined'");

// ===== 4. default: 原值返回（不归一化） =====
console.log("\n--- default: 原值返回 ---");
assertStrictEq(normalize("apiKey", "abc"), "abc", "apiKey: 'abc' -> 'abc'");
assertStrictEq(normalize("apiKey", "  abc  "), "  abc  ", "apiKey: '  abc  ' -> '  abc  '（default 不 trim）");
assertStrictEq(normalize("scheduleValue", 30), 30, "scheduleValue: 30 -> 30（数字保留）");
assertStrictEq(normalize("scheduleValue", "30"), "30", "scheduleValue: '30' -> '30'（不转数字）");
assertStrictEq(normalize("scheduleUnit", "minutes"), "minutes", "scheduleUnit: 'minutes' -> 'minutes'");
const kbs = [{ kb_id: "k1", kb_name: "n1" }];
assertStrictEq(normalize("selectedKbs", kbs), kbs, "selectedKbs: 数组引用保持不变");
const obj = { a: 1 };
assertStrictEq(normalize("selectedKbs", obj), obj, "selectedKbs: 对象引用保持不变");
assertStrictEq(normalize("unknownKey", 42), 42, "unknownKey: 42 -> 42");
assertStrictEq(normalize("unknownKey", "x"), "x", "unknownKey: 'x' -> 'x'");
assertStrictEq(normalize("", "anything"), "anything", "空 key: 走 default 分支");

// ===== 5. 边界：key 大小写敏感（未命中应走 default） =====
console.log("\n--- 边界：key 大小写敏感 ---");
assertStrictEq(normalize("ClientId", "  abc  "), "  abc  ", "'ClientId'（大写 C）未命中 -> default 不 trim");
assertStrictEq(normalize("CLIENTID", "  abc  "), "  abc  ", "'CLIENTID' 未命中 -> default 不 trim");
assertStrictEq(normalize("syncnotes", 0), 0, "'syncnotes'（全小写）未命中 -> default 保留 0");

// ===== 结果 =====
console.log(`\n${"=".repeat(40)}`);
console.log(`结果: ${pass} 通过, ${fail} 失败`);
if (fail > 0) process.exit(1);
