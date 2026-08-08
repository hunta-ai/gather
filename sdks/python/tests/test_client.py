# Copyright 2026 hunta.ai
# SPDX-License-Identifier: Apache-2.0
"""Tests for the Gather clients using httpx.MockTransport (no network)."""
from __future__ import annotations

import json

import httpx
import pytest

from hunta_gather import (
    AsyncGatherClient,
    GatherAuthError,
    GatherClient,
    GatherError,
)
from hunta_gather import _core as core

BASE = "https://mcp.test"


def _make_client(handler, **kwargs) -> GatherClient:
    transport = httpx.MockTransport(handler)
    http = httpx.Client(transport=transport, base_url=BASE,
                        headers=core.build_headers("test-token"))
    return GatherClient(token="test-token", http_client=http, **kwargs)


def test_recall_happy_path():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"results": [
            {"memory": "Our design partner is Acme Corp.", "id": "m1",
             "agent": "default", "score": 0.9, "kind": "fact"}]})

    client = _make_client(handler)
    hits = client.recall("design partner", limit=5)

    assert seen["url"] == f"{BASE}/v1/memories/search"
    assert seen["body"] == {"query": "design partner", "limit": 5}
    assert seen["auth"] == "Bearer test-token"
    assert len(hits) == 1
    assert hits[0]["id"] == "m1"


def test_recall_unwraps_empty_results():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"results": []})

    assert _make_client(handler).recall("nothing") == []


def test_401_raises_auth_error():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "unauthorized"})

    with pytest.raises(GatherAuthError) as exc:
        _make_client(handler).whoami()
    assert exc.value.status == 401


def test_retry_on_503_then_success(monkeypatch):
    monkeypatch.setattr(core, "retry_delay", lambda *a, **k: 0.0)
    calls = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, json={"error": "unavailable"})
        return httpx.Response(200, json={"results": [{"id": "m2", "memory": "x"}]})

    client = _make_client(handler, retries=2)
    hits = client.recall("q")
    assert calls["n"] == 2
    assert hits[0]["id"] == "m2"


def test_retry_exhausted_raises(monkeypatch):
    monkeypatch.setattr(core, "retry_delay", lambda *a, **k: 0.0)
    calls = {"n": 0}

    def handler(_request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, json={"error": "unavailable"})

    with pytest.raises(GatherError):
        _make_client(handler, retries=1).recall("q")
    assert calls["n"] == 2  # initial + 1 retry


def test_curate_promote_candidate():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["method"] = request.method
        seen["body"] = json.loads(request.content) if request.content else {}
        return httpx.Response(201, json={"memory_id": "m9", "text": "distilled"})

    client = _make_client(handler)
    res = client.curate.promote_candidate("c123", text="distilled")

    assert seen["method"] == "POST"
    assert seen["url"] == f"{BASE}/v1/candidates/c123/promote"
    assert seen["body"] == {"text": "distilled"}
    assert res["memory_id"] == "m9"


def test_gather_write_to_canon():
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == f"{BASE}/v1/memories"
        assert json.loads(request.content) == {"text": "hi"}
        return httpx.Response(201, json={"id": "m1", "tenant": "t_abc"})

    res = _make_client(handler).gather("hi")
    assert res == {"id": "m1", "tenant": "t_abc"}


def test_missing_token_raises(monkeypatch):
    monkeypatch.delenv("GATHER_TOKEN", raising=False)
    with pytest.raises(ValueError):
        GatherClient()


@pytest.mark.asyncio
async def test_async_recall_happy_path():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"results": [{"id": "a1", "memory": "x"}]})

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url=BASE,
                             headers=core.build_headers("t"))
    client = AsyncGatherClient(token="t", http_client=http)
    hits = await client.recall("q")
    assert hits[0]["id"] == "a1"
    await client.aclose()
