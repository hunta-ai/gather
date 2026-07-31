# The curation gate: the writer never decides

Most memory systems let the writer write. An agent (or an attacker who has injected the agent) says
"remember X," and X becomes a fact the whole fleet will recall. That is the memory-poisoning attack
surface, and it is why an agent-memory layer needs a write path, not just a store.

Gather splits **proposing** from **deciding**:

1. **Propose.** Agents (holding capture-scoped keys) file **candidates** into a staging inbox.
   Candidates are invisible to recall. Filing a candidate seals nothing.
2. **Screen and judge.** Each candidate is deduped and validated, then judged against policy (and,
   at higher tiers, a council vote).
3. **Admit.** A human, or an explicit auto-admit policy for trusted sources, promotes the candidate.
   Promotion runs the curated-write pipeline: extraction, bi-temporal supersession, and provenance
   stamping (`source_memory_id`, `valid_from`).
4. **Recall** returns only sealed, attributable facts.

An injected agent can file noise all day. It cannot seal a single fact, and it cannot mutate what
recall reads. That is the difference between "memory you hope is clean" and "memory you can prove is."

The isolation boundary is enforced the same way: per-tenant crypto plus row-level security, with a
signed attestation you can run yourself. See
[hunta.ai/security](https://hunta.ai/security).
