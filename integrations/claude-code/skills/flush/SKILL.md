---
name: flush
description: Review Gather staging candidates and promote the ones worth keeping into canonical org memory. Use at a natural close-out — after finishing a task, before a pivot, or when the user asks to "flush memory" / "curate candidates" / "save what we learned".
---

# Curate & promote staged memory candidates

Gather captures session breadcrumbs and gateway exchanges into a **staging inbox** — candidates
are NEVER recalled until an operator promotes them. This is the curated-write moment: you decide
what becomes canonical org memory, and you write a clean distilled statement rather than a raw blob.

## Steps

1. **List pending candidates** (via the Gather MCP tool if available, else REST):
   - MCP: call `candidates(status="pending")`.
   - REST: `GET ${GATHER_URL}/v1/candidates?status=pending` with the Bearer token.

2. **For each candidate, decide** using the WRITE TRIGGERS doctrine — promote if it records any of:
   credential created/rotated (pointer only, never the value) · infra stood up/moved · an operator
   ruling/decision · an incident close · a gotcha/trap · a new capability. Skip chit-chat and
   anything already in memory (recall first to check).

3. **Promote with a distilled statement** (not the raw breadcrumb):
   - MCP: `promote_candidate(candidate_id, text="<one atomic fact, imperative, self-contained>")`.
   - REST: `POST ${GATHER_URL}/v1/candidates/{id}/promote` with `{"text": "..."}`.
   Prefix the statement with a `[domain:<x>]` tag. Route by ownership (org-agnostic estate → shared
   notebook; org-owned infra/business → the org notebook).

4. **Reject the rest** so the queue stays clean:
   - MCP: `reject_candidate(candidate_id)` · REST: `POST .../reject`.

5. **Report** what was promoted/rejected in one line each.

Never promote a secret value — memory holds pointers, the vault holds values.
