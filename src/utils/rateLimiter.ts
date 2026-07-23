/**
 * 限流与重试（对应开发方案 4.4 / NFR-1.1~1.3）。
 *
 * RateLimiter 串行化所有请求，保证两次请求间隔不小于 minIntervalMs（2 QPS -> 500ms）。
 * execute() 在可重试失败时按指数退避（1s->2s->4s，上限 8s）重试，最多 maxRetries 次。
 * 调用方通过 RequestOutcome 告知结果类别，限流器据此决定重试或抛出。
 */
import { BACKOFF_BASE_MS, BACKOFF_CAP_MS, DEFAULT_QPS, MAX_RETRIES } from "../constants";

export type RequestOutcome<T> =
  | { kind: "success"; value: T }
  | { kind: "retryable"; error: string }
  | { kind: "fatal"; error: string };

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 指数退避时长：1s -> 2s -> 4s，上限 8s */
export function computeBackoff(attempt: number, base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS): number {
  return Math.min(base * Math.pow(2, attempt - 1), cap);
}

/** HTTP 状态码是否可重试（429 / 5xx） */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export interface RateLimiterOptions {
  qps?: number;
  maxRetries?: number;
}

export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private lastRequestTime = 0;
  /** 串行队列，确保节流不被并发请求绕过 */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(opts: RateLimiterOptions = {}) {
    const qps = opts.qps ?? DEFAULT_QPS;
    this.minIntervalMs = Math.ceil(1000 / qps);
    this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
  }

  /** 节流：确保距上次请求至少 minIntervalMs */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minIntervalMs) {
      await sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * 串行 + 节流 + 重试地执行一次请求。
   * @param fn 执行实际 HTTP 调用，返回结果类别
   * @returns 成功值；fatal 立即抛出；retryable 用尽后抛出最后一次错误
   */
  async execute<T>(fn: () => Promise<RequestOutcome<T>>): Promise<T> {
    // 入串行队列：同一时刻只有一个请求在 throttle + fn 阶段
    const run = this.chain.then(async () => {
      let attempt = 0;
      let lastError = "未知错误";
      while (attempt <= this.maxRetries) {
        if (attempt > 0) {
          await sleep(computeBackoff(attempt));
        }
        await this.throttle();
        const outcome = await fn();
        if (outcome.kind === "success") {
          return outcome.value;
        }
        if (outcome.kind === "fatal") {
          throw new Error(outcome.error);
        }
        lastError = outcome.error;
        attempt++;
      }
      throw new Error(lastError);
    });
    // 不让单次失败断链：无论成败都续上下一个
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return (run as Promise<T>).catch((err) => {
      throw err;
    });
  }
}
