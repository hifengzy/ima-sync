/**
 * 全局常量：端点 URL、默认值、MediaType 枚举、文件名非法字符。
 */

/** ima OpenAPI 基础 URL */
export const WIKI_BASE_URL = "https://ima.qq.com/openapi/wiki/v1";
export const NOTE_BASE_URL = "https://ima.qq.com/openapi/note/v1";

/** 限流与重试 */
export const DEFAULT_QPS = 2;
export const MAX_RETRIES = 3;
export const REQUEST_TIMEOUT_MS = 30_000;
/** 退避序列：1s -> 2s -> 4s，上限 8s */
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 8_000;

/** 分页大小（ima OpenAPI 限制 limit ∈ (0, 20]） */
export const LIST_PAGE_SIZE = 20;

/** 调试探针开关（发布版应为 false，避免泄露 API 响应结构） */
export const ENABLE_PROBE = false;
export const DEFAULT_TAG = "clippings";

/** 同步索引文件名（独立于 data.json） */
export const SYNC_INDEX_FILENAME = "sync-index.json";

/** 文件名非法字符（PRD FR-4.5） */
export const ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;

/** 附件目录名（per-kb 模式） */
export const ATTACHMENT_DIR_NAME = "attachments";

/** 笔记同步子目录名 */
export const NOTES_DIR_NAME = "Notes";

/**
 * ima MediaType 枚举（已探针确认部分）。
 * 其余文件类型（PDF/WORD/PPT/EXCEL/IMG/TXT）的精确枚举值未公布，
 * 统一通过 get_media_info 的 url_info + 下载响应 Content-Type 判定，不依赖具体数值。
 */
export enum MediaType {
  /** 知识库内笔记 */
  NOTE = 11,
  /** 文件夹（递归拉取子层级） */
  FOLDER = 99,
  /** 微信文章 / 链接类（网页收藏） */
  WEB_ARTICLE = 6,
}

/** 判定是否为文件夹 */
export const isFolder = (mediaType: number): boolean =>
  (mediaType as MediaType) === MediaType.FOLDER;

/** 判定是否为知识库内笔记（media_type=11 或带 notebook_id） */
export const isNoteType = (mediaType: number, notebookId?: string | null): boolean =>
  (mediaType as MediaType) === MediaType.NOTE || Boolean(notebookId);
