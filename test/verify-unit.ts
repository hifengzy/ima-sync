/**
 * 单元测试：路径工具 / 频次换算 / frontmatter 构造 / 智能更新判定 / 限流重试
 *
 * 运行：npx esbuild test/verify-unit.ts --bundle --platform=node --format=esm
 *   --outfile=test/verify-unit.mjs --alias:obsidian=./test/mock-obsidian.ts && node test/verify-unit.mjs
 *
 * 覆盖 PRD 11.1 要求的 5 个模块。
 */
import {
  sanitizeFileName,
  fallbackTitle,
  getDocIdPrefix,
  normalizeTimestampToSeconds,
  secondsToIso,
  timestampToIso,
  scheduleToMs,
  clampSchedule,
} from "../src/utils/path";
import { buildFrontmatterYaml, buildMarkdownWithFrontmatter } from "../src/transform/frontmatter";
import { RateLimiter, computeBackoff, isRetryableStatus } from "../src/utils/rateLimiter";
import { isQuotaExceededResponse } from "../src/api/errors";
import type { ImaResponse } from "../src/api/types";

let pass = 0;
let fail = 0;

function assert(cond: boolean, label: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); process.exitCode = 1; }
}

// ===== 1. 路径工具 =====
console.log("\n--- sanitizeFileName ---");
assert(sanitizeFileName("Hello World") === "Hello World", "普通名称");
assert(sanitizeFileName("a/b:c*d?e\"f<g>h|i") === "a_b_c_d_e_f_g_h_i", "非法字符替换");
assert(sanitizeFileName("  spaces  ") === "spaces", "去首尾空格");
assert(sanitizeFileName(".hidden.") === "hidden", "去首尾点");
assert(sanitizeFileName("") === "untitled", "空名为 untitled");
assert(sanitizeFileName("a".repeat(200)).length <= 120, "超长截断");
assert(sanitizeFileName("   ...test...   ") === "test", "点+空格组合");

console.log("\n--- fallbackTitle ---");
assert(fallbackTitle("abc12345xyz").startsWith("untitled-"), "包含 untitled- 前缀");
assert(fallbackTitle("abc12345xyz").includes("abc12345"), "包含 docId 前缀");

console.log("\n--- getDocIdPrefix ---");
assert(getDocIdPrefix("abcdefgh12345678") === "abcdefgh", "取前8位");
assert(getDocIdPrefix("short") === "short", "不足8位全取");
assert(getDocIdPrefix("", 4) === "", "空串返回空");

console.log("\n--- normalizeTimestampToSeconds ---");
assert(normalizeTimestampToSeconds("1700000000") === 1700000000, "秒级字符串");
assert(normalizeTimestampToSeconds(1700000000000) === 1700000000, "毫秒级数字（>1e12）");
assert(normalizeTimestampToSeconds("1700000000000") === 1700000000, "毫秒级字符串");
assert(normalizeTimestampToSeconds(null) === 0, "null -> 0");
assert(normalizeTimestampToSeconds(undefined) === 0, "undefined -> 0");
assert(normalizeTimestampToSeconds("") === 0, "空串 -> 0");
assert(normalizeTimestampToSeconds(0) === 0, "0->0");

console.log("\n--- secondsToIso ---");
assert(secondsToIso(0) === "", "0秒返回空");
const iso = secondsToIso(1728000000);
assert(iso.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/) !== null, `ISO 格式正确: ${iso}`);

console.log("\n--- timestampToIso ---");
assert(timestampToIso(1728000000) === secondsToIso(1728000000), "秒级等价");
assert(timestampToIso(null) === "", "null 返回空");

// ===== 2. 频次换算 =====
console.log("\n--- scheduleToMs ---");
assert(scheduleToMs(1, "minutes") === 60_000, "1分钟=60s*1000");
assert(scheduleToMs(1, "hours") === 3_600_000, "1小时=3600s*1000");
assert(scheduleToMs(1, "days") === 86_400_000, "1天=86400s*1000");

console.log("\n--- clampSchedule ---");
assert(clampSchedule(30, "minutes").clamped === false, "30分钟不钳制");
assert(clampSchedule(3, "minutes").clamped === true, "3分钟钳制");
assert(clampSchedule(3, "minutes").value === 5, "钳制到5分钟");
assert(clampSchedule(3, "hours").clamped === false, "3小时不钳制（仅分钟单位）");

// ===== 3. frontmatter 构造 =====
console.log("\n--- buildFrontmatterYaml ---");
const fm1 = buildFrontmatterYaml({ title: "测试", created: "2026-01-01T00:00:00", tags: ["clippings"] });
assert(fm1.includes('title: "测试"'), "含 title");
assert(fm1.includes("created: 2026-01-01T00:00:00"), "含 created");
assert(fm1.includes("- clippings"), "含 tags");
assert(!fm1.includes("source:"), "无 source 字段（未提供）");

