# 功能需求与开发方案：设置页界面语言（中/英）

> 分支：`feat/settings-language`　|　基准：`main`（0a651c1）　|　日期：2026-08-29

## 一、背景

插件设置页全部文案为硬编码中文，英文用户无法阅读。Obsidian 用户群体国际化程度高，需要设置页支持中英双语切换，且切换后即时生效。

## 二、功能需求

### 2.1 语言设置项

| 编号 | 需求 | 说明 |
|------|------|------|
| R1 | 新增 `uiLanguage` 设置字段 | 类型 `"zh" \| "en"`，默认 `"zh"`，随其他设置持久化 |
| R2 | 设置页顶部新增「语言」分组 | 无标题分组，样式与其他分组一致；下拉选项展示原生语言名（简体中文 / English） |
| R3 | 切换语言即时生效 | 选择后立即保存并整体重建设置页，全部文案（含当前正在交互的语言行自身）切换为目标语言 |
| R4 | 全量覆盖设置页文案 | 各分组标题、条目名、描述、按钮文字、下拉选项、Notice 提示、清空缓存确认弹窗（ConfirmModal）标题/正文/按钮均走 i18n 字典 |
| R5 | 参数化文案 | 含动态值的文案用 `{name}` 占位符，如「已添加「{name}」」「当前索引 {count} 条记录」 |
| R6 | 缺 key 回退 | 目标语言缺少某 key 时回退中文，保证界面不出现空文案 |

### 2.2 细节改进

| 编号 | 需求 | 说明 |
|------|------|------|
| R7 | Client ID 描述中的平台地址可点击 | desc 使用 `DocumentFragment` 渲染，`https://ima.qq.com/agent-interface` 渲染为新窗口打开的链接（`noopener`） |
| R8 | ribbon 旋转状态修复（附带） | 手动同步触发期间，被「同步中跳过」的重复调用不得在 `finally` 中提前关掉 ribbon 旋转动画；仅当同步真正结束（`SyncState.isSyncing()` 为 false）时复位 |

### 2.3 非目标（Non-goals）

- 不翻译设置页以外的界面文案（如同步过程中的 Notice、模态框等，后续迭代扩展）。
- 不新增第三种语言，语言列表固定 zh / en。
- 语言跟随 Obsidian 界面语言自动选择的逻辑暂不做，仅手动切换。

## 三、开发方案

### 3.1 整体设计

```
src/settings/
├── i18n.ts          # 新增：文案字典 + createTranslator 工厂
├── types.ts         # 新增 UiLanguage 类型；ImaSyncSettings 增加 uiLanguage
└── SettingTab.ts    # 全部文案改为 this.t(...) 取值；新增 languageGroup()
```

核心思路：**文案取值不缓存**。`SettingTab` 提供 getter `t`，每次访问都按当前 `settings.uiLanguage` 重建 translator，语言切换后无需任何缓存失效处理。

### 3.2 i18n 字典（`i18n.ts`）

- `MESSAGES` 常量：`{ zh: {...}, en: {...} }`，key 命名约定 `<分组><条目><字段>`（如 `scheduleTooLow`、`kbAdded`）。
- `UI_LANGUAGE_OPTIONS`：语言下拉的展示名，语言名保持原生写法不做翻译。
- `createTranslator(lang)` 返回 `Translator`：
  - 取值优先 `MESSAGES[lang][key]`，缺失回退 `MESSAGES.zh[key]`；
  - `params` 中的键值对用 `split().join()` 替换 `{name}` 占位符（避免正则转义问题）。
- `MessageKey` 由 `typeof MESSAGES.zh` 推导。注意：`MESSAGES[lang]` 是联合类型索引，**en 缺少任一 key 会直接编译报错**（TS7053，key 完整性由编译期强制）；运行期 `?? MESSAGES.zh[key]` 仅作为非法语言等异常情况的防御性兜底，在编译通过的字典上不可达。

### 3.3 设置项与即时切换（`SettingTab.ts`）

