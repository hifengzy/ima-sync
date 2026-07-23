/**
 * 路径与文件名工具（对应开发方案 6.5 / 8 / utils/path.ts）。
 */
import { App, TFile, normalizePath } from "obsidian";
import { ATTACHMENT_DIR_NAME, ILLEGAL_FILENAME_CHARS } from "../constants";
import type { ImaSyncSettings, ScheduleUnit } from "../settings/types";

export { normalizePath };

/**
 * Obsidian Vault.getConfig 运行时存在但未在类型定义中暴露
 * （参考 obsidian.d.ts 中 this.app.vault.getConfig 注释）。用类型转换安全访问。
 */
interface VaultConfigAccessor {
  getConfig(name: string): unknown;
}

/** 文件名清洗：替换非法字符、去首尾空格与点、截断（PRD FR-4.5） */
export function sanitizeFileName(name: string, maxLen = 120): string {
  const cleaned = (name ?? "")
    .replace(ILLEGAL_FILENAME_CHARS, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
  const truncated = cleaned.substring(0, maxLen).trim();
  return truncated.length > 0 ? truncated : "untitled";
}

/** 空标题回退：untitled-{doc_id}（PRD FR-4.6） */
export function fallbackTitle(docId: string): string {
  return `untitled-${getDocIdPrefix(docId)}`;
}

/** 取 doc_id 前 8 位用于冲突消歧（PRD FR-4.6） */
export function getDocIdPrefix(docId: string, len = 8): string {
  return (docId ?? "").substring(0, len);
}

/** 递归创建文件夹（已存在则跳过，被文件占用则抛错） */
export async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const normalized = normalizePath(folderPath);
  if (!normalized || normalized === "/") return;
  const parts = normalized.split("/").filter((p) => p.length > 0);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) {
      await app.vault.createFolder(current);
    } else if (existing instanceof TFile) {
      throw new Error(`路径 ${current} 已被文件占用，无法创建文件夹`);
    }
  }
}

/**
 * 读取 Obsidian 全局附件目录配置（newFileLocation + attachmentFolderPath）。
 * 返回去空白后的 attachmentFolderPath；为空表示全局未配置。
 */
export function getGlobalAttachmentFolderPath(app: App): string {
  const folder =
    ((app.vault as unknown as VaultConfigAccessor).getConfig("attachmentFolderPath") as
      | string
      | undefined) ?? "";
  return folder.trim();
}

/** 全局附件目录是否已配置（attachmentFolderPath 去空白后非空） */
export function isGlobalAttachmentConfigured(app: App): boolean {
  return getGlobalAttachmentFolderPath(app).length > 0;
}

/**
 * 设置页回显用：仅读全局配置，不依赖 kbName（PRD FR-8.4）。
 * - 全局已配置 -> 返回解析路径
 * - 全局未配置 -> 返回 null（UI 显示回退提示）
 */
export function resolveGlobalAttachmentDirForDisplay(app: App): string | null {
  const folder = getGlobalAttachmentFolderPath(app);
  if (!folder) return null;
  return normalizePath(folder);
}

export interface ResolvedAttachmentDir {
  dir: string;
  /** 是否从全局模式回退到 per-kb（全局未配置时为 true） */
  fellBack: boolean;
}

/**
 * 同步时用：按 attachmentMode 解析附件落地目录（开发方案 6.5）。
 * - per-kb：syncRootPath/<kbName>/attachments
 * - obsidian-global：全局已配置 -> 全局目录；未配置 -> 回退 per-kb 路径
 */
export function resolveAttachmentDir(
  app: App,
  settings: ImaSyncSettings,
  kbName: string,
): ResolvedAttachmentDir {
  if (settings.attachmentMode === "per-kb") {
    return {
      dir: normalizePath(`${settings.syncRootPath}/${kbName}/${ATTACHMENT_DIR_NAME}`),
      fellBack: false,
    };
  }
  const folder = getGlobalAttachmentFolderPath(app);
  if (folder) {
    return { dir: normalizePath(folder), fellBack: false };
  }
  // 全局未配置 -> 回退 per-kb
  return {
    dir: normalizePath(`${settings.syncRootPath}/${kbName}/${ATTACHMENT_DIR_NAME}`),
    fellBack: true,
  };
}

/**
 * 时间戳归一化：ima 各接口时间戳单位不一致（笔记为毫秒 13 位，wiki 部分为秒 10 位）。
 * 返回秒（number）；无法解析返回 0。
 */
export function normalizeTimestampToSeconds(ts: string | number | undefined | null): number {
  if (ts === undefined || ts === null) return 0;
  const num = typeof ts === "number" ? ts : parseInt(String(ts), 10);
  if (!Number.isFinite(num) || num <= 0) return 0;
  // 大于 1e12 视为毫秒
  return num > 1e12 ? Math.floor(num / 1000) : num;
}

/** 秒级时间戳 -> ISO 字串 YYYY-MM-DDTHH:mm:ss */
export function secondsToIso(seconds: number): string {
  if (!seconds) return "";
  const d = new Date(seconds * 1000);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

/** 任意 ima 时间戳 -> ISO 字串（秒/毫秒自适应） */
export function timestampToIso(ts: string | number | undefined | null): string {
  return secondsToIso(normalizeTimestampToSeconds(ts));
}

/** 调度频次换算为毫秒（开发方案 5.3） */
export function scheduleToMs(value: number, unit: ScheduleUnit): number {
  const v = Math.max(1, Math.floor(value));
  switch (unit) {
    case "minutes":
      return v * 60 * 1000;
    case "hours":
      return v * 3600 * 1000;
    case "days":
      return v * 86400 * 1000;
  }
}

/**
 * 频次下限保护：minutes 单位下小于 5 按 5 处理（PRD FR-5.4）。
 * 返回实际生效的 {value, unit, clamped}。
 */
export function clampSchedule(value: number, unit: ScheduleUnit): {
  value: number;
  unit: ScheduleUnit;
  clamped: boolean;
} {
  if (unit === "minutes" && value < 5) {
    return { value: 5, unit, clamped: true };
  }
  return { value, unit, clamped: false };
}
