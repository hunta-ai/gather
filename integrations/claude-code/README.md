# gather — the invocation layer for Claude Code

Giving an agent a memory tool doesn't make it remember. Agents don't reliably recall before acting,
and their writes die on interrupts, pivots, and context compaction. **gather** closes that
gap deterministically — it doesn't depend on the model choosing to use memory.

- **Recall, every prompt.** A `UserPromptSubmit` hook queries your self-hosted Gather and injects
  the top relevant facts into context. Re-injects after compaction. **Fail-open**: if the memory
  server is slow or down, your turn proceeds untouched.
- **Capture, loss-proof.** `PreCompact` and `SessionEnd` hooks post session breadcrumbs to Gather's
  **staging inbox** — not the canonical store. Nothing becomes org memory until you promote it.
- **Curated writes.** The `/gather:flush` skill reviews staged candidates and promotes the
  keepers as clean, attestable facts. The canonical store stays curated — your memory is what you
  decided to record, not what a model inferred.

Bundles the Gather MCP server too, so explicit `recall`/`remember`/`promote_candidate` are always
available as defence in depth.

## Install

```
/plugin marketplace add hunta-ai/gather      # or a git URL
/plugin install gather
```

## Configure (env)

| Var | Purpose |
|---|---|
| `GATHER_URL` | Your Gather base URL, e.g. `https://mcp.your-org.com` (required) |
| `GATHER_TOKEN` or `GATHER_TOKEN_FILE` | Per-tenant Bearer JWT (one required) |
| `GATHER_URL_2` / `GATHER_TOKEN_2` | Optional second notebook — org agents read both shared + own-org |
| `GATHER_RECALL_LIMIT` | Facts per notebook (default 3) |
| `GATHER_RECALL_BUDGET` | Max injected chars ≈ 4×tokens (default 1200) |
| `GATHER_CAPTURE` | `off` to disable staging capture |
| `GATHER_METRICS_FILE` | Instrumentation JSONL (default `~/.gather-metrics.jsonl`) |

## What is sent where

Your prompt text goes **only** to the Gather URL you configure — your own self-hosted deployment.
Nothing goes to hunta.ai. Recall sends the prompt as a query; capture sends a lightweight session
breadcrumb (event, cwd, session id, timestamp) — not the transcript body. See `docs/` for the full
data-flow, failure-mode, and cost sheets.

## Verify it's working

`/gather:status` shows store health + your local recall hit-rate, injection token cost, and
capture counts — the numbers that prove the invocation layer is firing.
