/**
 * 高层 API：分页与递归拉取（对应开发方案 4.2）。
 *
 * 列表端点只返回当前层级 + 单页，这里负责：
 *  - 分页：cursor 翻页直到 is_end
 *  - 知识库内容：仅当前层级（folder 递归由 SyncManager 负责，以保留文件夹层级）
 *  - 笔记：全量分页
 */
import { ImaClient } from "./imaClient";
import { LIST_PAGE_SIZE } from "../constants";
import type {
  KbInfo,
  KnowledgeListItem,
  MediaInfo,
  NoteBasicInfo,
} from "./types";

export interface KnowledgeLevelPage {
  items: KnowledgeListItem[];
  isEnd: boolean;
}

export class ImaApi {
  constructor(private readonly client: ImaClient) {}

  /** 全量分页拉取所有知识库 */
  async listAllKnowledgeBases(): Promise<KbInfo[]> {
    const all: KbInfo[] = [];
    let cursor = "";
    while (true) {
      const data = await this.client.searchKnowledgeBase({
        query: "",
        cursor,
        limit: LIST_PAGE_SIZE,
      });
      const list = data.info_list ?? [];
      all.push(...list);
      if (data.is_end || list.length === 0) break;
      cursor = data.next_cursor ?? "";
      if (!cursor) break;
    }
    return all;
  }

  /**
   * 拉取知识库某层级的全部条目（分页直到 is_end）。
   * 文件夹（media_type=99）在此返回，由 SyncManager 决定递归。
   */
  async listKnowledgeLevel(kbId: string, folderId: string): Promise<KnowledgeLevelPage> {
    const items: KnowledgeListItem[] = [];
    let cursor = "";
    while (true) {
      const data = await this.client.getKnowledgeList({
        knowledge_base_id: kbId,
        cursor,
        limit: LIST_PAGE_SIZE,
        folder_id: folderId,
      });
      const list = data.knowledge_list ?? [];
      items.push(...list);
      if (data.is_end || list.length === 0) break;
      cursor = data.next_cursor ?? "";
      if (!cursor) break;
    }
    return { items, isEnd: true };
  }

  /** 媒体元信息 */
  async getMediaInfo(mediaId: string): Promise<MediaInfo> {
    return this.client.getMediaInfo({ media_id: mediaId });
  }

  /** 笔记正文（Markdown） */
  async getDocContent(docId: string): Promise<string> {
    const data = await this.client.getDocContent({
      doc_id: docId,
      target_content_format: 1,
    });
    return data.content ?? "";
  }

  /** 全量分页拉取所有独立笔记 */
  async listAllNotes(): Promise<NoteBasicInfo[]> {
    const all: NoteBasicInfo[] = [];
    let offset = 0;
    while (true) {
      const data = await this.client.listNotes({
        folder_id: "",
        cursor: String(offset),
        limit: LIST_PAGE_SIZE,
      });
      const list = data.note_book_list ?? [];
      for (const entry of list) {
        const info = entry?.basic_info?.basic_info;
        if (info?.docid) all.push(info);
      }
      offset += list.length;
      // note 端点不返回 next_cursor，cursor 实为数字 offset（探针确认）；is_end 或空页即终止
      if (data.is_end || list.length === 0) break;
    }
    return all;
  }

  /** 备选下载：导出媒体获取下载 URL */
  async getExportMediaUrl(mediaId: string): Promise<string | null> {
    const data = await this.client.exportMedia({ media_id: mediaId });
    return data?.media_content_url_info?.url ?? null;
  }
}
