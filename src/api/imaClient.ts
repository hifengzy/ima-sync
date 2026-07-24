/**
 * ima OpenAPI 客户端：认证、节流、重试、统一错误处理（对应开发方案 4.1/4.4）。
 *
 * 传输层职责：
 *  - 注入鉴权 Header（ima-openapi-clientid / ima-openapi-apikey）
 *  - 经 RateLimiter 串行节流（2 QPS）+ 指数退避重试
 *  - 统一解析 {code,msg,data}，code!==0 抛业务错误
 *  - 提供 fetchUrl 下载二进制 / 网页（用于图片、文件、网页正文）
 */
import { requestUrl } from "obsidian";
import {
  NOTE_BASE_URL,
  WIKI_BASE_URL,
} from "../constants";
import type {
  DocContentData,
  DocContentRequest,
  ExportMediaRequest,
  ImaResponse,
  KnowledgeListData,
  KnowledgeListRequest,
  ListNoteData,
  ListNoteRequest,
  MediaInfo,
  MediaInfoRequest,
  SearchKbData,
  SearchKbRequest,
} from "./types";
import { RateLimiter, isRetryableStatus } from "../utils/rateLimiter";
import { isQuotaExceededResponse } from "./errors";
import { errorMessage } from "../utils/logger";

export interface FetchResult {
  arrayBuffer: ArrayBuffer;
  text: string;
  status: number;
  contentType: string;
}

export class ImaClient {
  clientId: string;
  apiKey: string;
  private readonly limiter: RateLimiter;

  constructor(clientId: string, apiKey: string, limiter?: RateLimiter) {
    this.clientId = clientId;
    this.apiKey = apiKey;
    this.limiter = limiter ?? new RateLimiter();
  }

  configure(clientId: string, apiKey: string): void {
    this.clientId = clientId;
    this.apiKey = apiKey;
  }

  /** 凭证是否已配置 */
  isConfigured(): boolean {
    return this.clientId.trim().length > 0 && this.apiKey.trim().length > 0;
  }

  /** 统一 POST 请求（经节流 + 重试） */
  private async request<T>(baseUrl: string, endpoint: string, body: unknown): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error("ima Client ID 或 API Key 未配置");
    }
    return this.limiter.execute<T>(async () => {
      try {
        const resp = await requestUrl({
          url: `${baseUrl}/${endpoint}`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ima-openapi-clientid": this.clientId,
            "ima-openapi-apikey": this.apiKey,
          },
          body: JSON.stringify(body),
          throw: false,
        });
        const status = resp.status ?? 200;
        if (isRetryableStatus(status)) {
          return { kind: "retryable", error: `[${endpoint}] 请求失败 (${status})` };
        }
        if (status >= 400) {
          // 优先用 resp.text 手动解析（Obsidian requestUrl 在 4xx 时 resp.json 可能不填充）
          let body: ImaResponse<unknown> | undefined;
          try {
            body = resp.json as ImaResponse<unknown> | undefined;
          } catch {
            body = undefined;
          }
          if (!body && resp.text) {
            try {
              body = JSON.parse(resp.text) as ImaResponse<unknown>;
            } catch {
              body = undefined;
            }
          }
          const msg = body?.msg;
          if (isQuotaExceededResponse(status, body)) {
            return { kind: "quota", error: msg || "请求超量，请明日再试" };
          }
          return {
            kind: "fatal",
            error: msg ? `[${endpoint}] ${msg}（HTTP ${status}）` : `[${endpoint}] HTTP ${status}`,
          };
        }
        const json = resp.json as ImaResponse<T> | undefined;
        if (!json) {
          return { kind: "retryable", error: `[${endpoint}] 响应解析失败` };
        }
        if (json.code !== 0) {
          // 业务错误（含 401 凭证无效）：不重试，直接抛出 msg（NFR-3.3 不泄露细节）
          return { kind: "fatal", error: json.msg || `[${endpoint}] 业务错误 code=${json.code}` };
        }
        return { kind: "success", value: json.data };
      } catch (e) {
        // 网络错误（连接/超时）可重试
        return { kind: "retryable", error: `[${endpoint}] 网络错误: ${errorMessage(e)}` };
      }
    });
  }

  /** 下载 URL（图片 / 文件 / 网页正文），经节流 + 重试 */
  async fetchUrl(url: string, headers?: Record<string, string>): Promise<FetchResult> {
    return this.limiter.execute<FetchResult>(async () => {
      try {
        const resp = await requestUrl({
          url,
          method: "GET",
          headers: headers ?? {},
          throw: false,
        });
        const status = resp.status ?? 200;
        if (isRetryableStatus(status)) {
          return { kind: "retryable", error: `下载失败 (${status})` };
        }
        if (status >= 400) {
          return { kind: "fatal", error: `下载失败 (${status})` };
        }
        const contentType = (resp.headers?.["content-type"] ?? "") as string;
        return {
          kind: "success",
          value: {
            arrayBuffer: resp.arrayBuffer,
            text: resp.text,
            status,
            contentType,
          },
        };
      } catch (e) {
        return { kind: "retryable", error: `下载网络错误: ${errorMessage(e)}` };
      }
    });
  }

  // ===== 原始端点（单次调用，不做分页） =====

  /** 知识库列表（单页） */
  searchKnowledgeBase(body: SearchKbRequest): Promise<SearchKbData> {
    return this.request<SearchKbData>(WIKI_BASE_URL, "search_knowledge_base", body);
  }

  /** 知识库内容列表（当前层级单页） */
  getKnowledgeList(body: KnowledgeListRequest): Promise<KnowledgeListData> {
    return this.request<KnowledgeListData>(WIKI_BASE_URL, "get_knowledge_list", body);
  }

  /** 媒体元信息 */
  getMediaInfo(body: MediaInfoRequest): Promise<MediaInfo> {
    return this.request<MediaInfo>(WIKI_BASE_URL, "get_media_info", body);
  }

  /** 导出媒体（备选下载） */
  exportMedia(body: ExportMediaRequest): Promise<{ media_content_url_info?: { url?: string } }> {
    return this.request(WIKI_BASE_URL, "export_media_for_ima_sandbox", body);
  }

  /** 笔记列表（单页） */
  listNotes(body: ListNoteRequest): Promise<ListNoteData> {
    return this.request<ListNoteData>(NOTE_BASE_URL, "list_note_by_folder_id", body);
  }

  /** 笔记正文（target_content_format=1 返回 Markdown） */
  getDocContent(body: DocContentRequest): Promise<DocContentData> {
    return this.request<DocContentData>(NOTE_BASE_URL, "get_doc_content", body);
  }
}
