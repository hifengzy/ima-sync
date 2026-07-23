/**
 * 图片下载与引用本地化（对应开发方案 6.2 / PRD FR-7.2~7.4）。
 *
 * 流程：
 *  - 提取 Markdown `![](url)` 与 HTML `<img src>` 引用
 *  - 下载（http(s) 经 client.fetchUrl；data: URI 直接解码）
 *  - 按 Content-Type 推断扩展名，命名 {doc_id}-{序号}.{ext} 防冲突
 *  - 替换为 ![[文件名]]（Obsidian 原生嵌入）
 *  - 失败保留原外链，不阻断同步（FR-7.4）
 */
import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import type { ImaClient } from "../api/imaClient";
import { ensureFolder, getDocIdPrefix } from "../utils/path";
import { logger } from "../utils/logger";

export interface ImageLocalizeResult {
  content: string;
  downloaded: number;
  failed: number;
}

const IMAGE_CONTENT_TYPE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/tiff": "tiff",
};

function inferImageExt(contentType: string, url: string): string {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (ct && IMAGE_CONTENT_TYPE_EXT[ct]) return IMAGE_CONTENT_TYPE_EXT[ct];
  const m = url.match(/\.([a-zA-Z0-9]{2,4})(?:$|\?|#)/);
  if (m) return m[1].toLowerCase();
  return "png";
}

function decodeDataUri(uri: string): { ext: string; buffer: ArrayBuffer } | null {
  const m = uri.match(/^data:([\w/+.-]+);base64,(.*)$/);
  if (!m) return null;
  try {
    const binary = atob(m[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = inferImageExt(m[1], "");
    return { ext, buffer: bytes.buffer };
  } catch {
    return null;
  }
}

export async function localizeImages(opts: {
  app: App;
  client: ImaClient;
  content: string;
  attachmentDir: string;
  docId: string;
}): Promise<ImageLocalizeResult> {
  const { app, client, content, attachmentDir, docId } = opts;
  const docPrefix = getDocIdPrefix(docId);

  // 收集所有图片 URL（markdown + html img），去重保序
  const urls: string[] = [];
  const seen = new Set<string>();
  const mdImgRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const htmlImgRe = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = mdImgRe.exec(content)) !== null) {
    if (!seen.has(m[2])) {
      seen.add(m[2]);
      urls.push(m[2]);
    }
  }
  while ((m = htmlImgRe.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      urls.push(m[1]);
    }
  }

  if (urls.length === 0) {
    return { content, downloaded: 0, failed: 0 };
  }

  await ensureFolder(app, attachmentDir);

  const urlToFilename = new Map<string, string>();
  let downloaded = 0;
  let failed = 0;
  let index = 1;

  for (const url of urls) {
    // data: URI
    if (url.startsWith("data:")) {
      const decoded = decodeDataUri(url);
      if (decoded) {
        const filename = `${docPrefix}-${index}.${decoded.ext}`;
        await writeBinary(app, normalizePath(`${attachmentDir}/${filename}`), decoded.buffer);
        urlToFilename.set(url, filename);
        downloaded++;
        index++;
        continue;
      }
      failed++;
      continue;
    }

    // http(s)
    try {
      const result = await client.fetchUrl(url);
      const ext = inferImageExt(result.contentType, url);
      const filename = `${docPrefix}-${index}.${ext}`;
      await writeBinary(app, normalizePath(`${attachmentDir}/${filename}`), result.arrayBuffer);
      urlToFilename.set(url, filename);
      downloaded++;
      index++;
    } catch (e) {
      failed++;
      logger.warn(`图片下载失败，保留外链: ${url}`, e);
    }
  }

  // 替换引用：markdown ![alt](url) -> ![[filename|alt]]；html <img src=url> -> ![[filename]]
  let replaced = content.replace(mdImgRe, (full, alt, url) => {
    const fn = urlToFilename.get(url);
    if (!fn) return full;
    const altText = alt ? `|${alt}` : "";
    return `![[${fn}${altText}]]`;
  });
  replaced = replaced.replace(htmlImgRe, (full, url) => {
    const fn = urlToFilename.get(url);
    return fn ? `![[${fn}]]` : full;
  });

  return { content: replaced, downloaded, failed };
}

/** 写二进制：已存在则跳过（幂等，避免重复写盘） */
async function writeBinary(app: App, path: string, buffer: ArrayBuffer): Promise<void> {
  if (app.vault.getAbstractFileByPath(path)) return;
  await app.vault.createBinary(path, buffer);
}
