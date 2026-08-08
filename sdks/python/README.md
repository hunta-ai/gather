# hunta-gather

Governed Python client for [Hunta Gather](https://hunta.ai/product/gather), attestable per-tenant agent memory.

Recall and propose are the default trusted path. Canon-mutating calls are curate-scoped and live on a separate `.curate` sub-client, so a propose-only integration never reaches them by accident. The tenant is bound to your token: no method takes a tenant argument, and you cannot request another tenant's data.

Sync (`GatherClient`) and async (`AsyncGatherClient`) clients share one core.

## Install

```bash
pip install hunta-gather
```

Requires Python 3.10 or newer. The only runtime dependency is `httpx`.

## Auth

Pass a bearer token to the constructor, or set `GATHER_TOKEN`:

```bash
export GATHER_TOKEN=<your-key>
export GATHER_URL=https://mcp.hunta.ai   # optional; this is the default
```

Mint a key in the [console](https://console.hunta.cloud). Give agents propose-only keys (memory:capture + memory:read); reserve memory:curate or memory:write for the curator that admits into canon.

## Quickstart (sync)

```python
from hunta_gather import GatherClient

with GatherClient() as gather:            # token from GATHER_TOKEN
    print(gather.whoami())

    # store a memory (owner key: straight to canon)
    gather.gather("Our design partner is Acme Corp.")

    # recall it (returns sealed facts, with provenance)
    hits = gather.recall("design partner", limit=5)
    print(hits)

    # propose-only path: stage a candidate for a curator to admit
    gather.capture("Acme's primary contact is Dana.", source="api")
```

## Quickstart (async)

```python
import asyncio
from hunta_gather import AsyncGatherClient

async def main():
    async with AsyncGatherClient() as gather:
        await gather.gather("Our design partner is Acme Corp.")
        hits = await gather.recall("design partner", limit=5)
        print(hits)

asyncio.run(main())
```

## Governed writes

The SDK proposes; a curator admits. This split is the product wedge, in code.

- Default (trusted) path: `recall`, `search`, `facts`, `fact`, `candidates`, `check_errata`, `whoami`, `verify_isolation`, `memory_metrics`, plus the propose verbs `capture` and `propose_errata`. Staged candidates are never returned by recall or search until they are promoted.
- Curator path, on `.curate`: `promote_candidate`, `reject_candidate`, `consolidate_candidate`, `supersede_fact`, `forget`. These need a memory:curate or memory:write token. A token without the scope gets a `GatherForbiddenError` (403).

`gather(text)` writes canon directly and needs memory:write. It is provided for owner keys and one-shot scripts; agents should prefer `capture`.

```python
# a curator reviews the queue, then admits
for cand in gather.candidates(status="pending"):
    print(cand)
gather.curate.promote_candidate(cand["candidate_id"], text="Acme's contact is Dana.")
```

## Method surface

Default client:

| Method | REST | Scope |
| --- | --- | --- |
| `recall(query, limit=10)` | POST /v1/memories/search | memory:read |
| `search(query="", limit=10, agent=, as_of=, entity=)` | POST /v1/memories/search | memory:read |
| `gather(text, agent=None, valid_from=)` | POST /v1/memories | memory:write |
| `capture(text, agent=None, source="api")` | POST /v1/memories/capture | memory:capture |
| `facts(source_memory_id=, superseded_by=, include_superseded=False, limit=50)` | GET /v1/facts | memory:read |
| `fact(fact_id)` | GET /v1/facts/{id} | memory:read |
| `candidates(status="pending", limit=50)` | GET /v1/candidates | memory:read |
| `check_errata(action)` | GET /v1/errata?action= | memory:read |
| `propose_errata(action, symptom, retrieval_keys=)` | POST /v1/errata/candidates | memory:capture |
| `whoami()` | GET /v1/whoami | any valid token |
| `verify_isolation(nonce=None)` | POST /v1/admin/verify-isolation | memory:read |
| `memory_metrics()` | GET /v1/metrics | memory:read |

Curator sub-client (`.curate`):

| Method | REST | Scope |
| --- | --- | --- |
| `promote_candidate(candidate_id, text=, agent=, severity=)` | POST /v1/candidates/{id}/promote | memory:curate |
| `reject_candidate(candidate_id)` | POST /v1/candidates/{id}/reject | memory:curate |
| `consolidate_candidate(candidate_id, action, symptom, guidance, retire_slots=, severity=)` | POST /v1/candidates/{id}/consolidate | memory:curate |
| `supersede_fact(fact_id, statement, agent=, valid_from=)` | POST /v1/facts/{id}/supersede | memory:curate |
| `forget(memory_id)` | DELETE /v1/memories/{id} | memory:write |

The async client mirrors this exactly; every method is a coroutine and the curator methods live on `.curate` too.

## Errors

All failures raise a subclass of `GatherError`, which carries `.status` and the parsed `.body`:

| Exception | Status | Meaning |
| --- | --- | --- |
| `GatherAuthError` | 401 | token missing, malformed, or not accepted |
| `GatherForbiddenError` | 403 | valid token, wrong scope (see `.required`) |
| `GatherNotFoundError` | 404 | no such memory, fact, or candidate |
| `GatherConflictError` | 409 | wrong state (for example, candidate no longer pending) |
| `GatherError` | other or none | any other HTTP error, or a transport / timeout failure (`.status is None`) |

```python
from hunta_gather import GatherClient, GatherForbiddenError

with GatherClient() as gather:
    try:
        gather.curate.forget("mem_123")
    except GatherForbiddenError as err:
        print("need a stronger scope:", err.required)
```

## Robustness

- Timeout defaults to 30 seconds. Override with `GatherClient(timeout=...)`.
- Retries default to 2, with exponential backoff on 429 and 5xx (Retry-After is honoured when present). Override with `GatherClient(retries=...)`.
- Bring your own `httpx.Client` (or `httpx.AsyncClient`) via `http_client=` to control pooling, proxies, or transport in tests.

## License

Apache-2.0. See [LICENSE](./LICENSE).
