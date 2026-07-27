var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/constants.ts
var DEFAULT_QPS, MAX_RETRIES, BACKOFF_BASE_MS, BACKOFF_CAP_MS, DEFAULT_TAG, ILLEGAL_FILENAME_CHARS;
var init_constants = __esm({
  "src/constants.ts"() {
    "use strict";
    DEFAULT_QPS = 2;
    MAX_RETRIES = 3;
    BACKOFF_BASE_MS = 1e3;
    BACKOFF_CAP_MS = 8e3;
    DEFAULT_TAG = "clippings";
    ILLEGAL_FILENAME_CHARS = /[/\\:*?"<>|]/g;
  }
});

// src/utils/path.ts
import { TFile, normalizePath } from "obsidian";
function sanitizeFileName(name, maxLen = 120) {
  const cleaned = (name ?? "").replace(ILLEGAL_FILENAME_CHARS, "_").replace(/\s+/g, " ").trim().replace(/^\.+|\.+$/g, "");
  const truncated = cleaned.substring(0, maxLen).trim();
  return truncated.length > 0 ? truncated : "untitled";
}
function fallbackTitle(docId) {
  return `untitled-${getDocIdPrefix(docId)}`;
}
function getDocIdPrefix(docId, len = 8) {
  return (docId ?? "").substring(0, len);
}
function normalizeTimestampToSeconds(ts) {
  if (ts === void 0 || ts === null) return 0;
  const num = typeof ts === "number" ? ts : parseInt(String(ts), 10);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return num > 1e12 ? Math.floor(num / 1e3) : num;
}
function secondsToIso(seconds) {
  if (!seconds) return "";
  const d = new Date(seconds * 1e3);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`;
}
function timestampToIso(ts) {
  return secondsToIso(normalizeTimestampToSeconds(ts));
}
function scheduleToMs(value, unit) {
  const v = Math.max(1, Math.floor(value));
  switch (unit) {
    case "minutes":
      return v * 60 * 1e3;
    case "hours":
      return v * 3600 * 1e3;
    case "days":
      return v * 86400 * 1e3;
  }
}
function clampSchedule(value, unit) {
  if (unit === "minutes" && value < 5) {
    return { value: 5, unit, clamped: true };
  }
  return { value, unit, clamped: false };
}
var init_path = __esm({
  "src/utils/path.ts"() {
    "use strict";
    init_constants();
  }
});

// src/transform/frontmatter.ts
function yamlString(s) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function buildFrontmatterYaml(props) {
  const lines = [];
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
function buildMarkdownWithFrontmatter(props, body) {
  return `---
${buildFrontmatterYaml(props)}
---

${body.trimStart()}
`;
}
var init_frontmatter = __esm({
  "src/transform/frontmatter.ts"() {
    "use strict";
    init_constants();
  }
});

// src/api/errors.ts
function isQuotaExceededResponse(_status, body) {
  if (body?.code === 200005) return true;
  if (body?.msg && body.msg.includes("\u8BF7\u6C42\u8D85\u91CF")) return true;
  return false;
}
var ImaQuotaExceededError;
var init_errors = __esm({
  "src/api/errors.ts"() {
    "use strict";
    ImaQuotaExceededError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "ImaQuotaExceededError";
      }
    };
  }
});

// src/utils/rateLimiter.ts
function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
function computeBackoff(attempt, base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS) {
  return Math.min(base * Math.pow(2, attempt - 1), cap);
}
function isRetryableStatus(status) {
  return status === 429 || status >= 500 && status < 600;
}
var RateLimiter;
var init_rateLimiter = __esm({
  "src/utils/rateLimiter.ts"() {
    "use strict";
    init_constants();
    init_errors();
    RateLimiter = class {
      constructor(opts = {}) {
        this.lastRequestTime = 0;
        /** 串行队列，确保节流不被并发请求绕过 */
        this.chain = Promise.resolve();
        const qps = opts.qps ?? DEFAULT_QPS;
        this.minIntervalMs = Math.ceil(1e3 / qps);
        this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
      }
      /** 节流：确保距上次请求至少 minIntervalMs */
      async throttle() {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.minIntervalMs) {
          await sleep(this.minIntervalMs - elapsed);
        }
        this.lastRequestTime = Date.now();
      }
      /**
       * 串行 + 节流 + 重试地执行一次请求。
       * @param fn 执行实际 HTTP 调用，返回结果类别
       * @returns 成功值；fatal 立即抛出；retryable 用尽后抛出最后一次错误
       */
      async execute(fn) {
        const run = this.chain.then(async () => {
          let attempt = 0;
          let lastError = "\u672A\u77E5\u9519\u8BEF";
          while (attempt <= this.maxRetries) {
            if (attempt > 0) {
              await sleep(computeBackoff(attempt));
            }
            await this.throttle();
            const outcome = await fn();
            if (outcome.kind === "success") {
              return outcome.value;
            }
            if (outcome.kind === "fatal") {
              throw new Error(outcome.error);
            }
            if (outcome.kind === "quota") {
              throw new ImaQuotaExceededError(outcome.error);
            }
            lastError = outcome.error;
            attempt++;
          }
          throw new Error(lastError);
        });
        this.chain = run.then(
          () => void 0,
          () => void 0
        );
        return run;
      }
    };
  }
});

// test/verify-unit.ts
var require_verify_unit = __commonJS({
  "test/verify-unit.ts"() {
    init_path();
    init_frontmatter();
    init_rateLimiter();
    init_errors();
    var pass = 0;
    var fail = 0;
    function assert(cond, label) {
      if (cond) {
        pass++;
        console.log(`  \u2713 ${label}`);
      } else {
        fail++;
        console.log(`  \u2717 ${label}`);
        process.exitCode = 1;
      }
    }
    console.log("\n--- sanitizeFileName ---");
    assert(sanitizeFileName("Hello World") === "Hello World", "\u666E\u901A\u540D\u79F0");
    assert(sanitizeFileName('a/b:c*d?e"f<g>h|i') === "a_b_c_d_e_f_g_h_i", "\u975E\u6CD5\u5B57\u7B26\u66FF\u6362");
    assert(sanitizeFileName("  spaces  ") === "spaces", "\u53BB\u9996\u5C3E\u7A7A\u683C");
    assert(sanitizeFileName(".hidden.") === "hidden", "\u53BB\u9996\u5C3E\u70B9");
    assert(sanitizeFileName("") === "untitled", "\u7A7A\u540D\u4E3A untitled");
    assert(sanitizeFileName("a".repeat(200)).length <= 120, "\u8D85\u957F\u622A\u65AD");
    assert(sanitizeFileName("   ...test...   ") === "test", "\u70B9+\u7A7A\u683C\u7EC4\u5408");
    console.log("\n--- fallbackTitle ---");
    assert(fallbackTitle("abc12345xyz").startsWith("untitled-"), "\u5305\u542B untitled- \u524D\u7F00");
    assert(fallbackTitle("abc12345xyz").includes("abc12345"), "\u5305\u542B docId \u524D\u7F00");
    console.log("\n--- getDocIdPrefix ---");
    assert(getDocIdPrefix("abcdefgh12345678") === "abcdefgh", "\u53D6\u524D8\u4F4D");
    assert(getDocIdPrefix("short") === "short", "\u4E0D\u8DB38\u4F4D\u5168\u53D6");
    assert(getDocIdPrefix("", 4) === "", "\u7A7A\u4E32\u8FD4\u56DE\u7A7A");
    console.log("\n--- normalizeTimestampToSeconds ---");
    assert(normalizeTimestampToSeconds("1700000000") === 17e8, "\u79D2\u7EA7\u5B57\u7B26\u4E32");
    assert(normalizeTimestampToSeconds(17e11) === 17e8, "\u6BEB\u79D2\u7EA7\u6570\u5B57\uFF08>1e12\uFF09");
    assert(normalizeTimestampToSeconds("1700000000000") === 17e8, "\u6BEB\u79D2\u7EA7\u5B57\u7B26\u4E32");
    assert(normalizeTimestampToSeconds(null) === 0, "null -> 0");
    assert(normalizeTimestampToSeconds(void 0) === 0, "undefined -> 0");
    assert(normalizeTimestampToSeconds("") === 0, "\u7A7A\u4E32 -> 0");
    assert(normalizeTimestampToSeconds(0) === 0, "0->0");
    console.log("\n--- secondsToIso ---");
    assert(secondsToIso(0) === "", "0\u79D2\u8FD4\u56DE\u7A7A");
    var iso = secondsToIso(1728e6);
    assert(iso.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/) !== null, `ISO \u683C\u5F0F\u6B63\u786E: ${iso}`);
    console.log("\n--- timestampToIso ---");
    assert(timestampToIso(1728e6) === secondsToIso(1728e6), "\u79D2\u7EA7\u7B49\u4EF7");
    assert(timestampToIso(null) === "", "null \u8FD4\u56DE\u7A7A");
    console.log("\n--- scheduleToMs ---");
    assert(scheduleToMs(1, "minutes") === 6e4, "1\u5206\u949F=60s*1000");
    assert(scheduleToMs(1, "hours") === 36e5, "1\u5C0F\u65F6=3600s*1000");
    assert(scheduleToMs(1, "days") === 864e5, "1\u5929=86400s*1000");
    console.log("\n--- clampSchedule ---");
    assert(clampSchedule(30, "minutes").clamped === false, "30\u5206\u949F\u4E0D\u94B3\u5236");
    assert(clampSchedule(3, "minutes").clamped === true, "3\u5206\u949F\u94B3\u5236");
    assert(clampSchedule(3, "minutes").value === 5, "\u94B3\u5236\u52305\u5206\u949F");
    assert(clampSchedule(3, "hours").clamped === false, "3\u5C0F\u65F6\u4E0D\u94B3\u5236\uFF08\u4EC5\u5206\u949F\u5355\u4F4D\uFF09");
    console.log("\n--- buildFrontmatterYaml ---");
    var fm1 = buildFrontmatterYaml({ title: "\u6D4B\u8BD5", created: "2026-01-01T00:00:00", tags: ["clippings"] });
    assert(fm1.includes('title: "\u6D4B\u8BD5"'), "\u542B title");
    assert(fm1.includes("created: 2026-01-01T00:00:00"), "\u542B created");
    assert(fm1.includes("- clippings"), "\u542B tags");
    assert(!fm1.includes("source:"), "\u65E0 source \u5B57\u6BB5\uFF08\u672A\u63D0\u4F9B\uFF09");
    var fm2 = buildFrontmatterYaml({ title: "\u5E26\u6E90", created: "2026-01-01T00:00:00", source: "https://example.com", tags: ["clippings"] });
    assert(fm2.includes('source: "https://example.com"'), "\u542B source");
    var fm3 = buildFrontmatterYaml({ title: '\u5E26"\u5F15\u53F7"', created: "2026-01-01T00:00:00", tags: [] });
    assert(fm3.includes("- clippings"), "\u7A7A tags \u8865\u9ED8\u8BA4");
    console.log("\n--- buildMarkdownWithFrontmatter ---");
    var md = buildMarkdownWithFrontmatter({ title: "\u6807\u9898", created: "", tags: ["a"] }, "\u6B63\u6587");
    assert(md.startsWith("---\n"), "\u4EE5 --- \u5F00\u5934");
    assert(md.includes("\u6B63\u6587"), "\u542B\u6B63\u6587");
    assert(md.split("---").length >= 3, "\u6709\u4E24\u4E2A --- \u5206\u9694");
    console.log("\n--- decideAction \u7B49\u4EF7\u903B\u8F91 ---");
    function decideAction(localUpdateTime, remoteUpdateTime) {
      if (!localUpdateTime) return "create";
      if (!remoteUpdateTime) return "skip";
      const local = parseInt(localUpdateTime, 10) || 0;
      return remoteUpdateTime > local ? "update" : "skip";
    }
    assert(decideAction(null, 1e3) === "create", "\u65E0\u672C\u5730\u8BB0\u5F55 -> create");
    assert(decideAction("500", 0) === "skip", "\u65E0\u8FDC\u7AEF\u65F6\u95F4 -> skip\uFF08\u5B58\u5728\u5373\u8DF3\u8FC7\uFF09");
    assert(decideAction("500", 1e3) === "update", "\u8FDC\u7AEF\u66F4\u65B0 -> update");
    assert(decideAction("1000", 500) === "skip", "\u8FDC\u7AEF\u66F4\u65E7 -> skip");
    assert(decideAction("1000", 1e3) === "skip", "\u540C\u7B49\u65F6\u95F4 -> skip");
    console.log("\n--- isRetryableStatus ---");
    assert(isRetryableStatus(429) === true, "429 \u53EF\u91CD\u8BD5");
    assert(isRetryableStatus(500) === true, "500 \u53EF\u91CD\u8BD5");
    assert(isRetryableStatus(503) === true, "503 \u53EF\u91CD\u8BD5");
    assert(isRetryableStatus(400) === false, "400 \u4E0D\u53EF\u91CD\u8BD5");
    assert(isRetryableStatus(403) === false, "403 \u4E0D\u53EF\u91CD\u8BD5");
    console.log("\n--- computeBackoff ---");
    assert(computeBackoff(1) === 1e3, "\u7B2C1\u6B21\u9000\u907F 1s");
    assert(computeBackoff(2) === 2e3, "\u7B2C2\u6B21\u9000\u907F 2s");
    assert(computeBackoff(3) === 4e3, "\u7B2C3\u6B21\u9000\u907F 4s");
    assert(computeBackoff(4) === 8e3, "\u7B2C4\u6B21\u9000\u907F 8s\uFF08\u8FBE\u4E0A\u9650\uFF09");
    assert(computeBackoff(5) === 8e3, "\u7B2C5\u6B21\u9000\u907F\u4ECD 8s\uFF08\u4E0A\u9650\uFF09");
    console.log("\n--- RateLimiter \u4E32\u884C\u961F\u5217 ---");
    (async () => {
      const limiter = new RateLimiter({ qps: 2, maxRetries: 1 });
      const r1 = await limiter.execute(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { kind: "success", value: 1 };
      });
      assert(r1 === 1, "\u6210\u529F\u8FD4\u56DE\u7ED3\u679C");
      const r2 = await limiter.execute(async () => ({ kind: "success", value: 2 }));
      assert(r2 === 2, "\u7B2C\u4E8C\u6B21\u6210\u529F");
      console.log("\n--- RateLimiter \u91CD\u8BD5\u903B\u8F91 ---");
      let callsRetry = 0;
      const limiterRetry = new RateLimiter({ qps: 10, maxRetries: 2 });
      const r3 = await limiterRetry.execute(async () => {
        callsRetry++;
        if (callsRetry < 2) return { kind: "retryable", error: "\u4E34\u65F6\u5931\u8D25" };
        return { kind: "success", value: "retried" };
      });
      assert(r3 === "retried", "\u91CD\u8BD5\u540E\u6210\u529F");
      assert(callsRetry === 2, `\u91CD\u8BD5\u4E24\u6B21\u8C03\u7528\uFF0C\u5B9E\u9645: ${callsRetry}`);
      const limiterFatal = new RateLimiter({ qps: 10, maxRetries: 0 });
      let callsFatal = 0;
      try {
        await limiterFatal.execute(async () => {
          callsFatal++;
          return { kind: "fatal", error: "\u81F4\u547D" };
        });
        assert(false, "fatal \u5E94\u629B\u51FA");
      } catch (e) {
        assert(e.message.includes("\u81F4\u547D"), "fatal \u629B\u51FA\u9519\u8BEF\u4FE1\u606F");
      }
      assert(callsFatal === 1, `fatal \u53EA\u8C03\u7528\u4E00\u6B21\uFF0C\u5B9E\u9645: ${callsFatal}`);
      console.log("\n--- isQuotaExceededResponse ---");
      const mkResp = (code, msg) => ({ code, msg, data: {} });
      assert(isQuotaExceededResponse(403, mkResp(200005, "\u8BF7\u6C42\u8D85\u91CF")) === true, "code=200005");
      assert(isQuotaExceededResponse(200, mkResp(200005, "\u8BF7\u6C42\u8D85\u91CF")) === true, "200\u4F46code=200005");
      assert(isQuotaExceededResponse(200, mkResp(0, "\u8BF7\u6C42\u8D85\u91CF\uFF0C\u8BF7\u660E\u65E5\u518D\u8BD5")) === true, "msg\u542B\u8BF7\u6C42\u8D85\u91CF");
      assert(isQuotaExceededResponse(403, void 0) === false, "403\u65E0body\u4E0D\u5224\u914D\u989D");
      assert(isQuotaExceededResponse(200, mkResp(0, "ok")) === false, "\u6B63\u5E38200\u901A\u8FC7");
      console.log(`
${"=".repeat(40)}`);
      console.log(`\u7ED3\u679C: ${pass} \u901A\u8FC7, ${fail} \u5931\u8D25`);
      if (fail > 0) process.exit(1);
    })().catch((e) => {
      console.error("\u6D4B\u8BD5\u5F02\u5E38:", e);
      process.exit(1);
    });
  }
});
export default require_verify_unit();
