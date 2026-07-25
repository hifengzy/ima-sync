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

// ===== Obsidian API stubs for unit tests =====

export class TFile {
  path: string;
  basename: string;
  extension: string;
  constructor(path: string) {
    this.path = path;
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const dot = name.lastIndexOf(".");
    this.basename = dot > 0 ? name.substring(0, dot) : name;
    this.extension = dot > 0 ? name.substring(dot + 1) : "";
  }
}

export class Notice {
  constructor(_message: string, _duration?: number) {}
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class App {}

export function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Plugin {}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PluginSettingTab {}
