/**
 * frontmatter（properties）构造与写入（对应开发方案 6.6 / PRD FR-9）。
 *
 * 可见属性：title / created / source / tags（默认 ["clippings"]）
 * 内部索引属性：ima_doc_id / ima_kb_id / ima_kb_name / ima_update_time / synced_at
 *
 * 写入策略：
 *  - 新建：拼接完整 YAML + 正文一次性写入
 *  - 更新：processFrontMatter 原子改 properties；可见属性仅在缺失时补，内部属性始终更新（FR-9.4）
 */
import type { App, TFile } from "obsidian";
import { DEFAULT_TAG } from "../constants";

export interface FrontmatterProps {
  title: string;
  /** ISO 字串 YYYY-MM-DDTHH:mm:ss；wiki 条目无创建时间时省略 */
  created?: string;
  /** 来源 URL，无则省略 */
  source?: string;
  tags: string[];
  ima_doc_id: string;
  ima_kb_id: string;
  ima_kb_name: string;
  /** ima 侧更新时间（秒，字符串）；无则为空 */
  ima_update_time: string;
  /** 本次同步时间 ISO */
  synced_at: string;
}

/** 双引号转义字符串 */
function yamlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** ISO 时间戳 / 纯数字等安全标量：裸输出 */
function isSafeScalar(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s) || /^\d+$/.test(s);
}

/** 构造 frontmatter YAML 文本（不含首尾 ---） */
export function buildFrontmatterYaml(props: FrontmatterProps): string {
  const lines: string[] = [];
  lines.push(`title: ${yamlString(props.title)}`);
  if (props.created) {
    lines.push(`created: ${props.created}`);
  }
  if (props.source) {
    lines.push(`source: ${yamlString(props.source)}`);
  }
  lines.push("tags:");
  for (const tag of props.tags.length > 0 ? props.tags : [DEFAULT_TAG]) {
    lines.push(`  - ${tag}`);
  }
  lines.push(`ima_doc_id: ${yamlString(props.ima_doc_id)}`);
  lines.push(`ima_kb_id: ${yamlString(props.ima_kb_id)}`);
  lines.push(`ima_kb_name: ${yamlString(props.ima_kb_name)}`);
  lines.push(`ima_update_time: ${isSafeScalar(props.ima_update_time) ? props.ima_update_time : yamlString(props.ima_update_time)}`);
  lines.push(`synced_at: ${props.synced_at}`);
  return lines.join("\n");
}

/** 构造完整 Markdown（frontmatter + 正文），用于新建文件 */
export function buildMarkdownWithFrontmatter(props: FrontmatterProps, body: string): string {
  return `---\n${buildFrontmatterYaml(props)}\n---\n\n${body.trimStart()}\n`;
}

/**
 * 更新已存在文件的 properties（processFrontMatter 原子写入，1.4.4+）。
 * 可见属性仅缺失时补；内部属性始终覆盖（FR-9.4）。
 */
export async function updateFrontmatter(app: App, file: TFile, props: FrontmatterProps): Promise<void> {
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    // 可见属性：仅缺失时补
    if (!fm.title) fm.title = props.title;
    if (props.created && !fm.created) fm.created = props.created;
    if (props.source && !fm.source) fm.source = props.source;
    const tags = fm.tags;
    const tagsEmpty = tags === undefined || tags === null || (Array.isArray(tags) && tags.length === 0);
    if (tagsEmpty) fm.tags = props.tags.length > 0 ? props.tags : [DEFAULT_TAG];
    // 内部属性：始终更新
    fm.ima_doc_id = props.ima_doc_id;
    fm.ima_kb_id = props.ima_kb_id;
    fm.ima_kb_name = props.ima_kb_name;
    fm.ima_update_time = props.ima_update_time;
    fm.synced_at = props.synced_at;
  });
}
