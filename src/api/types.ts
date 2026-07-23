/**
 * ima OpenAPI 请求 / 响应数据模型类型。
 * 字段基于 2026-07-24 实际探针确认（非文档假设）。
 */

/** 统一响应结构 */
export interface ImaResponse<T> {
  code: number;
  msg: string;
  data: T;
  request_id?: string;
}

// ===== search_knowledge_base =====

export interface KbInfo {
  kb_id: string;
  kb_name: string;
  cover_url: string;
  member_count: string;
  content_count: string;
  description: string;
  creator: string;
  /** 字符串角色，如「创建者」「普通成员」（探针确认非数字） */
  role_type: string;
  /** 知识库类型描述（探针确认），如「个人知识库」「共享知识库」「我创建的订阅知识库」「我加入的订阅知识库」 */
  base_type: string;
}

export interface SearchKbData {
  info_list: KbInfo[];
  is_end: boolean;
  next_cursor: string;
}

// ===== get_knowledge_list =====

export interface KnowledgeListItem {
  media_id: string;
  media_type: number;
  title: string;
  parent_folder_id: string;
  tags: string[];
  /** 文件夹的 media_id 以 "folder_" 开头，本身即 folder_id */
  folder_info?: { folder_id: string };
  /** 探针确认：列表层不返回 create_time / update_time */
}

export interface KnowledgeListData {
  knowledge_list: KnowledgeListItem[];
  is_end: boolean;
  next_cursor: string;
  current_path?: Array<{
    folder_id: string;
    name: string;
    file_number: string;
    folder_number: string;
    parent_folder_id: string;
    is_top: boolean;
  }>;
}

// ===== get_media_info =====

export interface UrlInfo {
  url: string;
  headers: Record<string, string>;
}

export interface NotebookExtInfo {
  notebook_id: string;
}

export interface MediaInfo {
  media_type: number;
  url_info: UrlInfo | null;
  notebook_ext_info: NotebookExtInfo | null;
  /** 部分类型可能返回时间戳（防御性读取） */
  update_time?: string;
  create_time?: string;
  title?: string;
}

// ===== list_note_by_folder_id =====

export interface NoteBasicInfo {
  docid: string;
  title: string;
  summary: string;
  /** 毫秒时间戳字符串（13 位） */
  create_time: string;
  /** 毫秒时间戳字符串（13 位） */
  modify_time: string;
  status: number;
  folder_id: string;
  folder_name: string;
}

export interface NoteBookEntry {
  basic_info: { basic_info: NoteBasicInfo };
}

export interface ListNoteData {
  is_end: boolean;
  next_cursor: string;
  note_book_list: NoteBookEntry[];
}

// ===== get_doc_content =====

export interface DocContentData {
  /** target_content_format=1 时返回 Markdown（探针确认），可能含少量内联 HTML */
  content: string;
}

// ===== 请求体 =====

export interface SearchKbRequest {
  query: string;
  cursor: string;
  limit: number;
}

export interface KnowledgeListRequest {
  knowledge_base_id: string;
  cursor: string;
  limit: number;
  folder_id: string;
}

export interface MediaInfoRequest {
  media_id: string;
}

export interface ListNoteRequest {
  folder_id: string;
  cursor: string;
  limit: number;
}

export interface DocContentRequest {
  doc_id: string;
  target_content_format: number;
}

export interface ExportMediaRequest {
  media_id: string;
}
