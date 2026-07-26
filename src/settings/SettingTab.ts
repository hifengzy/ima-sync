/**
 * 设置页（对应开发方案 7.1 / PRD 第九节）。
 *
 * 分组：ima 认证 / 同步知识库 / 笔记同步 / 同步根目录 / 附件存放 / 自动同步 / 手动同步。
 */
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type { Plugin } from "obsidian";
import type { ImaSyncSettings, ScheduleUnit, SelectedKb } from "./types";
import type { KbInfo } from "../api/types";
import { KbPickerModal } from "../ui/KbPickerModal";
import { ConfirmModal } from "../ui/ConfirmModal";
import { showToast } from "../ui/ProgressNotice";
import { clampSchedule, resolveGlobalAttachmentDirForDisplay } from "../utils/path";

/** SettingTab 依赖的插件能力（main.ts 的插件类结构化实现该接口） */
export interface ImaSyncPluginFacade extends Plugin {
  app: App;
  settings: ImaSyncSettings;
  saveSettings(): Promise<void>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  listAllKnowledgeBases(): Promise<KbInfo[]>;
  triggerSync(): Promise<void>;
  clearCache(): Promise<void>;
  getIndexSize(): Promise<number>;
  applySchedule(): void;
  applyRibbon(): void;
}

export class ImaSyncSettingTab extends PluginSettingTab {
  private static readonly IMA_OPEN_PLATFORM_URL = "https://ima.qq.com/agent-interface";

