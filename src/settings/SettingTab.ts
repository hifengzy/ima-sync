/**
 * 设置页（对应开发方案 7.1 / PRD 第九节）。
 *
 * 采用 Obsidian 1.13.0 声明式设置 API（getSettingDefinitions）：
 *  - 返回非空数组后，Obsidian 1.13.0+ 跳过 display()，按定义渲染并索引到全局设置搜索
 *  - control 类控件的值通过类级别 getControlValue/setControlValue 读写（key 对应 ImaSyncSettings 字段）
 *  - 动态/动作项（API Key 密码框、按钮、知识库列表、缓存统计）用 render / list 命令式渲染
 *
 * 文案统一经 i18n 字典（./i18n）按 settings.uiLanguage 取值；
 * 框架在 setControlValue resolve 后自动重渲染定义，语言切换即时生效。
 *
 * 分组：语言设置 / ima 认证 / 同步知识库 / 笔记同步 / 同步根目录 / 附件存放 / 自动同步 / 手动同步 / 缓存数据。
 */
import { App, Notice, PluginSettingTab } from "obsidian";
import type { Plugin, SettingDefinitionItem } from "obsidian";
import type { ImaSyncSettings, ScheduleUnit, SelectedKb } from "./types";
import { createTranslator, UI_LANGUAGE_OPTIONS } from "./i18n";
import type { KbInfo } from "../api/types";
import { KbPickerModal } from "../ui/KbPickerModal";
import { ConfirmModal } from "../ui/ConfirmModal";
import { showToast } from "../ui/ProgressNotice";
import { clampSchedule, resolveGlobalAttachmentDirForDisplay } from "../utils/path";

/** testConnection 结构化结果：文案 key 交由设置页按当前语言渲染 */
export interface TestConnectionResult {
  ok: boolean;
  key: "verifyMissingCredentials" | "verifySuccess" | "verifySuccessNoKb" | "verifyFailed";
  params?: Record<string, string>;
}

/** SettingTab 依赖的插件能力（main.ts 的插件类结构化实现该接口） */
export interface ImaSyncPluginFacade extends Plugin {
  app: App;
  settings: ImaSyncSettings;
  saveSettings(): Promise<void>;
  testConnection(): Promise<TestConnectionResult>;
  listAllKnowledgeBases(): Promise<KbInfo[]>;
  triggerSync(): Promise<void>;
  clearCache(): Promise<void>;
  getIndexSize(): Promise<number>;
  applySchedule(): void;
  applyRibbon(): void;
}

export class ImaSyncSettingTab extends PluginSettingTab {
  private static readonly IMA_OPEN_PLATFORM_URL = "https://ima.qq.com/agent-interface";

