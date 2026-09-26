# Copyright 2026 hunta.ai
# SPDX-License-Identifier: Apache-2.0
"""Asynchronous Gather client."""
from __future__ import annotations

import asyncio
from typing import Any

import httpx

from . import _core as core
from ._core import Req
from ._models import (
    Attestation,
    Candidate,
    CaptureResult,
    DeleteCounts,
    Erratum,
    Fact,
    GatherResult,
    Metrics,
    PromoteResult,
    RecallResult,
    SupersedeResult,
    WhoAmI,
)
from .client import _parse_body


class AsyncGatherClient:
    """Governed, asynchronous client for Hunta Gather memory.

    Behaviour matches ``GatherClient`` (see its docstring); every method is a
    coroutine and canon-mutating calls live on the awaitable ``.curate``
    sub-client.
    """

    def __init__(self, token: str | None = None, *, base_url: str | None = None,
                 timeout: float = core.DEFAULT_TIMEOUT, retries: int = core.DEFAULT_RETRIES,
                 http_client: httpx.AsyncClient | None = None) -> None:
        self._retries = max(0, retries)
        self._owns_client = http_client is None
        resolved_token = core.resolve_token(token)
        self._http = http_client or httpx.AsyncClient(
            base_url=core.resolve_base_url(base_url),
            headers=core.build_headers(resolved_token),
            timeout=timeout,
        )
        self.curate = AsyncCurateClient(self)

    # --- lifecycle ---------------------------------------------------------------------
    async def aclose(self) -> None:
        if self._owns_client:
            await self._http.aclose()

    async def __aenter__(self) -> AsyncGatherClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    # --- transport ---------------------------------------------------------------------
    async def _send(self, req: Req) -> Any:
        attempt = 0
        while True:
            attempt += 1
            try:
                resp = await self._http.request(req.method, req.path, json=req.json,
                                                params=req.params)
            except httpx.TimeoutException as exc:
                if attempt <= self._retries:
                    await asyncio.sleep(core.retry_delay(attempt))
                    continue
                raise core.timeout_error(exc) from exc
            except httpx.HTTPError as exc:
                raise core.transport_error(exc) from exc

            if core.should_retry(resp.status_code) and attempt <= self._retries:
                await asyncio.sleep(core.retry_delay(attempt, resp.headers.get("retry-after")))
                continue

            body = _parse_body(resp)
            core.raise_for_status(resp.status_code, body)
            return core.unwrap(body, req)

    # --- default read / propose surface ------------------------------------------------
    async def recall(self, query: str, limit: int = 10) -> list[RecallResult]:
        """Retrieve the tenant's most relevant memories (current-truth facts where available)."""
        return await self._send(core.recall_req(query, limit))

    async def search(self, query: str = "", limit: int = 10, *, agent: str | None = None,
                     as_of: str | None = None,
                     entity: str | None = None) -> list[RecallResult]:
        """Filtered fact search. Empty query is a filter-only listing."""
        return await self._send(core.search_req(query, limit, agent, as_of, entity))

    async def gather(self, text: str, agent: str | None = None, *,
                     valid_from: str | None = None) -> GatherResult:
        """Store a memory in canon (memory:write). ``valid_from`` is event-time, ISO-8601."""
        return await self._send(core.gather_req(text, agent, valid_from))

    async def capture(self, text: str, agent: str | None = None, *,
                      source: str = "api") -> CaptureResult:
        """Stage a candidate memory. Never recalled until a curator promotes it."""
        return await self._send(core.capture_req(text, agent, source))

    async def facts(self, *, source_memory_id: str | None = None,
                    superseded_by: str | None = None, include_superseded: bool = False,
                    limit: int = 50) -> list[Fact]:
        """List facts with reconciliation metadata (the cascade preview for forget)."""
        return await self._send(core.facts_req(source_memory_id, superseded_by,
                                               include_superseded, limit))

    async def fact(self, fact_id: str) -> Fact:
        """One enriched fact by id. Raises GatherNotFoundError if it does not exist."""
        return await self._send(core.fact_req(fact_id))

    async def candidates(self, status: str = "pending", *,
                         limit: int = 50) -> list[Candidate]:
        """The staging / curation queue (pending | promoted | rejected | expired)."""
        return await self._send(core.candidates_req(status, limit))

    async def check_errata(self, action: str) -> list[Erratum]:
        """Deterministic current governed errata for an action (the pre-action gate query)."""
        return await self._send(core.check_errata_req(action))

    async def propose_errata(self, action: str, symptom: str, *,
                             retrieval_keys: dict[str, Any] | None = None) -> dict[str, Any]:
        """Propose an errata candidate (staged; a curator adds guidance at promotion)."""
        return await self._send(core.propose_errata_req(action, symptom, retrieval_keys))

    async def whoami(self) -> WhoAmI:
        """Resolve the caller's tenant, subject, and scopes from the token."""
        return await self._send(core.whoami_req())

    async def verify_isolation(self, nonce: str | None = None) -> Attestation:
        """The tenant's Ed25519-signed isolation attestation. Pass a nonce to bind freshness."""
        return await self._send(core.verify_isolation_req(nonce))

    async def memory_metrics(self) -> Metrics:
        """Store health for the caller's tenant."""
        return await self._send(core.memory_metrics_req())


class AsyncCurateClient:
    """Curator surface (async): canon-mutating calls that need memory:curate or memory:write."""

    def __init__(self, parent: AsyncGatherClient) -> None:
        self._parent = parent

    async def promote_candidate(self, candidate_id: str, *, text: str | None = None,
                                agent: str | None = None,
                                severity: int | None = None) -> PromoteResult:
        """Promote a pending candidate into canon via the full curated write pipeline."""
        return await self._parent._send(
            core.promote_candidate_req(candidate_id, text, agent, severity))

    async def reject_candidate(self, candidate_id: str) -> dict[str, Any]:
        """Close a pending candidate without promotion (kept for audit)."""
        return await self._parent._send(core.reject_candidate_req(candidate_id))

    async def consolidate_candidate(self, candidate_id: str, *, action: str, symptom: str,
                                    guidance: str, retire_slots: list[str] | None = None,
                                    severity: int | None = None) -> dict[str, Any]:
        """Admit a consolidate proposal as a merged errata and retire the source slots."""
        return await self._parent._send(
            core.consolidate_candidate_req(candidate_id, action, symptom, guidance,
                                           retire_slots, severity))

    async def supersede_fact(self, fact_id: str, statement: str, *, agent: str | None = None,
                             valid_from: str | None = None) -> SupersedeResult:
        """Surgically correct one fact (bi-temporal closure; siblings untouched)."""
        return await self._parent._send(
            core.supersede_fact_req(fact_id, statement, agent, valid_from))

    async def forget(self, memory_id: str) -> DeleteCounts:
        """GDPR erasure: delete a raw memory and every fact derived from it (cascade)."""
        return await self._parent._send(core.forget_req(memory_id))