const fm2 = buildFrontmatterYaml({ title: "带源", created: "2026-01-01T00:00:00", source: "https://example.com", tags: ["clippings"] });
assert(fm2.includes('source: "https://example.com"'), "含 source");

const fm3 = buildFrontmatterYaml({ title: '带"引号"', created: "2026-01-01T00:00:00", tags: [] });
assert(fm3.includes("- clippings"), "空 tags 补默认");

console.log("\n--- buildMarkdownWithFrontmatter ---");
const md = buildMarkdownWithFrontmatter({ title: "标题", created: "", tags: ["a"] }, "正文");
assert(md.startsWith("---\n"), "以 --- 开头");
assert(md.includes("正文"), "含正文");
assert(md.split("---").length >= 3, "有两个 --- 分隔");

// ===== 4. 智能更新判定（decideAction） =====
console.log("\n--- decideAction 等价逻辑 ---");
function decideAction(localUpdateTime: string | null, remoteUpdateTime: number): "create" | "update" | "skip" {
  if (!localUpdateTime) return "create";
  if (!remoteUpdateTime) return "skip";
  const local = parseInt(localUpdateTime, 10) || 0;
  return remoteUpdateTime > local ? "update" : "skip";
}
assert(decideAction(null, 1000) === "create", "无本地记录 -> create");
assert(decideAction("500", 0) === "skip", "无远端时间 -> skip（存在即跳过）");
assert(decideAction("500", 1000) === "update", "远端更新 -> update");
assert(decideAction("1000", 500) === "skip", "远端更旧 -> skip");
assert(decideAction("1000", 1000) === "skip", "同等时间 -> skip");

// ===== 5. 限流重试 =====
console.log("\n--- isRetryableStatus ---");
assert(isRetryableStatus(429) === true, "429 可重试");
assert(isRetryableStatus(500) === true, "500 可重试");
assert(isRetryableStatus(503) === true, "503 可重试");
assert(isRetryableStatus(400) === false, "400 不可重试");
assert(isRetryableStatus(403) === false, "403 不可重试");

console.log("\n--- computeBackoff ---");
assert(computeBackoff(1) === 1000, "第1次退避 1s");
assert(computeBackoff(2) === 2000, "第2次退避 2s");
assert(computeBackoff(3) === 4000, "第3次退避 4s");
assert(computeBackoff(4) === 8000, "第4次退避 8s（达上限）");
assert(computeBackoff(5) === 8000, "第5次退避仍 8s（上限）");

console.log("\n--- RateLimiter 串行队列 ---");
(async () => {
  const limiter = new RateLimiter({ qps: 2, maxRetries: 1 });
  const r1 = await limiter.execute(async () => {
    await new Promise((r) => setTimeout(r, 10));
    return { kind: "success" as const, value: 1 };
  });
  assert(r1 === 1, "成功返回结果");
  const r2 = await limiter.execute(async () => ({ kind: "success" as const, value: 2 }));
  assert(r2 === 2, "第二次成功");

  console.log("\n--- RateLimiter 重试逻辑 ---");
  let callsRetry = 0;
  const limiterRetry = new RateLimiter({ qps: 10, maxRetries: 2 });
  const r3 = await limiterRetry.execute(async () => {
    callsRetry++;
    if (callsRetry < 2) return { kind: "retryable" as const, error: "临时失败" };
    return { kind: "success" as const, value: "retried" };
  });
  assert(r3 === "retried", "重试后成功");
  assert(callsRetry === 2, `重试两次调用，实际: ${callsRetry}`);

  // fatal 不重试
  const limiterFatal = new RateLimiter({ qps: 10, maxRetries: 0 });
  let callsFatal = 0;
  try {
    await limiterFatal.execute(async () => {
      callsFatal++;
      return { kind: "fatal" as const, error: "致命" };
    });
    assert(false, "fatal 应抛出");
  } catch (e) {
    assert((e as Error).message.includes("致命"), "fatal 抛出错误信息");
  }
  assert(callsFatal === 1, `fatal 只调用一次，实际: ${callsFatal}`);

  // ===== 6. 配额识别（isQuotaExceededResponse） =====
  console.log("\n--- isQuotaExceededResponse ---");
  const mkResp = (code: number, msg: string): ImaResponse<unknown> => ({ code, msg, data: {} });
  assert(isQuotaExceededResponse(403, mkResp(200005, "请求超量")) === true, "code=200005");
  assert(isQuotaExceededResponse(200, mkResp(200005, "请求超量")) === true, "200但code=200005");
  assert(isQuotaExceededResponse(200, mkResp(0, "请求超量，请明日再试")) === true, "msg含请求超量");
  assert(isQuotaExceededResponse(403, undefined) === false, "403无body不判配额");
  assert(isQuotaExceededResponse(200, mkResp(0, "ok")) === false, "正常200通过");

  // ===== 结果 =====
  console.log(`\n${"=".repeat(40)}`);
  console.log(`结果: ${pass} 通过, ${fail} 失败`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
