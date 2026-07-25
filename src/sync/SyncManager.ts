/**
 * 同步引擎：互斥、递归文件夹、智能更新、内容落地（对应开发方案第五节）。
 *
 * 主流程 triggerSync：
 *  1. 互斥检查（SyncState）-> 进行中则跳过
 *  2. 校验配置
 *  3. 逐知识库递归同步 -> 笔记同步 -> 汇总
 *
 * 智能更新（FR-6）：
 *  - 独立笔记：用 modify_time 比对（API 提供毫秒时间戳）
 *  - wiki 条目：API 列表与 media_info 均不返回 update_time -> 采用「存在即跳过」
 *    （API 客观限制；media_info 偶返回 update_time 时则按时间比对）
 */
import type { App } from "obsidian";
import { TFile, normalizePath } from "obsidian";
import type { ImaClient } from "../api/imaClient";
import { ImaApi } from "../api/endpoints";
import type { KnowledgeListItem, MediaInfo, NoteBasicInfo } from "../api/types";
import { isFolder, isNoteType, NOTES_DIR_NAME } from "../constants";
import type { ImaSyncSettings, SelectedKb } from "../settings/types";
import { SyncIndex } from "./SyncIndex";
import { SyncState } from "./SyncState";
import {
  ensureFolder,
  fallbackTitle,
  getDocIdPrefix,
  normalizeTimestampToSeconds,
  resolveAttachmentDir,
  sanitizeFileName,
  toDateString,
} from "../utils/path";
import { logger, errorMessage } from "../utils/logger";
import { convertToMarkdown } from "../transform/htmlToMarkdown";
import { localizeImages } from "../transform/imageDownloader";
import { saveFileFromBuffer } from "../transform/fileDownloader";
import { extractFromHtml } from "../transform/webArticle";
import {
  buildFrontmatterYaml,
  buildMarkdownWithFrontmatter,
  updateFrontmatter,
  type FrontmatterProps,
} from "../transform/frontmatter";
import { DEFAULT_TAG } from "../constants";
import { showSyncStart, showSyncSummary, showToast } from "../ui/ProgressNotice";
import { ImaQuotaExceededError } from "../api/errors";

export interface SyncStats {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const emptyStats = (): SyncStats => ({ created: 0, updated: 0, skipped: 0, failed: 0, errors: [] });

export class SyncManager {
  private readonly api: ImaApi;
  private stats: SyncStats = emptyStats();
  /** API 配额超限标志，置位后中止后续同步（FR-13） */
  private quotaExceeded = false;

  constructor(
    private readonly app: App,
    private readonly client: ImaClient,
    private readonly index: SyncIndex,
    private readonly state: SyncState,
    private readonly getSettings: () => ImaSyncSettings,
  ) {
    this.api = new ImaApi(client);
  }

  /** 触发一次同步（互斥） */
  async triggerSync(): Promise<SyncStats> {
    if (!this.state.start()) {
      showToast("同步进行中，跳过", 4000);
      return emptyStats();
    }

    const settings = this.getSettings();
    const validateError = this.validateConfig(settings);
    if (validateError) {
      showToast(validateError, 8000);
      this.state.stop();
      return emptyStats();
    }

    this.stats = emptyStats();
    this.quotaExceeded = false;
    showSyncStart();
    logger.info("同步开始");

    try {
      await this.index.load();
      await ensureFolder(this.app, settings.syncRootPath);

      for (const kb of settings.selectedKbs) {
        if (this.quotaExceeded) break;
        try {
          await this.syncKnowledgeBase(kb);
          await this.index.save();
        } catch (e) {
          if (this.handleQuotaError(e)) break;
          this.recordFailure(`知识库「${kb.kb_name}」`, e);
        }
      }

      if (settings.syncNotes && !this.quotaExceeded) {
        try {
          await this.syncNotes();
          await this.index.save();
        } catch (e) {
          if (!this.handleQuotaError(e)) {
            this.recordFailure("独立笔记", e);
          }
        }
      }

      this.emitSummary();
    } catch (e) {
      if (!this.handleQuotaError(e)) {
        logger.error("同步异常", e);
        showToast(`同步异常：${errorMessage(e)}`, 8000);
      }
    } finally {
      this.state.stop();
      logger.info("同步结束", this.stats);
    }

    return this.stats;
  }

