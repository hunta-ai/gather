<div align="center">

# Gather

**Deterministic, attestable memory for AI coding agents.**

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![Stars](https://img.shields.io/github/stars/hunta-ai/gather?style=flat)](https://github.com/hunta-ai/gather/stargazers)
[![CI](https://github.com/hunta-ai/gather/actions/workflows/ci.yml/badge.svg)](https://github.com/hunta-ai/gather/actions/workflows/ci.yml)
[![Website](https://img.shields.io/badge/website-hunta.ai-111)](https://hunta.ai/product/gather)

[Get started](https://hunta.ai/get-started) ·
[Console](https://console.hunta.cloud) ·
[How it works](#how-memory-works) ·
[Compare](https://hunta.ai/compare)

</div>

---

This repo is the **open integration surface** for [Gather](https://hunta.ai/product/gather), a
multi-tenant org-memory service (an MCP server plus a REST API) with server-enforced tenant isolation
and attestable, curated writes. The memory engine is a hosted service; **this repo holds the client
integrations** (starting with the Claude Code plugin) so your harnesses *use* that memory
automatically, instead of hoping the model remembers to.

## What's here

| Path | What |
|---|---|
| [`integrations/claude-code`](./integrations/claude-code) | The `gather` plugin: hooks + bundled MCP server + curation skills |
| [`cli/`](./cli) | The `hunta` CLI: gather, recall, verify, instinct (and the SDK-seed client) |
| [`verify/`](./verify) | `@hunta/verify`: offline Ed25519 verification of isolation-attestation receipts (verify, don't trust) |
| [`examples/`](./examples) | Drop-in config (raw `mcpServers` block for any MCP client) |
| [`docs/`](./docs) | Plugin reference: data flow, staging model, cost, metrics, troubleshooting |

More integrations (Codex, Agent SDK) land here over time.

## Quickstart (Claude Code)

Two lines, then a token:

```
/plugin marketplace add hunta-ai/gather
/plugin install gather@hunta
```

Mint an **agent key** in the [console](https://console.hunta.cloud) (scoped to propose +
recall, never to write canon), then point the plugin at your tenant:

```sh
export GATHER_URL=https://mcp.hunta.ai   # or your own deployment on Estate (self-host)
export GATHER_TOKEN=<your-agent-key>
```

Recall and capture are live on your next session. Full walkthrough:
[hunta.ai/get-started](https://hunta.ai/get-started).

## Using another client (raw MCP)

Not on Claude Code, or prefer raw MCP? Point any MCP client at the server directly
(see [`examples/mcp-config.json`](./examples/mcp-config.json)):

```json
{
  "mcpServers": {
    "gather": {
      "url": "https://mcp.hunta.ai/mcp",
      "headers": { "Authorization": "Bearer <your-agent-key>" }
    }
  }
}
```

## What the plugin does

- **Auto-recall** on every prompt. A `UserPromptSubmit` hook queries your memory and injects the top
  facts into the turn, so the agent starts with what it already knows.
- **Re-inject** after compaction. A `SessionStart(compact)` hook re-runs recall so injected context
  survives Claude Code's context resets.
- **Loss-proof capture.** `PreCompact` and `SessionEnd` hooks post a content-free **breadcrumb** to
  your staging inbox. The transcript is never uploaded.
- **Curation skills.** `/gather:flush` reviews pending candidates; `/gather:status`
  shows local recall hit-rate and latency.

The principle is **harness-enforced invocation**: tool availability is not tool use. Agents do not
reliably recall context or write learnings back on their own, so the hooks make it happen by
construction, on every turn, without depending on the model's judgement.

## How memory works

Gather's differentiator is the **write path**: *the writer never decides.*

1. **Capture** lands **candidates** in a staging inbox. Candidates are invisible to recall.
2. **Promotion** runs the curated-write pipeline (extraction, dedup, bi-temporal supersession,
   provenance stamping). This is the only path into canon, and it is a human (or policy) decision.
3. **Recall** returns only sealed, attributable facts. An injected agent can propose noise; it can
   never seal a fact.

Always-on capture means you never lose a learning to a closed session; the staging wall means an
unreviewed breadcrumb can never pollute the memory your agents read.
Read more: [the curation gate](./docs/curation-gate.md).

## Fail-open by construction

A slow or unreachable memory server never blocks or degrades a turn.

- 8-second hook timeout.
- Every error path (timeout, 4xx/5xx, missing token, network failure) exits `0` with no output:
  inject nothing, continue.
- Automatic capture only ever adds candidates to staging, so **canon is never touched on any error path.**

Worst case for a down server is a turn with no injected context, never a stalled turn.

## Privacy

Everything goes only to the `GATHER_URL` you configure. Recall sends the prompt text as a search
query; capture sends a breadcrumb (event, cwd, session id, timestamp) and **never the transcript**.
On the hosted service that endpoint is `mcp.hunta.ai`; on Estate it is your own deployment and nothing
leaves your infrastructure. Full data-flow table: [docs/plugin.md](./docs/plugin.md).

## Why Gather

| | Gather | Typical memory API |
|---|---|---|
| Write path | Curated: proposals reviewed before they enter canon | Direct writes |
| Isolation | Per-tenant crypto + RLS, with a signed proof you can run yourself | Claimed |
| Time | Bi-temporal (what was true, and when you learned it) | Last-write-wins |

Honest comparisons, including where we're behind:
[hunta.ai/compare](https://hunta.ai/compare).

## Community & support

- Issues and feature requests: [GitHub Issues](https://github.com/hunta-ai/gather/issues)
- Security reports: see [SECURITY.md](./SECURITY.md)
- Questions: [hunta@agentmail.to](mailto:hunta@agentmail.to)

## Contributing

Integrations and fixes welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) and our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

[Apache-2.0](./LICENSE).
