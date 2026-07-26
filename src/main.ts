/**
 * 插件入口：生命周期、命令、ribbon、定时器、设置页注册（对应开发方案 2.2 / 7.3 / 7.4）。
 */
import { Plugin, normalizePath } from "obsidian";
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
import { ENABLE_PROBE } from "./constants";

export default class ImaSyncPlugin extends Plugin {
  // 原始 sync.svg，仅替换 fill 色值为 currentColor 以适配 Obsidian 主题
  // 加 svg-icon class 使尺寸与 Obsidian 内置 icon 完全一致（CSS 控制，不做内联尺寸）

  // Imports trusted static SVG via createContextualFragment for security audit compliance
  private static applyRibbonSvg(el: HTMLElement): void {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "svg-icon");
    svg.setAttribute("viewBox", "0 0 240 240");
    svg.setAttribute("fill", "none");

    const g = document.createElementNS(ns, "g");
    g.setAttribute("clip-path", "url(#ima-sync-ribbon-clip)");

    const mask = document.createElementNS(ns, "mask");
    mask.setAttribute("id", "ima-sync-ribbon-mask");
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    mask.setAttribute("x", "0");
    mask.setAttribute("y", "0");
    mask.setAttribute("width", "240");
    mask.setAttribute("height", "240");
    const mCircle = document.createElementNS(ns, "circle");
    mCircle.setAttribute("cx", "120");
    mCircle.setAttribute("cy", "120");
    mCircle.setAttribute("r", "120");
    mCircle.setAttribute("fill", "currentColor");
    mCircle.setAttribute("opacity", "0.85");
    mask.appendChild(mCircle);

    const mg = document.createElementNS(ns, "g");
    mg.setAttribute("mask", "url(#ima-sync-ribbon-mask)");
    const e1 = document.createElementNS(ns, "ellipse");
    e1.setAttribute("cx", "37.6766"); e1.setAttribute("cy", "39.3363");
    e1.setAttribute("rx", "30"); e1.setAttribute("ry", "44.4525");
    e1.setAttribute("transform", "rotate(40 37.6766 39.3363)");
    e1.setAttribute("fill", "currentColor");
    const e2 = document.createElementNS(ns, "ellipse");
    e2.setAttribute("cx", "30"); e2.setAttribute("cy", "44.4525");
    e2.setAttribute("rx", "30"); e2.setAttribute("ry", "44.4525");
    e2.setAttribute("transform", "matrix(-0.766044 0.642788 0.642788 0.766044 196.963 -14)");
    e2.setAttribute("fill", "currentColor");
    mg.appendChild(e1); mg.appendChild(e2);

    const e3 = document.createElementNS(ns, "ellipse");
    e3.setAttribute("cx", "67.5549"); e3.setAttribute("cy", "139.336");
    e3.setAttribute("rx", "30"); e3.setAttribute("ry", "44.4525");
    e3.setAttribute("transform", "rotate(40 67.5549 139.336)");
    e3.setAttribute("fill", "currentColor");
    const e4 = document.createElementNS(ns, "ellipse");
    e4.setAttribute("cx", "30"); e4.setAttribute("cy", "44.4525");
    e4.setAttribute("rx", "30"); e4.setAttribute("ry", "44.4525");
    e4.setAttribute("transform", "matrix(-0.766044 0.642788 0.642788 0.766044 166.963 86)");
    e4.setAttribute("fill", "currentColor");
    const e5 = document.createElementNS(ns, "ellipse");
    e5.setAttribute("cx", "120.5"); e5.setAttribute("cy", "170.5");
    e5.setAttribute("rx", "13.5"); e5.setAttribute("ry", "8.5");
    e5.setAttribute("fill", "currentColor");

    g.appendChild(mask); g.appendChild(mg);
    g.appendChild(e3); g.appendChild(e4); g.appendChild(e5);

    const defs = document.createElementNS(ns, "defs");
    const clip = document.createElementNS(ns, "clipPath");
    clip.setAttribute("id", "ima-sync-ribbon-clip");
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("width", "240");
    rect.setAttribute("height", "240");
    rect.setAttribute("rx", "8");
    rect.setAttribute("fill", "white");
    clip.appendChild(rect);
    defs.appendChild(clip);

    svg.appendChild(g); svg.appendChild(defs);
    el.appendChild(svg);
  }

  settings!: ImaSyncSettings;
  private client!: ImaClient;
  private syncManager!: SyncManager;
  private index!: SyncIndex;
  private ribbonIconEl?: HTMLElement;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.client = new ImaClient(this.settings.clientId, this.settings.apiKey);
    const pluginDir = this.manifest.dir ?? normalizePath(`${this.app.vault.configDir}/plugins/ima-sync`);
    this.index = new SyncIndex(this.app, pluginDir);
    const state = new SyncState();
    this.syncManager = new SyncManager(this.app, this.client, this.index, state, () => this.settings);

    // 命令：立即同步（FR-5.1）
    this.addCommand({
      id: "ima-sync-now",
      name: "同步 ima 知识库",
      callback: () => void this.triggerSync(),
    });

    // 命令：API 探针（仅开发版可用）
    if (ENABLE_PROBE) {
      this.addCommand({
        id: "ima-api-probe",
        name: "ima API 探针（调试，输出到控制台）",
        callback: () => void this.runProbe(),
      });
    }

    this.applyRibbon();
    this.applySchedule();

    this.addSettingTab(new ImaSyncSettingTab(this.app, this));
    logger.info("插件已加载");
  }

  onunload(): void {
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
    this.setRibbonSpinning(true);
    try {
      await this.syncManager.triggerSync();
    } finally {
      this.setRibbonSpinning(false);
    }
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

  // ===== 缓存清理（FR-12） =====

  async clearCache(): Promise<void> {
    await this.index.load();
    this.index.clear();
    await this.index.save();
    logger.info("已清空同步索引缓存");
  }

  async getIndexSize(): Promise<number> {
    await this.index.load();
    return this.index.size();
  }

  // ===== 调度与 ribbon =====

  applySchedule(): void {
    if (!this.settings.scheduleEnabled) return;
    const { value, unit, clamped } = clampSchedule(this.settings.scheduleValue, this.settings.scheduleUnit);
    if (clamped) {
      logger.info(`定时频次过低，已按 5 分钟处理`);
    }
    const ms = scheduleToMs(value, unit);
    this.registerInterval(window.setInterval(() => void this.triggerSync(), ms));
  }

  applyRibbon(): void {
    this.ribbonIconEl?.remove();
    this.ribbonIconEl = undefined;
    if (this.settings.showRibbonIcon) {
      this.ribbonIconEl = this.addRibbonIcon("", "同步 ima 知识库", () => void this.triggerSync());
      ImaSyncPlugin.applyRibbonSvg(this.ribbonIconEl);
    }
  }

  /** 同步期间 ribbon icon 旋转（FR-11.4） */
  setRibbonSpinning(spinning: boolean): void {
    this.ribbonIconEl?.toggleClass("ima-sync-spinning", spinning);
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
