/**
 * ima API 错误类型（对应开发方案 4.4 / PRD FR-13）。
 *
 * ImaQuotaExceededError：每日请求配额超限（HTTP 403 / code=200005 / msg「请求超量」）。
 * 触发后应立即中止同步并提示用户，避免逐条失败浪费配额。
 */
import type { ImaResponse } from "./types";

/** ima 配额超限错误（不可重试，需中止同步） */
export class ImaQuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImaQuotaExceededError";
  }
}

/**
 * 从 HTTP 状态与响应体判断是否配额超限。
 * 实测 ima 限流返回 HTTP 403 + code=200005 + msg「请求超量，请明日再试」。
 */
export function isQuotaExceededResponse(
  _status: number,
  body: ImaResponse<unknown> | undefined,
): boolean {
  if (body?.code === 200005) return true;
  if (body?.msg && body.msg.includes("请求超量")) return true;
  return false;
}
