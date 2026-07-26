/**
 * 日志工具：带插件前缀，便于排查（NFR-5.3）。
 * 统一入口，方便后续切换为文件日志或可观测层。
 */

const LABEL = "[imasync]";

export const logger = {
  debug(...args: unknown[]): void {
    console.debug(LABEL, ...args);
  },
  info(...args: unknown[]): void {
    console.info(LABEL, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(LABEL, ...args);
  },
  error(...args: unknown[]): void {
    console.error(LABEL, ...args);
  },
};

/** 将 unknown 错误安全转为消息字符串 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
