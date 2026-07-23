/**
 * 知识库选择弹窗（对应开发方案 7.2 / PRD FR-2）。
 *
 * 调用方预先分页拉取全部知识库后传入；弹窗仅负责展示、模糊搜索与选择。
 * 已添加项标注「已添加」并禁止重复选择（FR-2.4）。
 */
import { App, FuzzySuggestModal, Notice } from "obsidian";
import type { KbInfo } from "../api/types";
import type { SelectedKb } from "../settings/types";

export class KbPickerModal extends FuzzySuggestModal<KbInfo> {
  private readonly allItems: KbInfo[];
  private readonly selectedIds: Set<string>;
  private readonly onChoose: (kb: KbInfo) => void;

  constructor(app: App, items: KbInfo[], selectedKbs: SelectedKb[], onChoose: (kb: KbInfo) => void) {
    super(app);
    this.allItems = items;
    this.selectedIds = new Set(selectedKbs.map((k) => k.kb_id));
    this.onChoose = onChoose;
    this.setPlaceholder("输入知识库名称搜索…");
    this.setInstructions([{ command: "↑↓", purpose: "选择" }, { command: "↵", purpose: "添加" }, { command: "esc", purpose: "取消" }]);
  }

  getItems(): KbInfo[] {
    return this.allItems;
  }

  getItemText(item: KbInfo): string {
    return item.kb_name;
  }

  renderSuggestion(item: { item: KbInfo }, el: HTMLElement): void {
    el.empty();
    const info = item.item;
    const meta = [info.base_type, info.role_type, info.content_count ? `${info.content_count} 篇` : null]
      .filter(Boolean)
      .join(" · ");
    const wrap = el.createDiv({ cls: "ima-sync-kb-item" });
    const left = wrap.createDiv({ cls: "ima-sync-kb-name" });
    left.createDiv({ text: info.kb_name, cls: "kb-title" });
    if (meta) left.createDiv({ text: meta, cls: "kb-meta" });
    if (this.selectedIds.has(info.kb_id)) {
      wrap.createDiv({ text: "已添加", cls: "kb-badge" });
    }
  }

  onChooseItem(item: KbInfo): void {
    if (this.selectedIds.has(item.kb_id)) {
      new Notice(`「${item.kb_name}」已添加`, 3000);
      return;
    }
    this.onChoose(item);
  }
}
