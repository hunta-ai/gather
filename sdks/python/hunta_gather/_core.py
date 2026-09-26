# Copyright 2026 hunta.ai
# SPDX-License-Identifier: Apache-2.0
"""Transport-agnostic core shared by the sync and async clients.

Everything that does not depend on ``httpx.Client`` vs ``httpx.AsyncClient``
lives here: config resolution, header building, the request-spec builders (the
single source of truth for the REST mapping), the retry decision, response
unwrapping, and error mapping. The two client modules are thin shells over this.
"""
from __future__ import annotations

import os
import random
from dataclasses import dataclass, field
from typing import Any

from ._errors import GatherError, error_for_status

__version__ = "0.1.0"

DEFAULT_BASE_URL = "https://mcp.hunta.ai"
DEFAULT_TIMEOUT = 30.0
DEFAULT_RETRIES = 2

_TOKEN_ENV_VARS = ("GATHER_TOKEN",)
_BASE_URL_ENV_VARS = ("GATHER_URL",)

# Statuses worth retrying: rate-limit and transient server faults.
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
_BACKOFF_BASE = 0.5
_BACKOFF_CAP = 10.0


def resolve_token(token: str | None) -> str:
    """The bearer token: constructor arg, then GATHER_TOKEN."""
    if token:
        return token
    for name in _TOKEN_ENV_VARS:
        value = os.environ.get(name)
        if value:
            return value
    raise ValueError(
        "no Gather token: pass token= or set GATHER_TOKEN"
    )


def resolve_base_url(base_url: str | None) -> str:
    """The API base URL: constructor arg, then GATHER_URL, else default."""
    if not base_url:
        for name in _BASE_URL_ENV_VARS:
            value = os.environ.get(name)
            if value:
                base_url = value
                break
    return (base_url or DEFAULT_BASE_URL).rstrip("/")


def build_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": f"hunta-gather-python/{__version__}",
    }


def should_retry(status: int) -> bool:
    return status in _RETRYABLE_STATUS


def retry_delay(attempt: int, retry_after: str | None = None) -> float:
    """Seconds to wait before ``attempt`` (1-indexed). Honours Retry-After when present."""
    if retry_after:
        try:
            return max(0.0, float(retry_after))
        except (TypeError, ValueError):
            pass
    exp = _BACKOFF_BASE * (2 ** max(0, attempt - 1))
    return min(_BACKOFF_CAP, exp) + random.uniform(0.0, 0.25)


def _compact(d: dict[str, Any]) -> dict[str, Any]:
    """Drop keys whose value is None so the server only sees the fields you set."""
    return {k: v for k, v in d.items() if v is not None}


@dataclass(frozen=True)
class Req:
    """A single REST call: method, path, optional JSON body / query params, and the
    response key to unwrap (a wrapper like ``{"results": [...]}`` -> the list)."""

    method: str
    path: str
    json: dict[str, Any] | None = None
    params: dict[str, Any] | None = None
    unwrap: str | None = None
    unwrap_default: Any = field(default=None)


def raise_for_status(status: int, body: Any) -> None:
    if status >= 400:
        raise error_for_status(status, body)


def unwrap(body: Any, req: Req) -> Any:
    """Extract the payload from a parsed response body per the request's unwrap key."""
    if req.unwrap is None:
        return body
    if isinstance(body, dict):
        return body.get(req.unwrap, req.unwrap_default)
    return req.unwrap_default


def timeout_error(exc: Exception) -> GatherError:
    return GatherError(f"request timed out: {exc}", None, None)


def transport_error(exc: Exception) -> GatherError:
    return GatherError(f"transport error: {exc}", None, None)


# --- request builders: the single source of truth for the REST mapping -----------------
# Default read / propose surface.


def recall_req(query: str, limit: int = 10) -> Req:
    return Req("POST", "/v1/memories/search", json={"query": query, "limit": limit},
               unwrap="results", unwrap_default=[])


def search_req(query: str = "", limit: int = 10, agent: str | None = None,
               as_of: str | None = None, entity: str | None = None) -> Req:
    return Req("POST", "/v1/memories/search",
               json=_compact({"query": query, "limit": limit, "agent": agent,
                              "as_of": as_of, "entity": entity}),
               unwrap="results", unwrap_default=[])


def gather_req(text: str, agent: str | None = None, valid_from: str | None = None) -> Req:
    return Req("POST", "/v1/memories",
               json=_compact({"text": text, "agent": agent, "valid_from": valid_from}))


def capture_req(text: str, agent: str | None = None, source: str = "api") -> Req:
    return Req("POST", "/v1/memories/capture",
               json=_compact({"text": text, "agent": agent, "source": source}))


def facts_req(source_memory_id: str | None = None, superseded_by: str | None = None,
              include_superseded: bool = False, limit: int = 50) -> Req:
    params = _compact({"source_memory_id": source_memory_id, "superseded_by": superseded_by,
                       "limit": limit})
    if include_superseded:
        params["include_superseded"] = "true"
    return Req("GET", "/v1/facts", params=params, unwrap="facts", unwrap_default=[])


def fact_req(fact_id: str) -> Req:
    return Req("GET", f"/v1/facts/{fact_id}")


def candidates_req(status: str = "pending", limit: int = 50) -> Req:
    return Req("GET", "/v1/candidates", params={"status": status, "limit": limit},
               unwrap="candidates", unwrap_default=[])


def check_errata_req(action: str) -> Req:
    return Req("GET", "/v1/errata", params={"action": action},
               unwrap="errata", unwrap_default=[])


def propose_errata_req(action: str, symptom: str,
                       retrieval_keys: dict[str, Any] | None = None) -> Req:
    return Req("POST", "/v1/errata/candidates",
               json=_compact({"action": action, "symptom": symptom,
                              "retrieval_keys": retrieval_keys}))


def whoami_req() -> Req:
    return Req("GET", "/v1/whoami")


def verify_isolation_req(nonce: str | None = None) -> Req:
    return Req("POST", "/v1/admin/verify-isolation",
               params=_compact({"nonce": nonce}) or None)


def memory_metrics_req() -> Req:
    return Req("GET", "/v1/metrics")


# Curator surface (memory:curate or memory:write).


def promote_candidate_req(candidate_id: str, text: str | None = None,
                          agent: str | None = None, severity: int | None = None) -> Req:
    return Req("POST", f"/v1/candidates/{candidate_id}/promote",
               json=_compact({"text": text, "agent": agent, "severity": severity}))


def reject_candidate_req(candidate_id: str) -> Req:
    return Req("POST", f"/v1/candidates/{candidate_id}/reject")


def consolidate_candidate_req(candidate_id: str, action: str, symptom: str, guidance: str,
                              retire_slots: list[str] | None = None,
                              severity: int | None = None) -> Req:
    return Req("POST", f"/v1/candidates/{candidate_id}/consolidate",
               json=_compact({"action": action, "symptom": symptom, "guidance": guidance,
                              "retire_slots": retire_slots, "severity": severity}))


def supersede_fact_req(fact_id: str, statement: str, agent: str | None = None,
                       valid_from: str | None = None) -> Req:
    return Req("POST", f"/v1/facts/{fact_id}/supersede",
               json=_compact({"statement": statement, "agent": agent,
                              "valid_from": valid_from}))


def forget_req(memory_id: str) -> Req:
    return Req("DELETE", f"/v1/memories/{memory_id}")