  private validateConfig(s: ImaSyncSettings): string | null {
    if (!s.clientId.trim() || !s.apiKey.trim()) return "请先填写 ima Client ID 与 API Key";
    if (!s.syncRootPath.trim()) return "请先配置同步根目录";
    if (s.selectedKbs.length === 0 && !s.syncNotes) return "请至少选择一个知识库或开启笔记同步";
    return null;
  }

  // ===== 知识库同步 =====

  private async syncKnowledgeBase(kb: SelectedKb): Promise<void> {
    const settings = this.getSettings();
    const kbPath = normalizePath(`${settings.syncRootPath}/${kb.kb_name}`);
    await ensureFolder(this.app, kbPath);
    logger.info(`同步知识库: ${kb.kb_name}`);
    await this.syncFolder(kb.kb_id, "", kbPath, kb);
  }

  /** 递归同步某层级（保留 ima 文件夹层级） */
  private async syncFolder(
    kbId: string,
    folderId: string,
    parentPath: string,
    kb: SelectedKb,
  ): Promise<void> {
    const { items } = await this.api.listKnowledgeLevel(kbId, folderId);
    for (const item of items) {
      if (this.quotaExceeded) break;
      if (isFolder(item.media_type) || item.media_id.startsWith("folder_")) {
        const subName = sanitizeFileName(item.title) || fallbackTitle(item.media_id);
        const subPath = normalizePath(`${parentPath}/${subName}`);
        await ensureFolder(this.app, subPath);
        await this.syncFolder(kbId, item.media_id, subPath, kb);
        continue;
      }
      await this.syncWikiItem(kb, item, parentPath);
    }
  }

  private async syncWikiItem(kb: SelectedKb, item: KnowledgeListItem, parentPath: string): Promise<void> {
    const docId = item.media_id;
    let mediaInfo: MediaInfo;
    try {
      mediaInfo = await this.api.getMediaInfo(docId);
    } catch (e) {
      if (this.handleQuotaError(e)) return;
      this.recordFailure(item.title, e);
      return;
    }

    const remoteUpdateTime = mediaInfo.update_time ? normalizeTimestampToSeconds(mediaInfo.update_time) : 0;
    const action = this.decideAction(docId, remoteUpdateTime);
    if (action === "skip") {
      this.stats.skipped++;
      return;
    }

    try {
      const isNote = isNoteType(mediaInfo.media_type, mediaInfo.notebook_ext_info?.notebook_id);
      const url = mediaInfo.url_info?.url;
      if (isNote) {
        await this.syncWikiNote(kb, item, docId, mediaInfo, parentPath, action, remoteUpdateTime);
      } else if (url) {
        await this.syncUrlItem(kb, item, docId, url, mediaInfo.url_info?.headers, parentPath, action, remoteUpdateTime);
      } else {
        this.recordFailure(item.title, new Error("无 notebook_id 也无 url_info，无法获取内容"));
        return;
      }
      this.stats[action === "create" ? "created" : "updated"]++;
    } catch (e) {
      if (this.handleQuotaError(e)) return;
      this.recordFailure(item.title, e);
    }
  }

  /** 知识库内笔记：get_doc_content(notebook_id) */
  private async syncWikiNote(
    kb: SelectedKb,
    item: KnowledgeListItem,
    docId: string,
    mediaInfo: MediaInfo,
    parentPath: string,
    action: "create" | "update",
    remoteUpdateTime: number,
  ): Promise<void> {
    const notebookId = mediaInfo.notebook_ext_info?.notebook_id ?? docId;
    const raw = await this.api.getDocContent(notebookId);
    const body = await this.processNoteBody(raw, kb.kb_name, docId);
    const props = this.buildProps({ title: item.title, docId });
    await this.writeFile(parentPath, item.title, docId, action, body, props, kb.kb_id, remoteUpdateTime);
  }

