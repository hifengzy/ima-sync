/**
 * 验证 FR-13 配额错误识别逻辑（isQuotaExceededResponse + ImaQuotaExceededError）。
 * 真实 API 配额超限是临时状态，用单元测试覆盖各场景。
 *
 * 运行：npx esbuild test/verify-quota.ts --bundle --platform=node --format=esm --outfile=test/verify-quota.mjs --external:obsidian && node test/verify-quota.mjs
 */
import { ImaQuotaExceededError, isQuotaExceededResponse } from "../src/api/errors";
import type { ImaResponse } from "../src/api/types";

const cases: Array<{
  status: number;
  body: ImaResponse<unknown> | undefined;
  expect: boolean;
  label: string;
}> = [
  { status: 403, body: { code: 200005, msg: "请求超量，请明日再试", data: {} }, expect: true, label: "403+code200005" },
  { status: 403, body: undefined, expect: true, label: "403无body" },
  { status: 403, body: { code: 0, msg: "success", data: {} }, expect: true, label: "403+code0（仍按配额）" },
  { status: 200, body: { code: 0, msg: "success", data: {} }, expect: false, label: "200正常" },
  { status: 400, body: { code: 0, msg: "bad request", data: {} }, expect: false, label: "400非配额" },
  { status: 500, body: undefined, expect: false, label: "500服务器错误" },
  { status: 200, body: { code: 200005, msg: "请求超量", data: {} }, expect: true, label: "200但code200005" },
];

let pass = 0;
for (const c of cases) {
  const r = isQuotaExceededResponse(c.status, c.body);
  const ok = r === c.expect;
  console.log(`${ok ? "✓" : "✗"} ${c.label} -> ${r} (期望 ${c.expect})`);
  if (!ok) process.exit(1);
  pass++;
}

const err = new ImaQuotaExceededError("请求超量，请明日再试");
if (!(err instanceof Error) || err.name !== "ImaQuotaExceededError" || !err.message.includes("请求超量")) {
  console.log("✗ ImaQuotaExceededError 构造异常");
  process.exit(1);
}
console.log(`✓ ImaQuotaExceededError: instanceof Error, name=${err.name}, msg="${err.message}"`);

console.log(`\n✓ 配额错误识别逻辑验证通过（${pass} 用例）`);
