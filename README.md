# Ima Copilot Sync

[![GitHub release](https://img.shields.io/github/v/release/hifengzy/ima-sync?include_prereleases)](https://github.com/hifengzy/ima-sync/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.6.0%2B-7C3AED)](https://obsidian.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4%2B-3178C6)](https://www.typescriptlang.org/)

将腾讯 [ima](https://ima.qq.com/) 知识库与笔记**单向同步**到 Obsidian：网页收藏自动转 Markdown、图片下载本地化、PDF/Word/PPT 等文档原文落地，独立笔记一并同步，所有内容带元数据可离线检索。

## 功能特性

- **知识库多选同步**：支持添加多个知识库，各自落到同名子目录，层级结构镜像。
- **笔记同步**：独立笔记本全量同步到 `Notes/` 子目录，开关控制。
- **内容自动转换**：
  - 笔记/文章正文转 Markdown（支持 HTML/Markdown/纯文本三种格式，自动适配）。
  - 网页收藏下载原文并转为 Markdown（正文顶部保留来源链接），失败自动降级。
  - PDF / Word / PPT / Excel / 图片等原文件下载，自动生成同名 `.md` 占位条目可检索。
- **图片本地化**：正文图片自动下载到附件目录（`per-kb` 或跟随 Obsidian 全局设置），链接改写为 `![[本地文件]]`，下载失败保留外链。
- **智能增量更新**：以 `doc_id` 为主键，独立笔记用 `modify_time` 比对增量；wiki 条目因 API 不返回更新时间采用「存在即跳过」，可通过清空缓存触发全量重新同步。
- **元数据写入**：每篇文档写入 `title` / `created` / `source` / `tags` properties，更新时保留用户自定义属性，内部索引字段独立存储于 `sync-index.json`。
- **自动定时同步**：可配置频次（分钟/小时/天），分钟级下限保护为 5 分钟；同步互斥（进行中再次触发自动跳过）。
- **缓存管理**：设置页提供「清空缓存」入口（二次确认），仅清同步索引，不删已同步文档，不清凭证与设置。
- **配额超限保护**：检测到 ima API 配额超限立即中止同步并提示，不浪费请求额度。
- **隐私优先**：API Key 密码框遮蔽，凭证仅本地存储，请求只发往 `ima.qq.com`。

## 安装

### 从 Release 安装

1. 前往 [Releases](https://github.com/hifengzy/ima-sync/releases) 下载最新版 `main.js`、`manifest.json`、`styles.css`。
2. 在 Obsidian 仓库的 `.obsidian/plugins/` 下创建 `ima-sync/` 目录。
3. 将三个文件放入该目录。
4. Obsidian → 设置 → 第三方插件 → 关闭安全模式 → 启用「ima.copilot To Obsidian」。

### 从源码构建

```bash
git clone https://github.com/hifengzy/ima-sync.git
cd ima-sync
npm install
npm run build    # 生成 main.js / main.js.map
```

将 `main.js`、`manifest.json`、`styles.css` 复制到 `.obsidian/plugins/ima-sync/` 目录后启用。

## 配置

### 获取 ima API 凭证

1. 打开 [ima 开放平台](https://ima.qq.com/agent-interface) 获取 **Client ID** 与 **API Key**。

### 插件设置

1. Obsidian → 设置 → ima.copilot To Obsidian。
2. **ima 认证**：填入 Client ID 与 API Key，点击「验证」按钮测试连接。
3. **同步知识库**：点击「添加知识库」从 ima 拉取列表，勾选要同步的知识库（可多选）。
4. **笔记同步**：开关独立笔记本同步。
5. **同步根目录**：设置同步落地根目录（相对路径，如 `ima` 或 `A/B`，默认 `ima`）。
6. **附件存放**：二选一 — `per-kb`（知识库内 `attachments/` 子目录）或 `obsidian-global`（跟随 Obsidian 全局附件目录设置）。
7. **自动同步**：可选开启定时同步并配置频次。
8. 点击「立即同步」或在侧边栏（ribbon）一键触发。

## 同步目录结构

```
<vault>/
└── ima/                          # 同步根目录（用户配置）
    ├── 知识库A/                   # 每个知识库为同名子目录
    │   ├── 文章1.md
    │   ├── 子文件夹/              # 保留 ima 文件夹层级
    │   │   └── 文章2.md
    │   ├── 报告.pdf
    │   ├── 报告.md               # 同名占位条目
    │   └── attachments/          # per-kb 附件模式
    │       └── doc123-1.png
    ├── 知识库B/
    │   └── ...
    └── Notes/                     # 笔记同步开启时
        ├── 笔记1.md
        └── ...
```

## 同步策略

| 内容类型 | 处理方式 |
|---------|---------|
| 知识库内笔记 | ima API 拉取正文 → 转 Markdown → 图片本地化 |
| 网页文章 / 链接收藏 | 下载原网页 HTML → 正文提取 → 转 Markdown → 图片本地化；失败降级为标题+链接+摘要 |
| 文件（PDF/Word/PPT/Excel/图片等） | 原文下载 + 生成同名 `.md` 占位条目（含元数据与文件链接） |
| 独立笔记 | `list_note_by_folder_id` 全量拉取 + 正文转 Markdown |
| 文件夹 | 递归遍历子层级，本地镜像创建同名目录 |

**增量更新**：独立笔记以 `modify_time` 比对；wiki 条目 API 不返回 `update_time`，采用「存在即跳过」（API 客观限制）。删除策略为**保守保留** —— ima 侧移除的内容本地文件不会自动删除。如需从零全量重建，可清空缓存后再次同步。

## 限流与重试

- 2 QPS 串行节流（`RateLimiter`）。
- 超时 30 秒（`REQUEST_TIMEOUT_MS`）。
- 可重试错误（5xx、网络错误）指数退避：1s → 2s → 4s，上限 8s，最多 3 次。
- 业务错误（401、配额超限等）不重试，直接报错或中止同步。

## 开发

```bash
npm run dev              # 监听模式构建（sourcemap）
npm run build            # 类型检查 + 生产构建
npm run typecheck        # 仅类型检查

# 验证测试
npm run verify:frontmatter
npm run verify:quota
npm run verify:naming
npm run verify:unit

# 端到端冒烟测试（需真实 API 凭证）
npm run test:build
IMA_CLIENT_ID=xxx IMA_API_KEY=xxx npm test
```

## 项目结构

```
src/
├── api/              # ima OpenAPI 封装
│   ├── imaClient.ts      # 鉴权、限流、重试、fetchUrl
│   ├── endpoints.ts      # 分页拉取与递归遍历
│   ├── errors.ts         # 分层错误（fatal / retryable / quota）
│   └── types.ts          # API 数据类型
├── sync/             # 同步引擎
│   ├── SyncManager.ts    # 核心编排：互斥、递归、智能更新、内容落地
│   ├── SyncIndex.ts      # 本地同步索引（doc_id → 元信息）
│   └── SyncState.ts      # 互斥锁
├── transform/        # 内容转换
│   ├── htmlToMarkdown.ts  # HTML → Markdown（turndown，GFM 风格）
│   ├── frontmatter.ts     # properties 构造与写入
│   ├── imageDownloader.ts # 图片下载、命名、引用替换
│   ├── fileDownloader.ts  # 二进制文件下载
│   ├── webArticle.ts      # 网页正文提取
│   └── imageNaming.ts     # 图片命名防冲突
├── ui/               # UI 组件
│   ├── KbPickerModal.ts   # 知识库选择弹窗（模糊搜索）
│   ├── ConfirmModal.ts    # 二次确认弹窗
│   └── ProgressNotice.ts  # 进度与汇总通知
├── settings/         # 设置
│   ├── types.ts          # 配置项类型与默认值
│   └── SettingTab.ts     # 设置页 UI
├── utils/            # 工具
│   ├── path.ts           # 路径处理、文件名校验、附件目录解析
│   ├── rateLimiter.ts    # 2 QPS 限流
│   └── logger.ts         # 带 [ima-sync] 前缀的控制台日志
├── main.ts           # 插件入口：生命周期、命令、ribbon、定时器
└── constants.ts      # 端点 URL、枚举、默认值
```

## 隐私

- 凭证仅存储在本地 `data.json`（已被 `.gitignore` 排除）。
- API Key 在设置页密码框遮蔽显示。
- 所有 API 请求只发往 `https://ima.qq.com`。
- 单向同步（ima → Obsidian），不回写、不删除 ima 内容。
- 错误提示不泄露凭证信息。

## 许可证

MIT © [hifengzy](https://github.com/hifengzy)
