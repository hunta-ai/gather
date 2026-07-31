---
name: status
description: Show Gather org-memory health and the local invocation-layer metrics (recall hit-rate, injection token cost, capture counts). Use when the user asks "memory status", "is memory working", or wants the dogfood numbers.
---

# Gather memory status

Report two things:

1. **Store health** — call the `memory_metrics` MCP tool (or `GET ${GATHER_URL}/v1/memories` for
   a count). Surface: memories, facts_current, entities, **candidates_pending**, unprocessed_backlog,
   decrypt_failures, extractor_egress, last_attestation.

2. **Local invocation metrics** — read the hook instrumentation sink (default
   `~/.gather-metrics.jsonl`, one JSON object per line). Aggregate and report:
   - `recall_prompt` / `recall_post_compact` events: count, **hit-rate** (fraction with `hits>0`),
     median injected `chars` and `ms` (latency).
   - `capture_precompact` / `capture_sessionend` events: counts.

   Example: `awk`/`jq` over the file, or read it directly. If the file is missing, say the plugin
   hasn't run yet.

Keep it to a compact table. These are the numbers that prove (or disprove) the invocation layer is
firing — the write-side capture rate is the one that was structurally invisible before.
