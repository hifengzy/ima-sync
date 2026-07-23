/**
 * 测试用 obsidian mock：用 Node 原生 fetch 实现 requestUrl，
 * 让插件的 ImaClient / ImaApi 在 Node 环境下直接跑真实 API。
 *
 * 仅用于冒烟测试（test/smoke.ts），不参与插件构建。
 */

interface MockRequestParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  throw?: boolean;
}

interface MockResponse {
  status: number;
  json: unknown;
  text: string;
  arrayBuffer: ArrayBuffer;
  headers: Record<string, string>;
}

export async function requestUrl(param: MockRequestParam): Promise<MockResponse> {
  const resp = await fetch(param.url, {
    method: param.method ?? "GET",
    headers: param.headers ?? {},
    body: param.body,
  });
  const text = await resp.text();
  const headers: Record<string, string> = {};
  resp.headers.forEach((v, k) => {
    headers[k] = v;
  });
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* 非 JSON，保留 undefined */
    }
  }
  const arrayBuffer = new TextEncoder().encode(text).buffer as ArrayBuffer;
  return { status: resp.status, json, text, arrayBuffer, headers };
}
