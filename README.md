# ima.copilot To Obsidian

将腾讯 [ima](https://ima.qq.com/) 知识库与笔记**单向同步**到 Obsidian：网页收藏自动转 Markdown、图片本地化、文档原文下载，独立笔记也一并落地，所有内容带元数据可检索。

## 功能特性

- **知识库同步**：递归遍历所选知识库的文件夹层级，网页文章（微信等）正文转 Markdown，PDF/Word/PPT 等文档原文下载并生成条目。
- **笔记同步**：独立笔记本全量拉取，正文以 Markdown 落地到 `Notes/` 目录。
- **图片本地化**：正文内联图片下载到附件目录，链接改写为 `![[本地文件]]`，离线可阅。
- **智能增量更新**：以 `doc_id` 为主键、`update_time` 比对，仅同步变更项；wiki 条目不公开更新时间时采用「存在即跳过」。
- **元数据保留**：每篇文档写入 Obsidian properties（`title` / `created` / `source` / `tags`）与内部同步字段，更新时保留你手动添加的自定义属性。
- **自动定时同步**：可配置频次（分钟/小时/天），分钟级下限保护为 5 分钟。
- **隐私优先**：凭证仅本地存储（`data.json`），请求只发往 `ima.qq.com`，不上传任何内容到第三方。

## 安装

### 手动安装

1. 下载 [`main.js`](releases)、`manifest.json`、`styles.css`。
2. 在 Obsidian 仓库下创建 `.obsidian/plugins/ima-sync/` 目录。
3. 将三个文件放入该目录。
4. Obsidian → 设置 → 第三方插件 → 关闭安全模式 → 启用「ima.copilot To Obsidian」。

### 从源码构建

```bash
git clone https://github.com/hifengzy/ima-sync.git
cd ima-sync
npm install
npm run build    # 生成 main.js
```

将 `main.js`、`manifest.json`、`styles.css` 复制到插件的 `.obsidian/plugins/ima-sync/` 目录即可。

## 配置

### 获取 ima API 凭证

1. 打开 [ima.copilot](https://ima.qq.com/) → 设置 → 开放平台。
2. 创建应用，获取 **Client ID** 与 **API Key**。

### 插件设置

1. Obsidian → 设置 → ima.copilot To Obsidian。
2. **ima 认证**：填入 Client ID 与 API Key，点击「验证连接」。
3. **同步知识库**：点击「添加知识库」，勾选要同步的知识库。
4. **笔记同步**：开关独立笔记本同步。
5. **同步根目录**：设置落地根目录（默认 `ima`）。
6. **附件存放**：`per-kb`（每个知识库独立 attachments 子目录）或 `obsidian-global`（用 Obsidian 全局附件目录，未配置则回退 per-kb）。
7. **自动同步**：可选配置定时频次。
8. 点击「立即同步」或等待定时触发。

## 同步策略

| 内容类型 | 处理方式 |
|---------|---------|
| 网页文章（media_type=6） | 下载 HTML → 提取正文 → 转 Markdown，图片本地化 |
| 知识库内笔记（media_type=11） | `get_doc_content` 拉 Markdown 正文 |
| 文档（PDF/Word/PPT 等） | 下载原文到附件目录，生成 `.md` 占位条目（含链接） |
| 文件夹（media_type=99） | 递归拉取子层级，保留文件夹结构 |
| 独立笔记 | `list_note_by_folder_id` 全量分页 + `get_doc_content` |

**增量更新**：独立笔记用 `modify_time`（毫秒）比对；wiki 条目 API 不返回 `update_time`，采用「存在即跳过」（API 客观限制）。删除是保守的——本地文件不会被自动删除。

**清空缓存**：设置页底部「缓存数据」->「清空缓存」可一键清除本地同步索引（`sync-index.json`）。清空后下次同步将全量重新拉取所有内容（不再跳过）。仅清索引，不删除已同步文档，不清除凭证与设置。适合需要重复全量同步或测试的场景。

## 限流与重试

- 2 QPS 串行节流（避免触发 API 限流）。
- 可重试错误（5xx、网络超时）指数退避重试：1s → 2s → 4s，上限 8s，最多 3 次。
- 业务错误（如凭证无效 401）不重试，直接报错。

## 开发

```bash
npm run dev        # 监听模式构建（带 sourcemap）
npm run build      # 类型检查 + 生产构建
npm run typecheck  # 仅类型检查
```

### 端到端冒烟测试

用真实 API 凭证验证 API 集成层（ImaClient + ImaApi）：

```bash
npm run test:build
IMA_CLIENT_ID=你的ClientID IMA_API_KEY=你的APIKey npm test
```

测试覆盖：知识库列表分页、笔记全量翻页、笔记正文、知识库层级、媒体元信息。

## 项目结构

```
src/
├── api/           # ima OpenAPI 客户端与高层封装
│   ├── imaClient.ts    # 鉴权、节流、重试、fetchUrl
│   ├── endpoints.ts    # 分页与递归拉取
│   └── types.ts        # API 类型定义
├── sync/          # 同步引擎
│   ├── SyncManager.ts  # 核心编排
│   ├── SyncIndex.ts    # 增量索引
│   └── SyncState.ts    # 互斥锁
├── transform/     # 内容转换
│   ├── htmlToMarkdown.ts
│   ├── frontmatter.ts
│   ├── imageDownloader.ts
│   ├── fileDownloader.ts
│   └── webArticle.ts
├── ui/            # 设置页与进度提示
├── settings/      # 设置类型与 SettingTab
└── utils/         # 路径、限流、日志工具
```

## 隐私

- 凭证仅存储在本地 `data.json`（已被 `.gitignore` 排除）。
- API Key 在设置页遮蔽显示。
- 所有 API 请求只发往 `https://ima.qq.com`。
- 同步是单向的（ima → Obsidian），不会回写或删除 ima 内容。
- 错误提示不泄露凭证细节。

## 许可证

MIT
