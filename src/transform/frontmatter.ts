/**
 * frontmatter（properties）构造与写入（对应开发方案 6.6 / PRD FR-9）。
 *
 * 可见属性仅：title / created（同步到 Obsidian 的时间）/ source（来源URL，无则省略）/ tags
 *
 * 内部索引字段（doc_id / kb_id / update_time / synced_at）不写入 frontmatter，
 * 统一存于 sync-index.json，避免污染文档元数据（PRD FR-9.2 迭代修正）。
 * 冲突检测改用 sync-index 反查，不再依赖 frontmatter 的 ima_doc_id。
 *
 * 写入策略：
 *  - 新建：拼接完整 YAML + 正文一次性写入
 *  - 更新：processFrontMatter 原子改 properties；可见属性仅在缺失时补；
 *          同时清除旧版本残留的内部字段（ima_* / synced_at）
 */
import type { App, TFile } from "obsidian";
import { DEFAULT_TAG } from "../constants";

export interface FrontmatterProps {
  title: string;
  /** 同步到 Obsidian 的时间（秒级 ISO YYYY-MM-DDTHH:mm:ss） */
  created: string;
  /** 来源 URL，无则省略 */
  source?: string;
  tags: string[];
}

/** 双引号转义字符串 */
function yamlString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
  return lines.join("\n");
}

/** 构造完整 Markdown（frontmatter + 正文），用于新建文件 */
export function buildMarkdownWithFrontmatter(props: FrontmatterProps, body: string): string {
  return `---\n${buildFrontmatterYaml(props)}\n---\n\n${body.trimStart()}\n`;
}

/** 旧版本残留的内部字段，更新时清除（不显示在文档元数据中） */
const LEGACY_INTERNAL_KEYS = [
  "ima_doc_id",
  "ima_kb_id",
  "ima_kb_name",
  "ima_update_time",
  "synced_at",
] as const;

/**
 * 更新已存在文件的 properties（processFrontMatter 原子写入，1.4.4+）。
 * 可见属性仅缺失时补；同时清除旧版本残留的内部字段（FR-9.4 迭代修正）。
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
    // 清除旧版本残留的内部字段
    for (const key of LEGACY_INTERNAL_KEYS) {
      if (key in fm) delete fm[key];
    }
  });
}
