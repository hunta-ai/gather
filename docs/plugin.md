# `gather` — plugin reference

The Claude Code plugin wires deterministic recall and loss-proof capture into every turn of a session,
backed by a Gather deployment (the hosted service at `mcp.hunta.ai`, or your own on Estate).

## What it installs

1. **Hooks** on harness lifecycle events (prompt submit, compaction, session end) that query and feed
   your Gather deployment.
2. **The Gather MCP server**, bundled, for explicit `recall` / `capture` / `promote_candidate` tool
   calls when you want manual control.
3. **Skills** for reviewing and curating captured material (`/gather:flush`,
   `/gather:status`).

The design principle is *harness-enforced invocation*: tool availability is not tool use. The hooks
make recall and capture happen by construction, on every turn, without depending on the model's judgement.

## How it works

**On every prompt (recall).** A `UserPromptSubmit` hook fires before the model sees your prompt. It
POSTs to `POST /v1/memories/search` with the prompt as the query, retrieves the top 3 results per
notebook (configurable), trims to ~1200 chars (≈ 300 tokens), and injects the facts into the turn.
Configure two notebooks (below) and it queries both, the typical org pattern being a shared tenant
plus your own-org tenant.

**After compaction (re-inject).** A `SessionStart` hook with `matcher: compact` re-runs recall after
a compaction so injected facts survive the context reset.

**On compaction and session end (capture).** `PreCompact` and `SessionEnd` hooks POST a lightweight
**breadcrumb** to your staging inbox via `POST /v1/memories/capture`: event type, cwd, session id,
timestamp. **The transcript body is never sent.** Breadcrumbs land as candidates in staging.

## Data flow and privacy

| Operation | Endpoint | What leaves the machine |
|---|---|---|
| Recall | `POST /v1/memories/search` | The prompt text, as a search query |
| Capture | `POST /v1/memories/capture` | A breadcrumb (event, cwd, session id, timestamp), **not** the transcript |

Everything goes only to the `GATHER_URL` you configure. On the hosted service that endpoint is
`mcp.hunta.ai`; on Estate it is your own deployment and nothing leaves your infrastructure. The plugin
has no other telephone-home path.

## The staging model: capture now, curate later

- **Capture** lands **candidates** in a staging inbox. Candidates are invisible to recall.
- **Promotion** runs the curated-write pipeline (extraction, dedup, bi-temporal supersession,
  provenance stamping) and is the only path into canon.
- **Curated canon is never touched by automatic capture.** Automatic machinery can only add to a
  review queue, never mutate what recall reads.

Review with `/gather:flush`: promote with a distilled statement, or reject. Candidates carry
a 14-day TTL and expire if neither promoted nor rejected, so the queue self-cleans.

## Fail-open guarantees

- 8-second hook timeout.
- Any non-zero exit is treated as non-blocking by the harness.
- Hook scripts exit `0` with no output on every error path (timeout, 4xx/5xx, missing token, network
  failure): inject nothing, continue.
- Automatic capture only ever adds candidates, so canon is never touched on any error path.

Worst case for a down server is a turn with no injected context, never a stalled turn.

## Configuration

All configuration is via environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `GATHER_URL` | required | Your Gather base URL (`https://mcp.hunta.ai` or your Estate deployment) |
| `GATHER_TOKEN` | required | Per-tenant Bearer JWT (agent key recommended) |
| `GATHER_TOKEN_FILE` | unset | Path to a file holding the JWT (alternative to the above) |
| `GATHER_URL_2` / `GATHER_TOKEN_2` | unset | Optional second notebook (e.g. shared + own-org) |
| `GATHER_RECALL_LIMIT` | `3` | Results retrieved per notebook |
| `GATHER_RECALL_BUDGET` | `1200` | Max injected chars |
| `GATHER_CAPTURE` | on | Set to `off` to disable capture entirely |
| `GATHER_METRICS_FILE` | `~/.gather-metrics.jsonl` | Local metrics sink path |

**Tenancy is the token's `tid` claim, not a parameter.** You never pass a tenant id, and you cannot
request another tenant's data. Isolation is enforced server-side from the JWT. A shared + own-org
pattern is two tokens, one per URL.

## Cost

| Cost | Amount | Notes |
|---|---|---|
| Injected tokens | ≤ ~300 / prompt | Counts against your upstream model spend |
| Recall latency (warm) | < 100 ms | Steady state |
| Recall latency (cold) | ~5 s first call after idle | Neon serverless scale-to-zero (hosted); covered by fail-open |
| Extraction | Promotion-time only | Zero egress with the default extractor |

The first recall after an idle period can take ~5 s while serverless compute resumes. This is covered
by fail-open: an 8-second cold recall that overruns injects nothing and the turn proceeds. Warm recalls
return in under 100 ms.

## Metrics

Two independent layers. **Local JSONL sink** (`~/.gather-metrics.jsonl`, read with
`/gather:status`) gives quality signals: recall hit-rate, injected chars, latency, capture
events. **Server-side Lago metering** gives the durable usage ledger (`memory_recall_tokens`,
`memory_capture_tokens`, `memory_store_tokens`). Use the local sink for tuning, Lago for accounting.

## Troubleshooting

| Symptom | Likely cause | Behaviour |
|---|---|---|
| No context ever injected | Wrong `GATHER_URL`, missing/invalid token | Fail-open: turns proceed with no injection |
| Recall works, capture silently absent | Token lacks capture scope (capture 403) | Fail-open: breadcrumb dropped |
| First recall of the day slow (~5 s) | Serverless cold start | Expected; warms after first call |
| Candidates never appear in recall | Working as designed | Candidates are staging-only until promoted |
| Nothing captured at all | `GATHER_CAPTURE=off` | Intentional disable |

Everything is fail-open, so misconfiguration degrades to "memory does nothing" rather than breaking
sessions. Check `/gather:status` and the server `/healthz` to distinguish "off" from "broken".
