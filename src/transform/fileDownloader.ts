/**
 * 文件下载（PDF/PPT/Word/Excel 等二进制原文，对应开发方案 6.3 / PRD FR-7.5）。
 *
 * 不转换内容，直接下载原文存入知识库同步目录；
 * 扩展名按下载响应 Content-Type 推断，URL 扩展名兜底。
 */
import type { App } from "obsidian";
import { normalizePath, TFile } from "obsidian";
import type { ImaClient } from "../api/imaClient";
import { ensureFolder } from "../utils/path";
import { logger } from "../utils/logger";

export interface DownloadedFile {
  /** 仓库内完整路径 */
  path: string;
  /** 含扩展名的文件名 */
  filename: string;
  ext: string;
  contentType: string;
}

const FILE_CONTENT_TYPE_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": "dotx",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": "ppsx",
  "application/vnd.ms-xpsdocument": "xps",
  "application/vnd.ms-visio.drawing": "vsdx",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/html": "html",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/vnd.rar": "rar",
  "application/x-7z-compressed": "7z",
  "application/octet-stream": "",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
};

/** 推断文件扩展名：Content-Type 优先，URL 扩展名兜底，最终 "bin" */
export function inferFileExt(contentType: string, url: string): string {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (ct && FILE_CONTENT_TYPE_EXT[ct] !== undefined && FILE_CONTENT_TYPE_EXT[ct] !== "") {
    return FILE_CONTENT_TYPE_EXT[ct];
  }
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    const m = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (m) return m[1].toLowerCase();
  } catch {
    // 非标准 URL，忽略
  }
  return ct && FILE_CONTENT_TYPE_EXT[ct] ? FILE_CONTENT_TYPE_EXT[ct] : "bin";
}

export async function downloadFile(opts: {
  app: App;
  client: ImaClient;
  url: string;
  headers?: Record<string, string>;
  destDir: string;
  baseName: string;
}): Promise<DownloadedFile> {
  const { app, client, url, headers, destDir, baseName } = opts;
  const result = await client.fetchUrl(url, headers);
  return saveFileFromBuffer({
    app,
    destDir,
    baseName,
    buffer: result.arrayBuffer,
    contentType: result.contentType,
    url,
  });
}

/** 保存已抓取的二进制缓冲为文件（不发起请求，供 SyncManager 复用） */
export async function saveFileFromBuffer(opts: {
  app: App;
  destDir: string;
  baseName: string;
  buffer: ArrayBuffer;
  contentType: string;
  url: string;
}): Promise<DownloadedFile> {
  const { app, destDir, baseName, buffer, contentType, url } = opts;
  const ext = inferFileExt(contentType, url);
  const filename = `${baseName}.${ext}`;
  const fullPath = normalizePath(`${destDir}/${filename}`);

  await ensureFolder(app, destDir);

  const existing = app.vault.getAbstractFileByPath(fullPath);
  if (existing instanceof TFile) {
    await app.vault.modifyBinary(existing, buffer);
  } else if (!existing) {
    await app.vault.createBinary(fullPath, buffer);
  }

  logger.debug(`文件已保存: ${filename} (${contentType || "未知类型"})`);
  return { path: fullPath, filename, ext, contentType };
}
