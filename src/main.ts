/**
 * 插件入口：生命周期、命令、ribbon、定时器、设置页注册（对应开发方案 2.2 / 7.3 / 7.4）。
 */
import { Plugin } from "obsidian";
import { ImaClient } from "./api/imaClient";
import { ImaApi } from "./api/endpoints";
import type { KbInfo } from "./api/types";
import { DEFAULT_SETTINGS } from "./settings/types";
import type { ImaSyncSettings } from "./settings/types";
import { ImaSyncSettingTab } from "./settings/SettingTab";
import { SyncIndex } from "./sync/SyncIndex";
import { SyncManager } from "./sync/SyncManager";
import { SyncState } from "./sync/SyncState";
import { showToast } from "./ui/ProgressNotice";
import { clampSchedule, scheduleToMs } from "./utils/path";
import { errorMessage, logger } from "./utils/logger";

export default class ImaSyncPlugin extends Plugin {
  settings!: ImaSyncSettings;
  private client!: ImaClient;
  private syncManager!: SyncManager;
  private readonly indexId = "ima-sync";
  private ribbonIconEl?: HTMLElement;
  private intervalId?: number;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.client = new ImaClient(this.settings.clientId, this.settings.apiKey);
    const index = new SyncIndex(this.app, this.indexId);
    const state = new SyncState();
    this.syncManager = new SyncManager(this.app, this.client, index, state, () => this.settings);

    // 命令：立即同步（FR-5.1）
    this.addCommand({
      id: "ima-sync-now",
      name: "同步 ima 知识库",
      callback: () => void this.triggerSync(),
    });

    // 命令：API 探针（调试，对应方案 Phase 1）
    this.addCommand({
      id: "ima-api-probe",
      name: "ima API 探针（调试，输出到控制台）",
      callback: () => void this.runProbe(),
    });

    this.applyRibbon();
    this.applySchedule();

    this.addSettingTab(new ImaSyncSettingTab(this.app, this));
    logger.info("插件已加载");
  }

  onunload(): void {
    if (this.intervalId !== undefined) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.ribbonIconEl?.remove();
    this.ribbonIconEl = undefined;
    logger.info("插件已卸载");
  }

  // ===== 设置持久化 =====

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<ImaSyncSettings> ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // ===== 同步触发 =====

  async triggerSync(): Promise<void> {
    this.client.configure(this.settings.clientId, this.settings.apiKey);
    if (!this.client.isConfigured()) {
      showToast("请先配置 ima Client ID 与 API Key", 5000);
      return;
    }
    await this.syncManager.triggerSync();
  }

  // ===== 验证连接 =====

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    this.client.configure(this.settings.clientId, this.settings.apiKey);
    if (!this.client.isConfigured()) {
      return { ok: false, message: "请先填写 Client ID 与 API Key" };
    }
    try {
      const data = await this.client.searchKnowledgeBase({ query: "", cursor: "", limit: 1 });
      const count = data.info_list?.length ?? 0;
      return { ok: true, message: count > 0 ? `连接成功，凭证有效` : "连接成功（暂无知识库）" };
    } catch (e) {
      return { ok: false, message: `连接失败：${errorMessage(e)}` };
    }
  }

  async listAllKnowledgeBases(): Promise<KbInfo[]> {
    this.client.configure(this.settings.clientId, this.settings.apiKey);
    return new ImaApi(this.client).listAllKnowledgeBases();
  }

  // ===== 调度与 ribbon =====

  applySchedule(): void {
    if (this.intervalId !== undefined) {
      window.clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    if (!this.settings.scheduleEnabled) return;
    const { value, unit, clamped } = clampSchedule(this.settings.scheduleValue, this.settings.scheduleUnit);
    if (clamped) {
      logger.info(`定时频次过低，已按 5 分钟处理`);
    }
    const ms = scheduleToMs(value, unit);
    this.intervalId = window.setInterval(() => void this.triggerSync(), ms);
  }

  applyRibbon(): void {
    this.ribbonIconEl?.remove();
    this.ribbonIconEl = undefined;
    if (this.settings.showRibbonIcon) {
      this.ribbonIconEl = this.addRibbonIcon("refresh-cw", "同步 ima 知识库", () => void this.triggerSync());
    }
  }

  // ===== 探针 =====

  private async runProbe(): Promise<void> {
    this.client.configure(this.settings.clientId, this.settings.apiKey);
    const api = new ImaApi(this.client);
    try {
      const kbs = await api.listAllKnowledgeBases();
      logger.info(`探针：知识库 ${kbs.length} 个`, kbs);
      if (kbs.length > 0) {
        const level = await api.listKnowledgeLevel(kbs[0].kb_id, "");
        logger.info(`探针：知识库「${kbs[0].kb_name}」首层 ${level.items.length} 项`, level.items);
        const note = level.items.find((i) => i.media_type === 11) ?? level.items[0];
        if (note) {
          const info = await api.getMediaInfo(note.media_id);
          logger.info(`探针：get_media_info(${note.title})`, info);
        }
      }
      showToast(`探针完成：知识库 ${kbs.length} 个，详情见控制台`, 6000);
    } catch (e) {
      logger.error("探针失败", e);
      showToast(`探针失败：${errorMessage(e)}`, 8000);
    }
  }
}