  /** 链接 / 文件类：fetch URL -> 按 Content-Type 分支 */
  private async syncUrlItem(
    kb: SelectedKb,
    item: KnowledgeListItem,
    docId: string,
    url: string,
    headers: Record<string, string> | undefined,
    parentPath: string,
    action: "create" | "update",
    remoteUpdateTime: number,
  ): Promise<void> {
    const settings = this.getSettings();
    const resp = await this.client.fetchUrl(url, headers);
    const contentType = resp.contentType.toLowerCase();

    if (contentType.includes("text/html") && resp.text) {
      // 网页正文 -> Markdown
      const attachmentDir = resolveAttachmentDir(this.app, settings, kb.kb_name).dir;
      const result = await extractFromHtml({
        app: this.app,
        client: this.client,
        html: resp.text,
        url,
        title: item.title,
        docId,
        attachmentDir,
      });
      const props = this.buildProps({ title: item.title, source: url, docId });
      await this.writeFile(parentPath, item.title, docId, action, result.body, props, kb.kb_id, remoteUpdateTime);
      return;
    }

    // 二进制文件 -> 下载原文 + .md 占位
    const baseName = await this.resolveUniqueBaseName(parentPath, sanitizeFileName(item.title) || fallbackTitle(docId), docId);
    const saved = await saveFileFromBuffer({
      app: this.app,
      destDir: parentPath,
      baseName,
      buffer: resp.arrayBuffer,
      contentType: resp.contentType,
      url,
    });
    const body = `# ${item.title}\n\n> 文件类型：${saved.ext.toUpperCase()}\n\n[${saved.filename}](${saved.filename})\n`;
    const props = this.buildProps({ title: item.title, source: url, docId });
    await this.writeFile(parentPath, item.title, docId, action, body, props, kb.kb_id, remoteUpdateTime, baseName);
  }

  // ===== 笔记同步 =====

  private async syncNotes(): Promise<void> {
    const settings = this.getSettings();
    const notesPath = normalizePath(`${settings.syncRootPath}/${NOTES_DIR_NAME}`);
    await ensureFolder(this.app, notesPath);
    logger.info("同步独立笔记");
    const notes = await this.api.listAllNotes();
    for (const note of notes) {
      if (this.quotaExceeded) break;
      await this.syncNotebookNote(note, notesPath);
    }
  }

  private async syncNotebookNote(note: NoteBasicInfo, notesPath: string): Promise<void> {
    const docId = note.docid;
    const remoteUpdateTime = normalizeTimestampToSeconds(note.modify_time);
    const action = this.decideAction(docId, remoteUpdateTime);
    if (action === "skip") {
      this.stats.skipped++;
      return;
    }
    try {
      const raw = await this.api.getDocContent(docId);
      const body = await this.processNoteBody(raw, NOTES_DIR_NAME, docId);
      const props = this.buildProps({ title: note.title, docId });
      await this.writeFile(notesPath, note.title, docId, action, body, props, "", remoteUpdateTime);
      this.stats[action === "create" ? "created" : "updated"]++;
    } catch (e) {
      if (this.handleQuotaError(e)) return;
      this.recordFailure(note.title, e);
    }
  }

  // ===== 共享辅助 =====

  /** 笔记正文：转 Markdown + 图片本地化 */
  private async processNoteBody(raw: string, kbName: string, docId: string): Promise<string> {
    const settings = this.getSettings();
    let md = convertToMarkdown(raw);
    const attachmentDir = resolveAttachmentDir(this.app, settings, kbName).dir;
    const result = await localizeImages({ app: this.app, client: this.client, content: md, attachmentDir, docId });
    return result.content;
  }

  private decideAction(docId: string, remoteUpdateTimeSec: number): "create" | "update" | "skip" {
    const local = this.index.get(docId);
    if (!local) return "create";
    if (!remoteUpdateTimeSec) return "skip"; // API 未返回时间 -> 存在即跳过
    const localSec = parseInt(local.update_time, 10) || 0;
    return remoteUpdateTimeSec > localSec ? "update" : "skip";
  }

  private buildProps(args: { title: string; source?: string; docId: string }): FrontmatterProps {
    return {
      title: args.title || `untitled-${getDocIdPrefix(args.docId)}`,
      created: toDateString(Date.now()),
      source: args.source,
      tags: [DEFAULT_TAG],
    };
  }