  constructor(app: App, private readonly plugin: ImaSyncPluginFacade) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderAuth(containerEl);
    this.renderKnowledgeBases(containerEl);
    this.renderNotes(containerEl);
    this.renderRootPath(containerEl);
    this.renderAttachment(containerEl);
    this.renderSchedule(containerEl);
    this.renderManual(containerEl);
    this.renderCache(containerEl);
  }

  // ===== 1. ima 认证 =====
  private renderAuth(el: HTMLElement): void {
    new Setting(el)
      .setName("ima 认证")
      .setHeading();

    new Setting(el)
      .setName("Client ID")
      .setDesc(`从 ${ImaSyncSettingTab.IMA_OPEN_PLATFORM_URL} 获取。`)
      .addText((text) =>
        text
          .setPlaceholder("ima-openapi-clientid")
          .setValue(this.plugin.settings.clientId)
          .onChange(async (v) => {
            this.plugin.settings.clientId = v.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(el).setName("API Key").setDesc("仅本地存储，不会上传。").addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder("ima-openapi-apikey").setValue(this.plugin.settings.apiKey).onChange(async (v) => {
        this.plugin.settings.apiKey = v.trim();
        await this.plugin.saveSettings();
      });
    });

    new Setting(el)
      .setName("验证连接")
      .setDesc("调用 ima API 验证凭证有效性。")
      .addButton((btn) =>
        btn.setButtonText("验证").onClick(async () => {
          btn.setDisabled(true);
          try {
            const r = await this.plugin.testConnection();
            new Notice(r.message, 6000);
          } finally {
            btn.setDisabled(false);
          }
        }),
      );
  }

  // ===== 2. 同步知识库 =====
  private renderKnowledgeBases(el: HTMLElement): void {
    new Setting(el).setName("同步知识库").setHeading();

    const listEl = el.createDiv({ cls: "ima-sync-kb-list" });
    this.renderKbList(listEl);

    new Setting(el).addButton((btn) =>
      btn
        .setButtonText("添加知识库")
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true);
          try {
            const kbs = await this.plugin.listAllKnowledgeBases();
            if (kbs.length === 0) {
              new Notice("未获取到任何知识库，请检查凭证或网络", 6000);
              return;
            }
            new KbPickerModal(this.app, kbs, this.plugin.settings.selectedKbs, async (kb) => {
              const added: SelectedKb = {
                kb_id: kb.kb_id,
                kb_name: kb.kb_name,
                base_type: kb.base_type,
                role_type: kb.role_type,
              };
              this.plugin.settings.selectedKbs = [...this.plugin.settings.selectedKbs, added];
              await this.plugin.saveSettings();
              this.renderKbList(listEl);
              new Notice(`已添加「${kb.kb_name}」`, 3000);
            }).open();
          } catch (e) {
            new Notice(`获取知识库失败：${e instanceof Error ? e.message : String(e)}`, 8000);
          } finally {
            btn.setDisabled(false);
          }
        }),
    );
  }

  private renderKbList(listEl: HTMLElement): void {
    listEl.empty();
    const kbs = this.plugin.settings.selectedKbs;
    if (kbs.length === 0) {
      listEl.createEl("div", { text: "暂未添加知识库，点击下方「添加知识库」", cls: "ima-sync-readonly-hint" });
      return;
    }
    for (const kb of kbs) {
      const item = listEl.createDiv({ cls: "ima-sync-kb-item" });
      const left = item.createDiv({ cls: "ima-sync-kb-name" });
      left.createDiv({ text: kb.kb_name, cls: "kb-title" });
      const meta = [kb.base_type, kb.role_type].filter(Boolean).join(" · ");
      if (meta) left.createDiv({ text: meta, cls: "kb-meta" });
      const deleteBtn = item.createDiv({ cls: "ima-sync-kb-delete" });
      new Setting(deleteBtn)
        .addExtraButton((btn) =>
          btn.setIcon("trash-2").setTooltip("移除（不删除本地文件）").onClick(async () => {
            this.plugin.settings.selectedKbs = this.plugin.settings.selectedKbs.filter((k) => k.kb_id !== kb.kb_id);
            await this.plugin.saveSettings();
            this.renderKbList(listEl);
          }),
        )
        .settingEl.setCssProps({ padding: "0" });
    }
  }

  // ===== 3. 笔记同步 =====
  private renderNotes(el: HTMLElement): void {
    new Setting(el).setName("笔记同步").setHeading();
    new Setting(el)
      .setName("同步独立笔记")
      .setDesc("开启后同步 ima 独立笔记本内容到 Notes/ 子目录。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.syncNotes).onChange(async (v) => {
          this.plugin.settings.syncNotes = v;
          await this.plugin.saveSettings();
        }),
      );
  }

  // ===== 4. 同步根目录 =====
  private renderRootPath(el: HTMLElement): void {
    new Setting(el).setName("同步根目录").setHeading();
    new Setting(el)
      .setName("同步根目录路径")
      .setDesc("相对仓库路径，如 ima 或 A/B。各知识库与 Notes 会落在其下。")
      .addText((text) =>
        text
          .setPlaceholder("ima")
          .setValue(this.plugin.settings.syncRootPath)
          .onChange(async (v) => {
            this.plugin.settings.syncRootPath = v.trim();
            await this.plugin.saveSettings();
          }),
      );
  }

  // ===== 5. 附件存放 =====
  private renderAttachment(el: HTMLElement): void {
    new Setting(el).setName("附件存放").setHeading();
    new Setting(el).setName("附件存放模式").setDesc("图片等附件的落地目录。").addDropdown((d) => {
      d.addOption("per-kb", "知识库内 attachments（默认）")
        .addOption("obsidian-global", "跟随 Obsidian 全局附件设置")
        .setValue(this.plugin.settings.attachmentMode)
        .onChange(async (v) => {
          this.plugin.settings.attachmentMode = v as ImaSyncSettings["attachmentMode"];
          await this.plugin.saveSettings();
          this.renderAttachmentHint(hintEl);
        });
    });
    const hintEl = el.createDiv({ cls: "ima-sync-attachment-hint" });
    this.renderAttachmentHint(hintEl);
  }

  private renderAttachmentHint(hintEl: HTMLElement): void {
    hintEl.empty();
    if (this.plugin.settings.attachmentMode !== "obsidian-global") return;
    const globalDir = resolveGlobalAttachmentDirForDisplay(this.app);
    const hint = globalDir
      ? `当前全局附件目录：${globalDir}`
      : "未配置，同步时将回退至各知识库内 attachments";
    hintEl.createEl("div", { text: hint, cls: "ima-sync-readonly-hint" });
  }

  // ===== 6. 自动同步 =====
  private renderSchedule(el: HTMLElement): void {
    new Setting(el).setName("自动同步").setHeading();
    new Setting(el)
      .setName("定时自动同步")
      .setDesc("按设定频次自动触发同步（默认关闭）。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.scheduleEnabled).onChange(async (v) => {
          this.plugin.settings.scheduleEnabled = v;
          await this.plugin.saveSettings();
          this.plugin.applySchedule();
        }),
      );

    new Setting(el)
      .setName("同步频次")
      .setDesc("数字与单位左右并列，例如「30 分钟」。")
      .addText((text) => {
        text.inputEl.setAttr("style", "width: 80px; margin-right: 8px;");
        text
          .setPlaceholder("30")
          .setValue(String(this.plugin.settings.scheduleValue))
          .onChange(async (v) => {
            const num = Math.max(1, parseInt(v, 10) || 1);
            this.plugin.settings.scheduleValue = num;
            await this.applyClampAndSave();
          });
      })
      .addDropdown((d) => {
        d.addOption("minutes", "分钟")
          .addOption("hours", "小时")
          .addOption("days", "天")
          .setValue(this.plugin.settings.scheduleUnit)
          .onChange(async (v) => {
            this.plugin.settings.scheduleUnit = v as ScheduleUnit;
            await this.applyClampAndSave();
          });
      });
  }

  private async applyClampAndSave(): Promise<void> {
    const clamped = clampSchedule(this.plugin.settings.scheduleValue, this.plugin.settings.scheduleUnit);
    if (clamped.clamped) {
      this.plugin.settings.scheduleValue = clamped.value;
      showToast("频次过低，已按 5 分钟处理", 4000);
    }
    await this.plugin.saveSettings();
    this.plugin.applySchedule();
  }

  // ===== 7. 手动同步 =====
  private renderManual(el: HTMLElement): void {
    new Setting(el).setName("手动同步").setHeading();
    new Setting(el)
      .setName("显示 ribbon 按钮")
      .setDesc("左侧栏显示一键同步按钮（默认关闭）。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showRibbonIcon).onChange(async (v) => {
          this.plugin.settings.showRibbonIcon = v;
          await this.plugin.saveSettings();
          this.plugin.applyRibbon();
        }),
      );
    new Setting(el).addButton((btn) =>
      btn
        .setButtonText("立即同步")
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true);
          try {
            await this.plugin.triggerSync();
          } finally {
            btn.setDisabled(false);
          }
        }),
    );
  }

  // ===== 8. 缓存数据 =====
  private renderCache(el: HTMLElement): void {
    new Setting(el).setName("缓存数据").setHeading();
    new Setting(el)
      .setName("同步索引缓存")
      .setDesc(
        "插件用本地索引（sync-index.json）记录已同步文档以实现增量更新。清空后下次同步将全量重新拉取所有内容；不会删除已同步的文档，也不会清除凭证与设置。",
      )
      .addButton((btn) =>
        btn
          .setButtonText("清空缓存")
          .setDestructive()
      .setCta()
          .onClick(() => {
            new ConfirmModal(this.app, {
              title: "清空同步索引缓存",
              message: "清空后下次同步将全量重新拉取所有内容。\n不会删除已同步的文档，也不会清除凭证与设置。",
              confirmText: "确认清空",
              onConfirm: async () => {
                try {
                  await this.plugin.clearCache();
                  new Notice("已清空同步索引缓存", 4000);
                  await this.renderCacheStat(statEl);
                } catch (e) {
                  new Notice(`清空失败：${e instanceof Error ? e.message : String(e)}`, 8000);
                }
              },
            }).open();
          }),
      );
    const statEl = el.createDiv({ cls: "ima-sync-readonly-hint" });
    this.renderCacheStat(statEl);
  }

  private async renderCacheStat(statEl: HTMLElement): Promise<void> {
    statEl.empty();
    const size = await this.plugin.getIndexSize();
    statEl.setText(`当前索引 ${size} 条记录`);
  }
}
