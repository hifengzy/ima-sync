/**
 * 验证 FR-12 缓存清理逻辑：clear() 后索引为空，decideAction 返回 create，持久化为 {}。
 * 用 fake vault adapter 模拟 Obsidian 文件系统。
 *
 * 运行：npx esbuild test/verify-clear.ts --bundle --platform=node --format=esm --outfile=test/verify-clear.mjs --external:obsidian && node test/verify-clear.mjs
 */
import { SyncIndex } from "../src/sync/SyncIndex";

const files = new Map<string, string>();
const fakeApp: unknown = {
  vault: {
    configDir: "/tmp/fake-config",
    adapter: {
      exists: async (p: string) => files.has(p),
      read: async (p: string) => files.get(p) ?? "",
      write: async (p: string, c: string) => {
        files.set(p, c);
      },
    },
  },
};

// 模拟 SyncManager.decideAction 的核心判定（依赖 index.get）
function decideAction(index: SyncIndex, docId: string, remoteUpdateTimeSec: number): "create" | "update" | "skip" {
  const local = index.get(docId);
  if (!local) return "create";
  if (!remoteUpdateTimeSec) return "skip";
  const localSec = parseInt(local.update_time, 10) || 0;
  return remoteUpdateTimeSec > localSec ? "update" : "skip";
}

async function main(): Promise<void> {
  const index = new SyncIndex(fakeApp as never, "ima-sync");
  await index.load();
  console.log("初始 size:", index.size());

  index.upsert("doc1", {
    path: "ima/KB/a.md",
    kb_id: "kb1",
    title: "T1",
    media_type: 6,
    update_time: "1700000000",
    synced_at: "2026-07-24T10:00:00Z",
  });
  index.upsert("doc2", {
    path: "ima/KB/b.md",
    kb_id: "kb1",
    title: "T2",
    media_type: 6,
    update_time: "1700000000",
    synced_at: "2026-07-24T10:00:00Z",
  });
  await index.save();
  console.log("upsert 2 条后 size:", index.size());
  console.log("清空前 decideAction(doc1):", decideAction(index, "doc1", 1700000000));

  index.clear();
  console.log("clear 后 size:", index.size());
  console.log("清空后 decideAction(doc1):", decideAction(index, "doc1", 1700000000));

  await index.save();
  const saved = files.get("/tmp/fake-config/plugins/ima-sync/sync-index.json");
  console.log("save 后文件内容:", saved);

  // 重新 load 验证持久化清空
  const index2 = new SyncIndex(fakeApp as never, "ima-sync");
  await index2.load();
  console.log("重新 load 后 size:", index2.size());

  // 断言
  if (index.size() !== 0) {
    console.log("✗ clear 后 size 非 0");
    process.exit(1);
  }
  if (decideAction(index, "doc1", 1700000000) !== "create") {
    console.log("✗ 清空后 decideAction 非 create");
    process.exit(1);
  }
  if (saved !== "{}") {
    console.log(`✗ 持久化内容非 '{}'，实际: ${saved}`);
    process.exit(1);
  }
  if (index2.size() !== 0) {
    console.log("✗ 重新 load 后 size 非 0（未持久化清空）");
    process.exit(1);
  }
  console.log("\n✓ clear 逻辑验证通过：清空后 size=0、decideAction 返回 create、持久化为 {}、重载仍为空");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
