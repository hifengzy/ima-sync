/**
 * 同步状态索引（对应开发方案 5.5 / PRD 7.3）。
 *
 * 独立存储于插件目录 sync-index.json，避免 data.json 膨胀（FR-6.6）。
 * 主键 doc_id，记录本地路径、kb_id、标题、media_type、ima 侧 update_time、synced_at。
 * 仅用于智能更新的 update_time 比对，不持久化分页游标。
 */
import { Notice, type App } from "obsidian";
import { SYNC_INDEX_FILENAME } from "../constants";
import { logger } from "../utils/logger";

export interface SyncIndexEntry {
  /** 仓库内相对路径（.md 文件） */
  path: string;
  kb_id: string;
  title: string;
  media_type: number;
  /** ima 侧更新时间（秒，字符串；wiki 条目无此字段则为空） */
  update_time: string;
  /** 本次同步时间 ISO */
  synced_at: string;
}

export type SyncIndexMap = Record<string, SyncIndexEntry>;

export class SyncIndex {
  private entries: SyncIndexMap = {};
  private readonly indexPath: string;
  private dirty = false;

  constructor(private readonly app: App, pluginId: string) {
    const configDir = app.vault.configDir;
    this.indexPath = `${configDir}/plugins/${pluginId}/${SYNC_INDEX_FILENAME}`;
  }

  async load(): Promise<void> {
    try {
      if (await this.app.vault.adapter.exists(this.indexPath)) {
        const raw = await this.app.vault.adapter.read(this.indexPath);
        this.entries = raw ? (JSON.parse(raw) as SyncIndexMap) : {};
      }
    } catch (e) {
      logger.warn("同步索引加载失败，使用空索引", e);
      new Notice("ima-sync: 同步索引文件已损坏，将执行全量同步。如产生重复文件，请先清空缓存后再同步。", 10000);
      this.entries = {};
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    try {
      await this.app.vault.adapter.write(this.indexPath, JSON.stringify(this.entries, null, 2));
      this.dirty = false;
    } catch (e) {
      logger.error("同步索引保存失败", e);
    }
  }

  has(docId: string): boolean {
    return Boolean(this.entries[docId]);
  }

  get(docId: string): SyncIndexEntry | undefined {
    return this.entries[docId];
  }

  upsert(docId: string, entry: SyncIndexEntry): void {
    this.entries[docId] = entry;
    this.dirty = true;
  }

  remove(docId: string): void {
    if (this.entries[docId]) {
      delete this.entries[docId];
      this.dirty = true;
    }
  }

  /** 清空全部索引记录（标记 dirty，需 save 落盘；FR-12 缓存清理） */
  clear(): void {
    this.entries = {};
    this.dirty = true;
  }

  /** 当前索引条目数 */
  size(): number {
    return Object.keys(this.entries).length;
  }
}
