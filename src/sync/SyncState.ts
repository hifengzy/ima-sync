/**
 * 同步进程状态：互斥控制（对应开发方案 5.3 / NFR-4.1）。
 * isSyncing 进入即置 true，try/finally 保证复位。
 */
export class SyncState {
  private syncing = false;

  isSyncing(): boolean {
    return this.syncing;
  }

  /** 尝试进入同步：成功返回 true，已在同步中返回 false */
  start(): boolean {
    if (this.syncing) return false;
    this.syncing = true;
    return true;
  }

  stop(): void {
    this.syncing = false;
  }
}
