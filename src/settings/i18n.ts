/**
 * 设置页文案字典（简体中文 / English）。
 *
 * 仅覆盖设置页面内的文案（含由设置页触发的 Notice / ConfirmModal）；
 * key 命名约定：<分组><条目><字段>，参数用 {name} 占位符。
 */
import type { UiLanguage } from "./types";

/** 语言下拉选项展示名（语言名保持原生写法，不做翻译） */
export const UI_LANGUAGE_OPTIONS: Record<UiLanguage, string> = {
    zh: "简体中文",
    en: "English",
};

const MESSAGES = {
    zh: {
        // 0. 语言设置
        langName: "语言",

        // 1. ima 认证
        authHeading: "ima 认证",
        clientIdName: "Client ID",
        clientIdDescBefore: "从 ",
        clientIdDescAfter: " 获取。",
        apiKeyName: "API Key",
        apiKeyDesc: "仅本地存储，不会上传。",
        verifyName: "验证连接",
        verifyDesc: "调用 ima API 验证凭证有效性。",
        verifyButton: "验证",
        verifyMissingCredentials: "请先填写 Client ID 与 API Key",
        verifySuccess: "连接成功，凭证有效",
        verifySuccessNoKb: "连接成功（暂无知识库）",
        verifyFailed: "连接失败：{msg}",

        // 2. 同步知识库
        kbHeading: "同步知识库",
        kbEmptyState: "暂未添加知识库，点击「+」添加",
        kbAddItem: "添加知识库",
        kbNoneFound: "未获取到任何知识库，请检查凭证或网络",
        kbAdded: "已添加「{name}」",
        kbFetchFailed: "获取知识库失败：{msg}",

        // 3. 同步笔记
        notesHeading: "同步笔记",
        notesToggleName: "同步独立笔记",
        notesToggleDesc: "开启后同步 ima 独立笔记本内容到 Notes/ 子目录。",

        // 4. 仓库存放路径
        rootPathHeading: "仓库存放路径",
        rootPathName: "同步根目录路径",
        rootPathDesc: '相对仓库路径，如子目录 "ima" 或 "A/B"，"/"表示根目录。各知识库与 Notes 会落在其下。',

        // 5. 附件存放路径
        attachHeading: "附件存放路径",
        attachModeName: "附件存放模式",
        attachModeDesc: "图片等附件的落地目录。",
        attachModePerKb: "知识库内 attachments（默认）",
        attachModeGlobal: "跟随 Obsidian 全局附件设置",
        attachGlobalDirName: "全局附件目录",
        attachGlobalCurrent: "当前全局附件目录：{dir}",
        attachGlobalMissing: "未配置，同步时将回退至各知识库内 attachments",

        // 6. 自动同步
        scheduleHeading: "自动同步",
        scheduleToggleName: "定时自动同步",
        scheduleToggleDesc: "按设定频次自动触发同步，ima API 存在每日限额，建议关闭（默认关闭）。",
        scheduleFreqName: "同步频次",
        scheduleFreqDesc: "数字与单位左右并列，例如「30 分钟」。",
        unitMinutes: "分钟",
        unitHours: "小时",
        unitDays: "天",
        scheduleTooLow: "频次过低，已按 5 分钟处理",

        // 7. 手动同步
        manualHeading: "手动同步",
        ribbonName: "显示 ribbon 按钮",
        ribbonDesc: "左侧栏显示一键同步按钮（默认关闭）。",
        syncNowName: "立即同步",
        syncNowDesc: "手动触发一次同步。",
        syncNowButton: "立即同步",
        notConfigured: "请先配置 ima Client ID 与 API Key",

        // 8. 缓存数据
        cacheHeading: "缓存数据",
        cacheIndexName: "同步索引缓存",
        cacheIndexDesc:
            "插件用本地索引（sync-index.json）记录已同步文档以实现增量更新。清空后下次同步将全量重新拉取所有内容；不会删除已同步的文档，也不会清除凭证与设置。",
        cacheClearButton: "清空缓存",
        confirmClearTitle: "清空同步索引缓存",
        confirmClearMessage: "清空后下次同步将全量重新拉取所有内容。\n不会删除已同步的文档，也不会清除凭证与设置。",
        confirmClearText: "确认清空",
        confirmCancelText: "取消",
        cacheCleared: "已清空同步索引缓存",
        cacheClearFailed: "清空失败：{msg}",
        statsName: "索引统计",
        statsLoading: "加载中…",
        statsCount: "当前索引 {count} 条记录",
        statsFailed: "加载失败：{msg}",
    },
    en: {
        // 0. Language
        langName: "Language",

        // 1. ima Authentication
        authHeading: "ima Authentication",
        clientIdName: "Client ID",
        clientIdDescBefore: "Get it from ",
        clientIdDescAfter: ".",
        apiKeyName: "API Key",
        apiKeyDesc: "Stored locally only, never uploaded.",
        verifyName: "Verify Connection",
        verifyDesc: "Call the ima API to verify credentials.",
        verifyButton: "Verify",
        verifyMissingCredentials: "Please fill in the Client ID and API Key first",
        verifySuccess: "Connection successful, credentials are valid",
        verifySuccessNoKb: "Connection successful (no knowledge bases yet)",
        verifyFailed: "Connection failed: {msg}",

        // 2. Knowledge Bases
        kbHeading: "Knowledge Bases",
        kbEmptyState: 'No knowledge bases yet, click "+" to add',
        kbAddItem: "Add Knowledge Base",
        kbNoneFound: "No knowledge bases found, please check credentials or network",
        kbAdded: 'Added "{name}"',
        kbFetchFailed: "Failed to fetch knowledge bases: {msg}",

        // 3. Notes Sync
        notesHeading: "Notes Sync",
        notesToggleName: "Sync Standalone Notes",
        notesToggleDesc: "When enabled, sync ima standalone notes into the Notes/ subfolder.",

        // 4. Vault Storage Path
        rootPathHeading: "Vault Storage Path",
        rootPathName: "Sync Root Path",
        rootPathDesc:
            'Vault-relative path, e.g. subdirectory "ima" or "A/B"; "/" means the vault root. All knowledge bases and Notes will be placed under it.',

        // 5. Attachments Path
        attachHeading: "Attachments Path",
        attachModeName: "Attachment Mode",
        attachModeDesc: "Where images and other attachments are stored.",
        attachModePerKb: "Per-KB attachments folder (default)",
        attachModeGlobal: "Follow Obsidian global attachment setting",
        attachGlobalDirName: "Global Attachment Folder",
        attachGlobalCurrent: "Current global attachment folder: {dir}",
        attachGlobalMissing: "Not configured; falls back to per-KB attachments folder during sync",

        // 6. Auto Sync
        scheduleHeading: "Auto Sync",
        scheduleToggleName: "Scheduled Auto Sync",
        scheduleToggleDesc:
            "Trigger sync automatically at the configured interval. The ima API has a daily quota, so keeping this off is recommended (default off).",
        scheduleFreqName: "Sync Interval",
        scheduleFreqDesc: 'Number and unit side by side, e.g. "30 minutes".',
        unitMinutes: "minutes",
        unitHours: "hours",
        unitDays: "days",
        scheduleTooLow: "Interval too short, clamped to 5 minutes",

        // 7. Manual Sync
        manualHeading: "Manual Sync",
        ribbonName: "Show Ribbon Button",
        ribbonDesc: "Show a one-click sync button in the left ribbon (default off).",
        syncNowName: "Sync Now",
        syncNowDesc: "Manually trigger a sync.",
        syncNowButton: "Sync Now",
        notConfigured: "Please configure the ima Client ID and API Key first",

        // 8. Cache Data
        cacheHeading: "Cache Data",
        cacheIndexName: "Sync Index Cache",
        cacheIndexDesc:
            "The plugin keeps a local index (sync-index.json) of synced documents for incremental updates. Clearing it triggers a full re-sync next time; synced documents are not deleted, and credentials and settings are preserved.",
        cacheClearButton: "Clear Cache",
        confirmClearTitle: "Clear Sync Index Cache",
        confirmClearMessage:
            "The next sync will re-fetch everything from scratch.\nSynced documents are not deleted, and credentials and settings are preserved.",
        confirmClearText: "Clear",
        confirmCancelText: "Cancel",
        cacheCleared: "Sync index cache cleared",
        cacheClearFailed: "Failed to clear: {msg}",
        statsName: "Index Stats",
        statsLoading: "Loading…",
        statsCount: "Index contains {count} record(s)",
        statsFailed: "Failed to load: {msg}",
    },
} as const;

export type MessageKey = keyof typeof MESSAGES.zh;

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * 创建当前语言的文案取值函数。
 * en 缺 key 由编译期拦截（联合类型索引要求 key 存在于每个成员）；
 * 此处 `?? MESSAGES.zh` 防御非法语言值，`?? MESSAGES.zh[key]` 作为运行期兜底，
 * 保证界面不出现空文案。
 */
export function createTranslator(lang: UiLanguage): Translator {
    return (key, params) => {
        const dict = MESSAGES[lang] ?? MESSAGES.zh;
        let text: string = dict[key] ?? MESSAGES.zh[key];
        if (params) {
            for (const [name, value] of Object.entries(params)) {
                text = text.split(`{${name}}`).join(String(value));
            }
        }
        return text;
    };
}
