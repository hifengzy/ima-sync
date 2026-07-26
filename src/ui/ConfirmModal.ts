/**
 * 通用二次确认对话框（基于 Modal）。
 *
 * 不使用浏览器原生 confirm()——在 Obsidian (Electron) 环境下 confirm() 同步阻塞
 * 渲染进程，会导致 Obsidian 假死甚至崩溃。改用 Modal 异步确认。
 */
import { App, Modal } from "obsidian";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
}

export class ConfirmModal extends Modal {
  constructor(app: App, private readonly opts: ConfirmOptions) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.opts.title);
    this.contentEl.createEl("p", {
      text: this.opts.message,
      cls: "ima-sync-confirm-message",
    });
    const btns = this.contentEl.createDiv({ cls: "ima-sync-confirm-btns" });
    const cancelBtn = btns.createEl("button", { text: this.opts.cancelText ?? "取消" });
    cancelBtn.onclick = () => this.close();
    const confirmBtn = btns.createEl("button", {
      text: this.opts.confirmText ?? "确认",
      cls: "mod-warning",
    });
    confirmBtn.onclick = async () => {
      this.close();
      try {
        await this.opts.onConfirm();
      } catch (e) {
        console.error("[imasync] 确认操作执行失败", e);
      }
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