  /** 构造 Client ID 说明片段：前缀文案 + 可点击的平台链接 + 后缀文案 */
  private static buildClientDesc(before: string, after: string): DocumentFragment {
    const url = ImaSyncSettingTab.IMA_OPEN_PLATFORM_URL;
    // 用 Obsidian DOM 助手（createFragment/createEl）替代原生 DOM 方法（社区审查规范 prefer-create-el）
    return createFragment((frag) => {
      frag.append(before);
      frag.createEl("a", {
        text: url,
        attr: {
          href: url,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      });
      frag.append(after);
    });
  }

  constructor(app: App, private readonly plugin: ImaSyncPluginFacade) {
    super(app, plugin);
  }

  /** 文案取值函数：每次访问按当前语言设置重建，切换语言后无需缓存失效处理 */
  private get t(): ReturnType<typeof createTranslator> {
    return createTranslator(this.plugin.settings.uiLanguage);
  }

  /** 声明式设置定义：框架据此渲染控件并建立搜索索引。 */
  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      this.languageGroup(),
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

  // ===== 0. 语言设置（无标题，样式对齐其他分组） =====
  private languageGroup(): SettingDefinitionItem {
    return {
      type: "group",
      items: [
        {
          name: this.t("langName"),
          // 用 render 命令式渲染：框架不会重建 control 行的行名（尤其正在交互的行），
          // render 行在 update() 重建时会重新执行回调，语言行自身文案才能立即切换。
          render: (setting) => {
            setting.addDropdown((d) =>
              d
                .addOption("zh", UI_LANGUAGE_OPTIONS.zh)
                .addOption("en", UI_LANGUAGE_OPTIONS.en)
                .setValue(this.plugin.settings.uiLanguage)
                .onChange(async (v) => {
                  const lang = v === "en" ? "en" : "zh";
                  if (lang === this.plugin.settings.uiLanguage) {
                    return;
                  }
                  this.plugin.settings.uiLanguage = lang;
                  await this.plugin.saveSettings();
                  // 延迟到本轮框架刷新结束后整体重建，避免与框架刷新叠加引发递归
                  window.setTimeout(() => this.update(), 0);
                }),
            );
          },
        },
      ],
    };
  }

  // ===== 1. ima 认证 =====
  private authGroup(): SettingDefinitionItem {
    const t = this.t;
    return {
      type: "group",
      heading: t("authHeading"),
      items: [
        {
          name: t("clientIdName"),
          // desc 支持 DocumentFragment：说明中的平台地址渲染为可点击链接，点击经浏览器打开
          desc: ImaSyncSettingTab.buildClientDesc(
            t("clientIdDescBefore"),
            t("clientIdDescAfter"),
          ),
          control: {
            key: "clientId",
            type: "text",
            placeholder: "ima-openapi-clientid",
          },
        },
        // API Key 需 password 类型，声明式 text control 不支持，用 render 命令式渲染密码框。
        {
          name: t("apiKeyName"),
          desc: t("apiKeyDesc"),
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
          name: t("verifyName"),
          desc: t("verifyDesc"),
          render: (setting) => {
            setting.addButton((btn) =>
              btn.setButtonText(this.t("verifyButton")).onClick(() => {
                void (async () => {
                  btn.setDisabled(true);
                  try {
                    const r = await this.plugin.testConnection();
                    // 回调内实时取 this.t：验证请求在途期间切换语言也能用最新语言展示
                    new Notice(this.t(r.key, r.params), 6000);
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
    const t = this.t;
    return {
      type: "list",
      heading: t("kbHeading"),
      emptyState: t("kbEmptyState"),
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
        name: t("kbAddItem"),
        action: () => {
          void (async () => {
            try {
              const kbs = await this.plugin.listAllKnowledgeBases();
              if (kbs.length === 0) {
                // 异步回调内实时取 this.t，避免在途请求期间切换语言后仍用旧语言
                new Notice(this.t("kbNoneFound"), 6000);
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
                  new Notice(this.t("kbAdded", { name: kb.kb_name }), 3000);
                })();
              }).open();
            } catch (e) {
              new Notice(this.t("kbFetchFailed", { msg: e instanceof Error ? e.message : String(e) }), 8000);
            }
          })();
        },
      },
    };
  }

  // ===== 3. 笔记同步 =====
  private notesGroup(): SettingDefinitionItem {
    const t = this.t;
    return {
      type: "group",
      heading: t("notesHeading"),
      items: [
        {
          name: t("notesToggleName"),
          desc: t("notesToggleDesc"),
          control: { key: "syncNotes", type: "toggle" },
        },
      ],
    };
  }

  // ===== 4. 同步根目录 =====
  private rootPathGroup(): SettingDefinitionItem {
    const t = this.t;
    return {
      type: "group",
      heading: t("rootPathHeading"),
      items: [
        {
          name: t("rootPathName"),
          desc: t("rootPathDesc"),
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
    const t = this.t;
    return {
      type: "group",
      heading: t("attachHeading"),
      items: [
        {
          name: t("attachModeName"),
          desc: t("attachModeDesc"),
          control: {
            key: "attachmentMode",
            type: "dropdown",
            options: {
              "per-kb": t("attachModePerKb"),
              "obsidian-global": t("attachModeGlobal"),
            },
          },
        },
        {
          name: t("attachGlobalDirName"),
          visible: () => this.plugin.settings.attachmentMode === "obsidian-global",
          searchable: false,
          render: (setting) => {
            const globalDir = resolveGlobalAttachmentDirForDisplay(this.app);
            setting.descEl.setText(
              globalDir
                ? t("attachGlobalCurrent", { dir: globalDir })
                : t("attachGlobalMissing"),
            );
          },
        },
      ],
    };
  }

  // ===== 6. 自动同步 =====
  private scheduleGroup(): SettingDefinitionItem {
    const t = this.t;
    return {
      type: "group",
      heading: t("scheduleHeading"),
      items: [
        {
          name: t("scheduleToggleName"),
          desc: t("scheduleToggleDesc"),
          control: { key: "scheduleEnabled", type: "toggle" },
        },
        // 数字 + 单位并排需 render 组合；不走 control 机制，值在 onChange 内手动持久化 + clamp。
        {
          name: t("scheduleFreqName"),
          desc: t("scheduleFreqDesc"),
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
                      showToast(this.t("scheduleTooLow"), 4000);
                      text.setValue(String(clamped.value));
                    }
                    await this.plugin.saveSettings();
                    if (this.plugin.settings.scheduleEnabled) {
                      this.plugin.applySchedule();
                    }
                  });
              })
              .addDropdown((d) => {
                d.addOption("minutes", t("unitMinutes"))
                  .addOption("hours", t("unitHours"))
                  .addOption("days", t("unitDays"))
                  .setValue(this.plugin.settings.scheduleUnit)
                  .onChange(async (v) => {
                    const unit = v as ScheduleUnit;
                    this.plugin.settings.scheduleUnit = unit;
                    const clamped = clampSchedule(this.plugin.settings.scheduleValue, unit);
                    if (clamped.clamped) {
                      this.plugin.settings.scheduleValue = clamped.value;
                      showToast(this.t("scheduleTooLow"), 4000);
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
    const t = this.t;
    return {
      type: "group",
      heading: t("manualHeading"),
      items: [
        {
          name: t("ribbonName"),
          desc: t("ribbonDesc"),
          control: { key: "showRibbonIcon", type: "toggle" },
        },
        {
          name: t("syncNowName"),
          desc: t("syncNowDesc"),
          render: (setting) => {
            setting.addButton((btn) =>
              btn.setButtonText(this.t("syncNowButton")).setCta().onClick(() => {
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
    const t = this.t;
    return {
      type: "group",
      heading: t("cacheHeading"),
      items: [
        {
          name: t("cacheIndexName"),
          desc: t("cacheIndexDesc"),
          render: (setting) => {
            setting.addButton((btn) =>
              btn.setButtonText(this.t("cacheClearButton")).setDestructive().setCta().onClick(() => {
                new ConfirmModal(this.app, {
                  title: t("confirmClearTitle"),
                  message: t("confirmClearMessage"),
                  confirmText: t("confirmClearText"),
                  cancelText: t("confirmCancelText"),
                  onConfirm: async () => {
                    try {
                      await this.plugin.clearCache();
                      // 异步回调内实时取 this.t，清空过程中切换语言也用最新语言提示
                      new Notice(this.t("cacheCleared"), 4000);
                      this.update(); // 刷新索引统计
                    } catch (e) {
                      new Notice(this.t("cacheClearFailed", { msg: e instanceof Error ? e.message : String(e) }), 8000);
                    }
                  },
                }).open();
              }),
            );
          },
        },
        {
          name: t("statsName"),
          searchable: false,
          render: (setting) => {
            setting.descEl.setText(t("statsLoading"));
            void this.plugin.getIndexSize().then(
              (size) => setting.descEl.setText(t("statsCount", { count: size })),
              (e) => setting.descEl.setText(t("statsFailed", { msg: e instanceof Error ? e.message : String(e) })),
            );
          },
        },
      ],
    };
  }
}
