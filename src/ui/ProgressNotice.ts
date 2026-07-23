/**
 * 同步进度与汇总通知（对应开发方案 7.5 / PRD FR-11）。
 */
import { Notice } from "obsidian";
import type { SyncStats } from "../sync/SyncManager";

/** 同步开始通知（FR-11.1） */
export function showSyncStart(): void {
  new Notice("ima 同步开始…", 4000);
}

/** 同步结束汇总通知（FR-11.2） */
export function showSyncSummary(stats: SyncStats): void {
  new Notice(
    `同步完成：新增 ${stats.created} / 更新 ${stats.updated} / 跳过 ${stats.skipped} / 失败 ${stats.failed}`,
    8000,
  );
}

/** 通用提示 */
export function showToast(message: string, timeout = 5000): void {
  new Notice(message, timeout);
}