  /**
   * 写文件：create 新建；update 复用索引路径覆盖正文 + 更新 frontmatter。
   * @param forcedBaseName 文件类内容需与原文同名，强制指定基础名
   */
  private async writeFile(
    parentPath: string,
    title: string,
    docId: string,
    action: "create" | "update",
    body: string,
    props: FrontmatterProps,
    kbId: string,
    remoteUpdateTime: number,
    forcedBaseName?: string,
  ): Promise<void> {
    let mdPath: string;
    let file: TFile | null = null;

    if (action === "update") {
      const indexed = this.index.get(docId);
      if (indexed) {
        const existing = this.app.vault.getAbstractFileByPath(indexed.path);
        if (existing instanceof TFile) {
          file = existing;
          mdPath = indexed.path;
        } else {
          mdPath = await this.resolveMdPath(parentPath, title, docId, forcedBaseName);
        }
      } else {
        mdPath = await this.resolveMdPath(parentPath, title, docId, forcedBaseName);
      }
    } else {
      mdPath = await this.resolveMdPath(parentPath, title, docId, forcedBaseName);
    }

    if (file) {
      await this.updateFile(file, body, props);
    } else {
      const content = buildMarkdownWithFrontmatter(props, body);
      await this.app.vault.create(normalizePath(mdPath), content);
    }

    this.index.upsert(docId, {
      path: mdPath,
      kb_id: kbId,
      title: props.title,
      media_type: 0,
      update_time: String(remoteUpdateTime || ""),
      synced_at: new Date().toISOString(),
    });
  }

  private async resolveMdPath(
    parentPath: string,
    title: string,
    docId: string,
    forcedBaseName?: string,
  ): Promise<string> {
    const base = forcedBaseName ?? (await this.resolveUniqueBaseName(parentPath, sanitizeFileName(title) || fallbackTitle(docId), docId));
    return normalizePath(`${parentPath}/${base}.md`);
  }

  /**
   * 同名冲突消歧：已有同名文件且非同 doc -> 追加 doc_id 前缀（FR-4.6）。
   * 通过 sync-index 反查归属，不依赖 frontmatter（避免污染文档元数据）。
   */
  private async resolveUniqueBaseName(parentPath: string, baseName: string, docId: string): Promise<string> {
    const path = normalizePath(`${parentPath}/${baseName}.md`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (!existing) return baseName;
    // 索引中当前 docId 已指向该路径 -> 同一文档，不冲突
    if (this.index.get(docId)?.path === path) return baseName;
    // 否则视为不同文档冲突，追加 doc_id 前缀
    const conflicted = `${baseName}-${getDocIdPrefix(docId)}`;
    const cPath = normalizePath(`${parentPath}/${conflicted}.md`);
    const cExisting = this.app.vault.getAbstractFileByPath(cPath);
    if (!cExisting || this.index.get(docId)?.path === cPath) return conflicted;
    return `${baseName}-${docId}`;
  }

  /** 更新已存在文件：保留 frontmatter 块 + 覆盖正文，再 processFrontMatter 更新字段（保留用户自定义属性） */
  private async updateFile(file: TFile, body: string, props: FrontmatterProps): Promise<void> {
    const oldContent = await this.app.vault.read(file);
    // 按行拆分定位 frontmatter 边界，避免正则 --- 内容匹配脆弱性
    const lines = oldContent.split(/\r?\n/);
    let fmEnd = -1;
    if (lines[0]?.trim() === "---") {
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim() === "---") {
          fmEnd = i;
          break;
        }
      }
    }
    const hasFrontmatter = fmEnd >= 0;
    const newContent = hasFrontmatter
      ? `${lines.slice(0, fmEnd + 1).join("\n")}\n\n${body.trimStart()}\n`
      : `---\n${buildFrontmatterYaml(props)}\n---\n\n${body}\n`;
    await this.app.vault.modify(file, newContent);
    await updateFrontmatter(this.app, file, props);
  }

  private recordFailure(title: string, e: unknown): void {
    this.stats.failed++;
    const msg = `${title}: ${errorMessage(e)}`;
    this.stats.errors.push(msg);
    logger.warn("同步失败:", msg);
  }

  private emitSummary(): void {
    showSyncSummary(this.stats);
    if (this.quotaExceeded) {
      showToast("因 API 配额超限，同步已中止。请明日重试。", 8000);
    }
    if (this.stats.failed > 0) {
      logger.warn("失败详情：", this.stats.errors);
    }
  }

  /** 处理配额超限错误：首次弹 Notice + 设标志。返回是否为配额错误（FR-13） */
  private handleQuotaError(e: unknown): boolean {
    if (e instanceof ImaQuotaExceededError) {
      if (!this.quotaExceeded) {
        this.quotaExceeded = true;
        showToast("请求超量，请明日再试", 8000);
        logger.warn("API 配额超限，中止同步");
      }
      return true;
    }
    return false;
  }
}
