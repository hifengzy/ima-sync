/**
 * 插件设置类型与默认值（对应开发方案 3.1）。
 */

export interface SelectedKb {
  kb_id: string;
  kb_name: string;
  /** ima 返回的知识库类型描述，如「个人知识库」「共享知识库」「我加入的订阅知识库」 */
  base_type?: string;
  /** 用户在该知识库的角色，如「创建者」「普通成员」 */
  role_type?: string;
}

export type AttachmentMode = "per-kb" | "obsidian-global";

export type ScheduleUnit = "minutes" | "hours" | "days";

export interface ImaSyncSettings {
  /** 1. ima 认证 */
  clientId: string;
  apiKey: string;

  /** 2. 同步知识库列表 */
  selectedKbs: SelectedKb[];

  /** 3. 笔记同步 */
  syncNotes: boolean;

  /** 4. 同步根目录（相对仓库路径，如 "ima" 或 "A/B"） */
  syncRootPath: string;

  /** 5. 附件存放模式 */
  attachmentMode: AttachmentMode;

  /** 6. 自动同步频次 */
  scheduleEnabled: boolean;
  scheduleValue: number;
  scheduleUnit: ScheduleUnit;

  /** 7. 手动同步 ribbon 按钮 */
  showRibbonIcon: boolean;
}

export const DEFAULT_SETTINGS: ImaSyncSettings = {
  clientId: "",
  apiKey: "",
  selectedKbs: [],
  syncNotes: false,
  syncRootPath: "",
  attachmentMode: "per-kb",
  scheduleEnabled: false,
  scheduleValue: 30,
  scheduleUnit: "minutes",
  showRibbonIcon: false,
};