- 新增 `languageGroup()`，置于定义列表第 0 位。
- 关键点：语言行用 **`render` 命令式渲染**而非 `control` 声明式。原因：框架 `update()` 重建时不会重渲染 `control` 行的行名（尤其正在交互的行），`render` 行会重新执行回调，语言行自身文案才能立即切换。
- onChange 流程：
  1. 写入 `settings.uiLanguage` 并 `await saveSettings()`；
  2. `window.setTimeout(() => this.update(), 0)` 延迟到本轮框架刷新结束后整体重建，避免与声明式框架自身的刷新叠加引发递归渲染。
- 所有分组（auth/kb/notes/rootPath/attachment/schedule/manual/cache）内的硬编码中文全部替换为 `t("...")`；每个 group 方法开头 `const t = this.t` 一次性取用。
- 按钮文案在点击回调内重新取 `this.t(...)`，保证弹窗/通知出现时用的是最新语言。

### 3.4 Client ID 描述链接（R7）

新增静态方法 `buildClientDesc(before, after): DocumentFragment`：前缀文案 + `<a>` 链接（`target="_blank"`、`rel="noopener"`）+ 后缀文案。声明式 desc 支持 DocumentFragment，点击后经浏览器打开 ima 开放平台。

### 3.5 ribbon 旋转修复（`main.ts`，R8）

- `ImaSyncPlugin` 新增私有字段 `syncState`，在 `onload` 创建 `SyncState` 时保存引用。
- `triggerSyncAndResetRibbon()` 的 `finally` 中，由无条件 `setRibbonSpinning(false)` 改为：

```ts
// 同步中被跳过的重复调用不得关掉旋转：只有真正结束时才复位
if (!this.syncState?.isSyncing()) {
    this.setRibbonSpinning(false);
}
```

- `SyncState.isSyncing()` 进入同步即置 true，try/finally 保证复位，语义可靠。

### 3.6 默认值与类型（`types.ts`）

```ts
export type UiLanguage = "zh" | "en";

export interface ImaSyncSettings {
    /** 0. 设置页界面语言 */
    uiLanguage: UiLanguage;
    // ...
}

export const DEFAULT_SETTINGS: ImaSyncSettings = {
    uiLanguage: "zh",
    // ...
};
```

老用户升级后 `data.json` 中无 `uiLanguage` 字段，Obsidian 的 `Object.assign(DEFAULT_SETTINGS, data)` 合并策略自动补齐默认值 `"zh"`，无需迁移逻辑。

## 四、涉及文件清单

| 文件 | 变更类型 | 内容 |
|------|----------|------|
| `src/settings/i18n.ts` | 新增 | 中英文案字典、`createTranslator`、`UI_LANGUAGE_OPTIONS` |
| `src/settings/types.ts` | 修改 | 新增 `UiLanguage` 类型与 `uiLanguage` 字段及默认值 |
| `src/settings/SettingTab.ts` | 修改 | 新增语言分组；全部文案 i18n 化；Client ID 链接渲染 |
| `src/main.ts` | 修改 | 保存 `syncState` 引用；ribbon 复位条件修正 |

## 五、开发计划

1. **类型与字典**：`types.ts` 加类型和默认值；新建 `i18n.ts` 字典与 translator。
2. **语言分组**：`languageGroup()` + 下拉切换 + `setTimeout(0)` 重建。
3. **文案替换**：逐分组替换为 `t(...)`，同步翻译 en 字典；Client ID desc 改 DocumentFragment。
4. **附带修复**：`main.ts` ribbon 复位条件。
5. **验证**：
   - `npm run build`（tsc + esbuild）无类型错误；
   - 手动验证：切换语言即时生效、重启后语言保持、英文缺 key 回退、含参数文案渲染正确、Client ID 链接可点击、同步中重复触发 ribbon 旋转不中断。

## 六、风险与注意事项

| 风险 | 应对 |
|------|------|
| 声明式框架与手动 `update()` 叠加导致递归渲染 | 切换语言用 `setTimeout(0)` 错开本轮刷新 |
| `render` 行回调内闭包捕获旧 translator | 回调内统一用 `this.t`（getter 实时取值），不提前缓存 translator 实例 |
| 后续新增文案漏翻英文 | 编译期直接报错（TS7053）强制补齐；en 字典按分组与 zh 一一对应排列，便于对照 |
| 老 data.json 无 `uiLanguage` | 默认值合并策略覆盖，无迁移成本 |
