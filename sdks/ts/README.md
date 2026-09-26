# @hunta/gather

**Governed TypeScript client for [Hunta Gather](https://hunta.ai/product/gather) attestable agent memory.**

Propose and recall are the default, trusted path. Canon-mutating calls are curate-scoped and kept explicitly separate, so the wedge that makes Gather safe (the writer never decides) holds in your code too: your agent proposes, a curator admits.

- Typed methods over the stable REST surface (`mcp.hunta.ai`).
- Governed by construction: `gather()` stages a candidate; it never writes canon.
- Curator writes live behind a separate `.curate` namespace and need a curate/write token.
- Timeouts, retries with backoff on 429/5xx, and typed error classes.
- ESM and CommonJS, `types` included, Node 18+ (uses the global `fetch`).

## Install

```sh
npm install @hunta/gather
```

## Quickstart

Mirrors `examples/quickstart.mjs`.

```ts
import { GatherClient } from "@hunta/gather";

// Reads GATHER_TOKEN and GATHER_URL from the
// environment; pass { token, baseUrl } to set them explicitly.
const gather = new GatherClient();

// PROPOSE a memory. This stages a candidate in the curation inbox. It is never
// returned by recall until a curator promotes it.
const proposed = await gather.gather("Our design partner is Acme Corp.");

// RECALL returns only sealed facts.
const hits = await gather.recall("design partner", { limit: 5 });

console.log(await gather.whoami());
```

Tenancy is carried by the token's `tid` claim. There is no tenant argument and you cannot request another tenant's data.

## Governed writes: the SDK proposes, a curator admits

This is the core of the design, so the SDK makes it structural.

- **Default methods propose or read.** `gather()` captures a candidate into staging. `recall()` / `search()` return only sealed facts. Candidates are invisible to recall.
- **`proposeErrata()`** stages a lesson bound to an action; guidance is added by a curator at promotion.
- **Canon writes are separate.** `promoteCandidate`, `rejectCandidate`, `consolidateCandidate`, `supersedeFact`, and `forget` live under `gather.curate.*` and require a `memory:curate` or `memory:write` token. Give agents propose-and-recall keys; hand curator keys only to the reviewer.

```ts
// Curator flow (needs a curate/write-scoped token)
const pending = await gather.candidates("pending");
await gather.curate.promoteCandidate(pending[0].id, { text: "distilled statement" });
```

## Method surface

Default `GatherClient` (read + propose):

| Method | REST | Scope |
|---|---|---|
| `recall(query, { limit })` | `POST /v1/memories/search` | `memory:read` |
| `search(opts)` | `POST /v1/memories/search` | `memory:read` |
| `facts(opts)` | `GET /v1/facts` | `memory:read` |
| `fact(id)` | `GET /v1/facts/{id}` (null on 404) | `memory:read` |
| `candidates(status, limit)` | `GET /v1/candidates` | `memory:read`+ |
| `checkErrata(action?)` | `GET /v1/errata` | `memory:read` |
| `gather(text, { agent, source })` | `POST /v1/memories/capture` (propose) | `memory:capture` |
| `proposeErrata(input)` | `POST /v1/errata/candidates` | `memory:capture` |
| `whoami()` | `GET /v1/whoami` | any valid token |
| `verifyIsolation(nonce?)` | `POST /v1/admin/verify-isolation` | `memory:read` |
| `memoryMetrics()` | `GET /v1/metrics` | `memory:read` |

Curator `gather.curate.*` (curate/write-scoped):

| Method | REST | Scope |
|---|---|---|
| `promoteCandidate(id, opts)` | `POST /v1/candidates/{id}/promote` | `memory:curate` \| `memory:write` |
| `rejectCandidate(id)` | `POST /v1/candidates/{id}/reject` | `memory:curate` \| `memory:write` |
| `consolidateCandidate(id, input)` | `POST /v1/candidates/{id}/consolidate` | `memory:curate` \| `memory:write` |
| `supersedeFact(id, input)` | `POST /v1/facts/{id}/supersede` | `memory:curate` \| `memory:write` |
| `forget(memoryId)` | `DELETE /v1/memories/{id}` (GDPR cascade) | `memory:write` |

## Auth

v1 uses a Bearer token. Resolution order:

1. `new GatherClient({ token })`
2. `GATHER_TOKEN` env var

Base URL resolves from `{ baseUrl }`, then `GATHER_URL`, then `https://mcp.hunta.ai`. Mint keys in the [console](https://console.hunta.cloud); give agents a propose-and-recall key, never a write-canon key.

Interactive OAuth (PKCE) for MCP clients is handled by the connector flow, not this SDK. OAuth-in-SDK is deferred to a later release; v1 is for code use with a token.

## Configuration

```ts
new GatherClient({
  token: "...",              // or GATHER_TOKEN
  baseUrl: "https://mcp.hunta.ai",
  timeoutMs: 30_000,         // per request; aborts via AbortController
  retries: 2,                // on 429, 5xx, and transport errors
  retryBaseMs: 200,          // exponential backoff base
  headers: {},               // merged into every request
  fetch: globalThis.fetch,   // override the fetch implementation
});
```

Retries honour a numeric `Retry-After` header when present, otherwise back off exponentially with jitter.

## Error handling

Every failure is a typed subclass of `GatherError`, carrying `status` and the parsed `body`.

```ts
import { GatherAuthError, GatherForbiddenError, GatherError } from "@hunta/gather";

try {
  await gather.curate.promoteCandidate(id);
} catch (err) {
  if (err instanceof GatherForbiddenError) {
    // token lacks memory:curate / memory:write; err.required lists the scopes
  } else if (err instanceof GatherAuthError) {
    // 401: missing or rejected token
  } else if (err instanceof GatherError) {
    // GatherNotFoundError (404), GatherConflictError (409), or a 5xx / timeout
  }
}
```

`fact(id)` returns `null` on a 404 rather than throwing, since a missing fact is a normal result.

## License

[Apache-2.0](./LICENSE). Copyright 2026 hunta.ai.
