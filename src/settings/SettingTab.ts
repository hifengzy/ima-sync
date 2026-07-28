/**
 * 设置页（对应开发方案 7.1 / PRD 第九节）。
 *
 * 采用 Obsidian 1.13.0 声明式设置 API（getSettingDefinitions）：
 *  - 返回非空数组后，Obsidian 1.13.0+ 跳过 display()，按定义渲染并索引到全局设置搜索
 *  - control 类控件的值通过类级别 getControlValue/setControlValue 读写（key 对应 ImaSyncSettings 字段）
 *  - 动态/动作项（API Key 密码框、按钮、知识库列表、缓存统计）用 render / list 命令式渲染
 *
 * 分组：ima 认证 / 同步知识库 / 笔记同步 / 同步根目录 / 附件存放 / 自动同步 / 手动同步 / 缓存数据。
 */
import { App, Notice, PluginSettingTab } from "obsidian";
import type { Plugin, SettingDefinitionItem } from "obsidian";
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

  /** 声明式设置定义：框架据此渲染控件并建立搜索索引。 */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      this.authGroup(),
      this.kbGroup(),
      this.notesGroup(),
      this.rootPathGroup(),
      this.attachmentGroup(),
      this.scheduleGroup(),
      this.manualGroup(),
      this.cacheGroup(),
    ];
  }

  /** 读 control 值：key 对应 ImaSyncSettings 字段名，框架按 key 调用。 */
  override getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  /** 写 control 值：类型归一化 + 持久化 + 按 key 分发副作用。
   *  不可在此调用 refreshDomState/update——框架在 Promise resolve 后自动重新渲染
   *  并刷新 visible/disabled，手动调用会触发递归重建导致 UI 卡死。
   */
  override async setControlValue(key: string, value: unknown): Promise<void> {
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = this.normalizeControlValue(key, value);
    await this.plugin.saveSettings();
    if (key === "scheduleEnabled") {
      this.plugin.applySchedule();
    } else if (key === "showRibbonIcon") {
      this.plugin.applyRibbon();
    }
  }

  /** control 值按 key 做类型归一化，避免 unknown 直接写入 settings。 */
  private normalizeControlValue(key: string, value: unknown): unknown {
    switch (key) {
      case "clientId":
      case "syncRootPath":
        return String(value).trim();
      case "syncNotes":
      case "scheduleEnabled":
      case "showRibbonIcon":
        return Boolean(value);
      case "attachmentMode":
        return String(value);
      default:
        return value;
    }
  }

  // ===== 1. ima 认证 =====
  private authGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "ima 认证",
      items: [
        {
          name: "Client ID",
          desc: `从 ${ImaSyncSettingTab.IMA_OPEN_PLATFORM_URL} 获取。`,
          control: {
            key: "clientId",
            type: "text",
            placeholder: "ima-openapi-clientid",
          },
        },
        // API Key 需 password 类型，声明式 text control 不支持，用 render 命令式渲染密码框。
        {
          name: "API Key",
          desc: "仅本地存储，不会上传。",
          render: (setting) => {
            setting.addText((text) => {
              text.inputEl.type = "password";
              text
                .setPlaceholder("ima-openapi-apikey")
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (v) => {
                  this.plugin.settings.apiKey = v.trim();
                  await this.plugin.saveSettings();
                });
            });
          },
        },
        // 验证连接：用 render + addButton 保留按钮形态与禁用反馈（action 行无独立 button，故不用 SettingDefinitionAction）。
        {
          name: "验证连接",
          desc: "调用 ima API 验证凭证有效性。",
          render: (setting) => {
            setting.addButton((btn) =>
              btn.setButtonText("验证").onClick(() => {
                void (async () => {
                  btn.setDisabled(true);
                  try {
                    const r = await this.plugin.testConnection();
                    new Notice(r.message, 6000);
                  } finally {
                    btn.setDisabled(false);
                  }
                })();
              }),
            );
          },
        },
      ],
    };
  }

  // ===== 2. 同步知识库（可增删的 list） =====
  private kbGroup(): SettingDefinitionItem {
    return {
      type: "list",
      heading: "同步知识库",
      emptyState: "暂未添加知识库，点击「+」添加",
      items: this.plugin.settings.selectedKbs.map((kb) => ({
        name: kb.kb_name,
        desc: [kb.base_type, kb.role_type].filter(Boolean).join(" · ") || undefined,
      })),
      onDelete: (index) => {
        this.plugin.settings.selectedKbs = this.plugin.settings.selectedKbs.filter((_, i) => i !== index);
        void this.plugin.saveSettings();
        this.update(); // 结构变化，重渲染 list
      },
      addItem: {
        name: "添加知识库",
        action: () => {
          void (async () => {
            try {
              const kbs = await this.plugin.listAllKnowledgeBases();
              if (kbs.length === 0) {
                new Notice("未获取到任何知识库，请检查凭证或网络", 6000);
                return;
              }
              new KbPickerModal(this.app, kbs, this.plugin.settings.selectedKbs, (kb) => {
                void (async () => {
                  const added: SelectedKb = {
                    kb_id: kb.kb_id,
                    kb_name: kb.kb_name,
                    base_type: kb.base_type,
                    role_type: kb.role_type,
                  };
                  this.plugin.settings.selectedKbs = [...this.plugin.settings.selectedKbs, added];
                  await this.plugin.saveSettings();
                  this.update();
                  new Notice(`已添加「${kb.kb_name}」`, 3000);
                })();
              }).open();
            } catch (e) {
              new Notice(`获取知识库失败：${e instanceof Error ? e.message : String(e)}`, 8000);
            }
          })();
        },
      },
    };
  }

  // ===== 3. 笔记同步 =====
  private notesGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "笔记同步",
      items: [
        {
          name: "同步独立笔记",
          desc: "开启后同步 ima 独立笔记本内容到 Notes/ 子目录。",
          control: { key: "syncNotes", type: "toggle" },
        },
      ],
    };
  }

  // ===== 4. 同步根目录 =====
  private rootPathGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "同步根目录",
      items: [
        {
          name: "同步根目录路径",
          desc: '相对仓库路径，如 "ima" 或 "A/B"。各知识库与 Notes 会落在其下。',
          control: {
            key: "syncRootPath",
            type: "text",
            placeholder: "ima",
          },
        },
      ],
    };
  }

  // ===== 5. 附件存放 =====
  private attachmentGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "附件存放",
      items: [
        {
          name: "附件存放模式",
          desc: "图片等附件的落地目录。",
          control: {
            key: "attachmentMode",
            type: "dropdown",
            options: {
              "per-kb": "知识库内 attachments（默认）",
              "obsidian-global": "跟随 Obsidian 全局附件设置",
            },
          },
        },
        {
          name: "全局附件目录",
          visible: () => this.plugin.settings.attachmentMode === "obsidian-global",
          searchable: false,
          render: (setting) => {
            const globalDir = resolveGlobalAttachmentDirForDisplay(this.app);
            setting.descEl.setText(
              globalDir
                ? `当前全局附件目录：${globalDir}`
                : "未配置，同步时将回退至各知识库内 attachments",
            );
          },
        },
      ],
    };
  }

  // ===== 6. 自动同步 =====
  private scheduleGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "自动同步",
      items: [
        {
          name: "定时自动同步",
          desc: "按设定频次自动触发同步（默认关闭）。",
          control: { key: "scheduleEnabled", type: "toggle" },
        },
        // 数字 + 单位并排需 render 组合；不走 control 机制，值在 onChange 内手动持久化 + clamp。
        {
          name: "同步频次",
          desc: "数字与单位左右并列，例如「30 分钟」。",
          visible: () => this.plugin.settings.scheduleEnabled,
          searchable: false,
          render: (setting) => {
            setting
              .addText((text) => {
                text.inputEl.addClass("ima-sync-schedule-input");
                text
                  .setPlaceholder("30")
                  .setValue(String(this.plugin.settings.scheduleValue))
                  .onChange(async (v) => {
                    const num = Math.max(1, parseInt(v, 10) || 1);
                    const clamped = clampSchedule(num, this.plugin.settings.scheduleUnit);
                    this.plugin.settings.scheduleValue = clamped.value;
                    if (clamped.clamped) {
                      showToast("频次过低，已按 5 分钟处理", 4000);
                      text.setValue(String(clamped.value));
                    }
                    await this.plugin.saveSettings();
                    if (this.plugin.settings.scheduleEnabled) {
                      this.plugin.applySchedule();
                    }
                  });
              })
              .addDropdown((d) => {
                d.addOption("minutes", "分钟")
                  .addOption("hours", "小时")
                  .addOption("days", "天")
                  .setValue(this.plugin.settings.scheduleUnit)
                  .onChange(async (v) => {
                    const unit = v as ScheduleUnit;
                    this.plugin.settings.scheduleUnit = unit;
                    const clamped = clampSchedule(this.plugin.settings.scheduleValue, unit);
                    if (clamped.clamped) {
                      this.plugin.settings.scheduleValue = clamped.value;
                      showToast("频次过低，已按 5 分钟处理", 4000);
                    }
                    await this.plugin.saveSettings();
                    if (this.plugin.settings.scheduleEnabled) {
                      this.plugin.applySchedule();
                    }
                  });
              });
          },
        },
      ],
    };
  }

  // ===== 7. 手动同步 =====
  private manualGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "手动同步",
      items: [
        {
          name: "显示 ribbon 按钮",
          desc: "左侧栏显示一键同步按钮（默认关闭）。",
          control: { key: "showRibbonIcon", type: "toggle" },
        },
        {
          name: "立即同步",
          desc: "手动触发一次同步。",
          render: (setting) => {
            setting.addButton((btn) =>
              btn.setButtonText("立即同步").setCta().onClick(() => {
                void (async () => {
                  btn.setDisabled(true);
                  try {
                    await this.plugin.triggerSync();
                  } finally {
                    btn.setDisabled(false);
                  }
                })();
              }),
            );
          },
        },
      ],
    };
  }

  // ===== 8. 缓存数据 =====
  private cacheGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "缓存数据",
      items: [
        {
          name: "同步索引缓存",
          desc: "插件用本地索引（sync-index.json）记录已同步文档以实现增量更新。清空后下次同步将全量重新拉取所有内容；不会删除已同步的文档，也不会清除凭证与设置。",
          render: (setting) => {
            setting.addButton((btn) =>
              btn.setButtonText("清空缓存").setDestructive().setCta().onClick(() => {
                new ConfirmModal(this.app, {
                  title: "清空同步索引缓存",
                  message: "清空后下次同步将全量重新拉取所有内容。\n不会删除已同步的文档，也不会清除凭证与设置。",
                  confirmText: "确认清空",
                  onConfirm: async () => {
                    try {
                      await this.plugin.clearCache();
                      new Notice("已清空同步索引缓存", 4000);
                      this.update(); // 刷新索引统计
                    } catch (e) {
                      new Notice(`清空失败：${e instanceof Error ? e.message : String(e)}`, 8000);
                    }
                  },
                }).open();
              }),
            );
          },
        },
        {
          name: "索引统计",
          searchable: false,
          render: (setting) => {
            setting.descEl.setText("加载中…");
            void this.plugin.getIndexSize().then(
              (size) => setting.descEl.setText(`当前索引 ${size} 条记录`),
              (e) => setting.descEl.setText(`加载失败：${e instanceof Error ? e.message : String(e)}`),
            );
          },
        },
      ],
    };
  }
}
