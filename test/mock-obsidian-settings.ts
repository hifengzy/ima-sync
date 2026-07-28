/**
 * 专门用于 SettingTab 单元测试的 obsidian mock。
 *
 * 在 mock-obsidian.ts 基础上补齐 SettingTab 传递依赖所需的运行时符号：
 *  - KbPickerModal extends FuzzySuggestModal
 *  - ConfirmModal extends Modal
 *
 * 仅用于 test/verify-normalize.ts，不参与插件构建。
 */
export {
  requestUrl,
  TFile,
  Notice,
  App,
  normalizePath,
  Plugin,
  PluginSettingTab,
} from "./mock-obsidian";

// mock-obsidian.ts 未提供的符号，此处补空类（仅满足 extends 与模块加载）。
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Modal {}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class FuzzySuggestModal<T> {}
