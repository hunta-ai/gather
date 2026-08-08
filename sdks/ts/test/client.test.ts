// Copyright 2026 hunta.ai
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { GatherAuthError, GatherClient } from "../src/index.js";

/** Build a JSON Response the way the SDK's transport expects to parse it. */
function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const OPTS = { token: "test-token", baseUrl: "https://mcp.example.test", retryBaseMs: 0 };

describe("GatherClient recall", () => {
  it("returns the results array on a happy path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        results: [
          { memory: "Design partner is Acme Corp.", id: "m1", agent: "default", score: 0.9, kind: "fact" },
        ],
      }),
    );
    const gather = new GatherClient({ ...OPTS, fetch: fetchMock });

    const hits = await gather.recall("design partner", { limit: 5 });

    expect(hits).toHaveLength(1);
    expect(hits[0]?.memory).toContain("Acme");

    // recall posts to the search endpoint with the query + limit.
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://mcp.example.test/v1/memories/search");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ query: "design partner", limit: 5 });
    expect(init.headers.authorization).toBe("Bearer test-token");
  });
});

describe("GatherClient errors", () => {
  it("throws GatherAuthError on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { error: "unauthorized" }));
    const gather = new GatherClient({ ...OPTS, fetch: fetchMock });

    await expect(gather.whoami()).rejects.toBeInstanceOf(GatherAuthError);
    // A 401 is not retried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Transport retry", () => {
  it("retries on 503 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: "unavailable" }))
      .mockResolvedValueOnce(jsonResponse(200, { tenant: "t_x", subject: "user:t_x", scopes: ["memory:read"] }));
    const gather = new GatherClient({ ...OPTS, fetch: fetchMock });

    const who = await gather.whoami();

    expect(who.tenant).toBe("t_x");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("CuratorClient (curate namespace)", () => {
  it("promotes a candidate against the curate endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { memory_id: "mem_42", text: "distilled" }),
    );
    const gather = new GatherClient({ ...OPTS, fetch: fetchMock });

    const res = await gather.curate.promoteCandidate("cand_1", { text: "distilled" });

    expect(res.memory_id).toBe("mem_42");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://mcp.example.test/v1/candidates/cand_1/promote");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({ text: "distilled" });
  });
});

describe("GatherClient.gather (governed default = propose)", () => {
  it("captures to the staging inbox, not canon", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { candidate_id: "cand_9", tenant: "t_x", status: "pending" }),
    );
    const gather = new GatherClient({ ...OPTS, fetch: fetchMock });

    const res = await gather.gather("Our design partner is Acme Corp.");

    expect(res.status).toBe("pending");
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://mcp.example.test/v1/memories/capture");
  });
});
