# Copyright 2026 hunta.ai
# SPDX-License-Identifier: Apache-2.0
"""Synchronous Gather client."""
from __future__ import annotations

import time
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


class GatherClient:
    """Governed, synchronous client for Hunta Gather memory.

    The default methods are the trusted path: recall and search read, gather
    stores, capture and propose_errata stage candidates for curation. Methods
    that admit or mutate canon live on the separated ``.curate`` sub-client and
    need a memory:curate or memory:write token.

    Auth is a bearer token from the ``token`` arg or the GATHER_TOKEN
    environment variable. The tenant is bound to the token; no
    method takes a tenant argument.
    """

    def __init__(self, token: str | None = None, *, base_url: str | None = None,
                 timeout: float = core.DEFAULT_TIMEOUT, retries: int = core.DEFAULT_RETRIES,
                 http_client: httpx.Client | None = None) -> None:
        self._retries = max(0, retries)
        self._owns_client = http_client is None
        resolved_token = core.resolve_token(token)
        self._http = http_client or httpx.Client(
            base_url=core.resolve_base_url(base_url),
            headers=core.build_headers(resolved_token),
            timeout=timeout,
        )
        self.curate = CurateClient(self)

    # --- lifecycle ---------------------------------------------------------------------
    def close(self) -> None:
        if self._owns_client:
            self._http.close()

    def __enter__(self) -> GatherClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # --- transport ---------------------------------------------------------------------
    def _send(self, req: Req) -> Any:
        attempt = 0
        while True:
            attempt += 1
            try:
                resp = self._http.request(req.method, req.path, json=req.json,
                                          params=req.params)
            except httpx.TimeoutException as exc:
                if attempt <= self._retries:
                    time.sleep(core.retry_delay(attempt))
                    continue
                raise core.timeout_error(exc) from exc
            except httpx.HTTPError as exc:
                raise core.transport_error(exc) from exc

            if core.should_retry(resp.status_code) and attempt <= self._retries:
                time.sleep(core.retry_delay(attempt, resp.headers.get("retry-after")))
                continue

            body = _parse_body(resp)
            core.raise_for_status(resp.status_code, body)
            return core.unwrap(body, req)

    # --- default read / propose surface ------------------------------------------------
    def recall(self, query: str, limit: int = 10) -> list[RecallResult]:
        """Retrieve the tenant's most relevant memories (current-truth facts where available)."""
        return self._send(core.recall_req(query, limit))

    def search(self, query: str = "", limit: int = 10, *, agent: str | None = None,
               as_of: str | None = None, entity: str | None = None) -> list[RecallResult]:
        """Filtered fact search. Empty query is a filter-only listing."""
        return self._send(core.search_req(query, limit, agent, as_of, entity))

    def gather(self, text: str, agent: str | None = None, *,
               valid_from: str | None = None) -> GatherResult:
        """Store a memory in canon (memory:write). ``valid_from`` is event-time, ISO-8601."""
        return self._send(core.gather_req(text, agent, valid_from))

    def capture(self, text: str, agent: str | None = None, *,
                source: str = "api") -> CaptureResult:
        """Stage a candidate memory. Never recalled until a curator promotes it."""
        return self._send(core.capture_req(text, agent, source))

    def facts(self, *, source_memory_id: str | None = None, superseded_by: str | None = None,
              include_superseded: bool = False, limit: int = 50) -> list[Fact]:
        """List facts with reconciliation metadata (the cascade preview for forget)."""
        return self._send(core.facts_req(source_memory_id, superseded_by,
                                         include_superseded, limit))

    def fact(self, fact_id: str) -> Fact:
        """One enriched fact by id. Raises GatherNotFoundError if it does not exist."""
        return self._send(core.fact_req(fact_id))

    def candidates(self, status: str = "pending", *, limit: int = 50) -> list[Candidate]:
        """The staging / curation queue (pending | promoted | rejected | expired)."""
        return self._send(core.candidates_req(status, limit))

    def check_errata(self, action: str) -> list[Erratum]:
        """Deterministic current governed errata for an action (the pre-action gate query)."""
        return self._send(core.check_errata_req(action))

    def propose_errata(self, action: str, symptom: str, *,
                       retrieval_keys: dict[str, Any] | None = None) -> dict[str, Any]:
        """Propose an errata candidate (staged; a curator adds guidance at promotion)."""
        return self._send(core.propose_errata_req(action, symptom, retrieval_keys))

    def whoami(self) -> WhoAmI:
        """Resolve the caller's tenant, subject, and scopes from the token."""
        return self._send(core.whoami_req())

    def verify_isolation(self, nonce: str | None = None) -> Attestation:
        """The tenant's Ed25519-signed isolation attestation. Pass a nonce to bind freshness."""
        return self._send(core.verify_isolation_req(nonce))

    def memory_metrics(self) -> Metrics:
        """Store health for the caller's tenant."""
        return self._send(core.memory_metrics_req())


class CurateClient:
    """Curator surface: canon-mutating calls that need memory:curate or memory:write.

    Kept separate from the default client so a propose-only integration never
    reaches these by accident. A 403 GatherForbiddenError means the token lacks
    the scope.
    """

    def __init__(self, parent: GatherClient) -> None:
        self._parent = parent

    def promote_candidate(self, candidate_id: str, *, text: str | None = None,
                          agent: str | None = None,
                          severity: int | None = None) -> PromoteResult:
        """Promote a pending candidate into canon via the full curated write pipeline."""
        return self._parent._send(
            core.promote_candidate_req(candidate_id, text, agent, severity))

    def reject_candidate(self, candidate_id: str) -> dict[str, Any]:
        """Close a pending candidate without promotion (kept for audit)."""
        return self._parent._send(core.reject_candidate_req(candidate_id))

    def consolidate_candidate(self, candidate_id: str, *, action: str, symptom: str,
                              guidance: str, retire_slots: list[str] | None = None,
                              severity: int | None = None) -> dict[str, Any]:
        """Admit a consolidate proposal as a merged errata and retire the source slots."""
        return self._parent._send(
            core.consolidate_candidate_req(candidate_id, action, symptom, guidance,
                                           retire_slots, severity))

    def supersede_fact(self, fact_id: str, statement: str, *, agent: str | None = None,
                       valid_from: str | None = None) -> SupersedeResult:
        """Surgically correct one fact (bi-temporal closure; siblings untouched)."""
        return self._parent._send(
            core.supersede_fact_req(fact_id, statement, agent, valid_from))

    def forget(self, memory_id: str) -> DeleteCounts:
        """GDPR erasure: delete a raw memory and every fact derived from it (cascade)."""
        return self._parent._send(core.forget_req(memory_id))


def _parse_body(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        text = resp.text
        return {"error": text} if text else None
