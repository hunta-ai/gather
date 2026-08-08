// Copyright 2026 hunta.ai
// SPDX-License-Identifier: Apache-2.0

import { GatherError, errorForStatus } from "./errors.js";
import type { GatherClientOptions } from "./types.js";

const DEFAULT_BASE_URL = "https://mcp.hunta.ai";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 200;

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function resolveToken(opts: GatherClientOptions): string {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const token = opts.token ?? env?.GATHER_TOKEN;
  if (!token) {
    throw new GatherError(
      "no token: pass { token } or set GATHER_TOKEN",
    );
  }
  return token;
}

function resolveBaseUrl(opts: GatherClientOptions): string {
  const env = typeof process !== "undefined" ? process.env : undefined;
  const base =
    opts.baseUrl ?? env?.GATHER_URL ?? DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

/**
 * The shared HTTP layer: auth header, timeout via AbortController, typed error
 * mapping, and exponential-backoff retry on 429 / 5xx / transport failures.
 * Both the read/propose client and the curator client route through one of
 * these so behaviour is identical on every call.
 */
export class Transport {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryBaseMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly extraHeaders: Record<string, string>;

  constructor(opts: GatherClientOptions) {
    this.baseUrl = resolveBaseUrl(opts);
    this.token = resolveToken(opts);
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = opts.retries ?? DEFAULT_RETRIES;
    this.retryBaseMs = opts.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.extraHeaders = opts.headers ?? {};
    const f = opts.fetch ?? globalThis.fetch;
    if (typeof f !== "function") {
      throw new GatherError(
        "no fetch available: use Node >= 18 or pass { fetch }",
      );
    }
    this.fetchImpl = f;
  }

  private url(path: string, query?: RequestOptions["query"]): string {
    const u = new URL(this.baseUrl + path);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  }

  async request<T>(opts: RequestOptions): Promise<T> {
    const url = this.url(opts.path, opts.query);
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.token}`,
      accept: "application/json",
      ...this.extraHeaders,
    };
    let payload: string | undefined;
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(opts.body);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: opts.method,
          headers,
          body: payload,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.status >= 200 && res.status < 300) {
          return (await this.parse(res)) as T;
        }
        if (this.retryable(res.status) && attempt < this.retries) {
          lastError = errorForStatus(res.status, await this.safeBody(res));
          await sleep(this.backoff(attempt, res));
          continue;
        }
        throw errorForStatus(res.status, await this.safeBody(res));
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof GatherError) throw err;
        // Transport error (network, abort/timeout). Retry if budget remains.
        lastError = this.wrap(err);
        if (attempt < this.retries) {
          await sleep(this.backoff(attempt));
          continue;
        }
        throw lastError;
      }
    }
    // Unreachable in practice; the loop always returns or throws.
    throw lastError instanceof Error
      ? lastError
      : new GatherError("request failed");
  }

  private retryable(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private backoff(attempt: number, res?: Response): number {
    const retryAfter = res?.headers.get("retry-after");
    if (retryAfter) {
      const secs = Number(retryAfter);
      if (!Number.isNaN(secs)) return secs * 1000;
    }
    const base = this.retryBaseMs * 2 ** attempt;
    return base + Math.floor(Math.random() * this.retryBaseMs);
  }

  private wrap(err: unknown): GatherError {
    const name = (err as { name?: string } | undefined)?.name;
    if (name === "AbortError") {
      return new GatherError(`request timed out after ${this.timeoutMs}ms`);
    }
    const message =
      err instanceof Error ? err.message : "network request failed";
    return new GatherError(message);
  }

  private async parse(res: Response): Promise<unknown> {
    if (res.status === 204) return {};
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private async safeBody(res: Response): Promise<unknown> {
    try {
      return await this.parse(res);
    } catch {
      return undefined;
    }
  }
}
