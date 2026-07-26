# Ima Copilot Sync

[![GitHub release](https://img.shields.io/github/v/release/hifengzy/ima-sync?include_prereleases)](https://github.com/hifengzy/ima-sync/releases)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.6.0%2B-7C3AED)](https://obsidian.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4%2B-3178C6)](https://www.typescriptlang.org/)

One-way sync your [Tencent IMA](https://ima.qq.com/) knowledge base and notes into Obsidian: web clippings auto-converted to Markdown, images downloaded locally, file attachments (PDF/Word/PPT) saved as-is, all with frontmatter metadata for offline search.

> [中文文档](README_cn.md)

## Features

- **Multi Knowledge Base Sync**: Add multiple knowledge bases, each synced into its own folder with mirrored directory structure.
- **Notes Sync**: Sync standalone notes into a `Notes/` subfolder, toggleable on/off.
- **Automatic Content Conversion**:
  - Notes and articles converted to Markdown (auto-adapts to HTML, Markdown, or plain text input).
  - Web articles downloaded and converted to Markdown with source link preserved; graceful fallback on failure.
  - PDF / Word / PPT / Excel / images downloaded as-is, with auto-generated `.md` stub for searchability.
- **Image Localization**: Inline images downloaded to attachment directory (`per-kb` or Obsidian global setting), links rewritten to `![[local-file]]` wikilinks.
- **Smart Incremental Sync**: Uses `doc_id` as primary key. Standalone notes compared by `modify_time`; wiki items use "skip if exists" strategy (API limitation). Clear cache to trigger full re-sync.
- **Frontmatter Metadata**: Writes `title` / `created` / `source` / `tags` to each document. User-added properties preserved on update.
- **Scheduled Auto Sync**: Configurable interval (minutes/hours/days), min interval guard at 5 minutes. Mutex prevents concurrent syncs.
- **Cache Management**: "Clear Cache" button (with confirmation) resets sync index only — documents and settings are untouched.
- **Quota Protection**: Detects API quota exceeded and immediately halts sync with a notice.
- **Privacy First**: API Key masked in settings. Credentials stored locally only. All requests go to `ima.qq.com` exclusively.

## Installation

### From Release

1. Download `main.js`, `manifest.json`, `styles.css` from the latest [Release](https://github.com/hifengzy/ima-sync/releases).
2. Create `.obsidian/plugins/ima-sync/` in your vault.
3. Copy the three files into that directory.
4. Obsidian → Settings → Community Plugins → turn off Safe Mode → enable "Ima Copilot Sync".

### From Source

```bash
git clone https://github.com/hifengzy/ima-sync.git
cd ima-sync
npm install
npm run build    # produces main.js
```

Copy `main.js`, `manifest.json`, `styles.css` into `.obsidian/plugins/ima-sync/` and enable.

## Configuration

### Get IMA API Credentials

1. Visit [IMA Open Platform](https://ima.qq.com/agent-interface) to obtain your **Client ID** and **API Key**.

### Plugin Settings

1. Obsidian → Settings → Ima Copilot Sync.
2. **IMA Auth**: Enter Client ID and API Key, click "Verify" to test.
3. **Knowledge Bases**: Click "Add KB", select from the list (multiple supported).
4. **Notes Sync**: Toggle standalone notebook sync.
5. **Sync Root Path**: Set the target root directory (relative path, e.g. `ima` or `A/B`).
6. **Attachments**: `per-kb` (inside each KB folder) or `obsidian-global` (inherit Obsidian's global setting).
7. **Auto Sync**: Optionally enable scheduled sync with configurable interval.
8. Click "Sync Now" or use the ribbon button.

## Directory Structure

```
<vault>/
└── ima/                          # sync root (user-configured)
    ├── KB-A/                      # each knowledge base as a folder
    │   ├── article-1.md
    │   ├── subfolder/             # mirrors IMA folder hierarchy
    │   │   └── article-2.md
    │   ├── report.pdf
    │   ├── report.md              # stub for file attachments
    │   └── attachments/           # per-kb attachment mode
    │       └── doc123-1.png
    ├── KB-B/
    │   └── ...
    └── Notes/                     # when notes sync is enabled
        ├── note-1.md
        └── ...
```

## Sync Strategy

| Content Type | Handling |
|-------------|----------|
| KB Notes | Fetch body → Markdown conversion → image localization |
| Web Articles / Links | Download HTML → extract body → Markdown conversion → image localization; graceful degradation on failure |
| Files (PDF/Word/PPT/Excel/images) | Download original + generate `.md` stub with metadata and file link |
| Standalone Notes | `list_note_by_folder_id` → `get_doc_content` → Markdown conversion |
| Folders | Recursively traverse sub-levels, mirror locally |

**Incremental sync**: standalone notes compared by `modify_time`; wiki items use "skip if exists" due to API not returning `update_time`. Deletion is **conservative** — files removed on IMA are kept locally. To rebuild from scratch, clear the cache and sync again.

## Rate Limiting & Retry

- 2 QPS serial throttling (`RateLimiter`).
- 30-second request timeout (`REQUEST_TIMEOUT_MS`).
- Retryable errors (5xx, network errors) with exponential backoff: 1s → 2s → 4s, cap 8s, max 3 retries.
- Business errors (401, quota exceeded) are fatal and do not retry.

## Development

```bash
npm run dev              # watch mode with sourcemaps
npm run build            # type-check + production build
npm run typecheck        # type-check only

# verification tests
npm run verify:frontmatter
npm run verify:quota
npm run verify:naming
npm run verify:unit

# E2E smoke test (requires real API credentials)
npm run test:build
IMA_CLIENT_ID=xxx IMA_API_KEY=xxx npm test
```

## Project Structure

```
src/
├── api/              # IMA OpenAPI client
│   ├── imaClient.ts      # auth, throttling, retry, fetchUrl
│   ├── endpoints.ts      # pagination and recursive traversal
│   ├── errors.ts         # tiered errors (fatal / retryable / quota)
│   └── types.ts          # API data types
├── sync/             # sync engine
│   ├── SyncManager.ts    # core orchestration
│   ├── SyncIndex.ts      # local sync index (doc_id → metadata)
│   └── SyncState.ts      # mutex lock
├── transform/        # content conversion
│   ├── htmlToMarkdown.ts
│   ├── frontmatter.ts    # properties construction and writing
│   ├── imageDownloader.ts
│   ├── fileDownloader.ts
│   ├── webArticle.ts     # web page body extraction
│   └── imageNaming.ts
├── ui/               # UI components
│   ├── KbPickerModal.ts  # knowledge base picker (fuzzy search)
│   ├── ConfirmModal.ts   # confirmation dialog
│   └── ProgressNotice.ts # progress and summary notices
├── settings/         # settings
│   ├── types.ts          # config types and defaults
│   └── SettingTab.ts     # settings UI
├── utils/            # utilities
│   ├── path.ts           # path, filename sanitization, attachment dir
│   ├── rateLimiter.ts    # 2 QPS throttling
│   └── logger.ts         # console wrapper with [imasync] prefix
├── main.ts           # plugin entry: lifecycle, commands, ribbon, scheduler
└── constants.ts      # URLs, enums, defaults
```

## Privacy

- Credentials stored only in local `data.json` (excluded from git).
- API Key masked in settings UI.
- All API requests sent exclusively to `https://ima.qq.com`.
- One-way sync (IMA → Obsidian). Never writes back or deletes from IMA.
- Error messages never expose credentials.

## License

MIT © [hifengzy](https://github.com/hifengzy)
