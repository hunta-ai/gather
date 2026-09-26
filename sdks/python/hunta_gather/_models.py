# Copyright 2026 hunta.ai
# SPDX-License-Identifier: Apache-2.0
"""Typed response models.

These mirror the JSON the REST surface returns. They are declared with
``total=False`` so a caller can rely on the documented keys without the type
checker demanding fields the server omits (provenance fields are conditional,
and the store evolves). Values are always plain JSON types.
"""
from __future__ import annotations

from typing import Any, TypedDict


class RecallResult(TypedDict, total=False):
    """One hit from recall or search. Facts carry provenance; raw memories do not."""

    memory: str
    id: str
    agent: str
    score: float
    kind: str
    source_memory_id: str
    valid_from: str


class GatherResult(TypedDict, total=False):
    """The receipt for a stored memory."""

    id: str
    tenant: str


class CaptureResult(TypedDict, total=False):
    """The receipt for a staged candidate (never recalled until promoted)."""

    candidate_id: str
    tenant: str
    status: str


class Candidate(TypedDict, total=False):
    """A row from the staging or curation queue."""

    id: str
    candidate_id: str
    text: str
    agent: str
    source: str
    status: str
    writer_sub: str
    created_at: str


class Fact(TypedDict, total=False):
    """A distilled fact with reconciliation metadata."""

    id: str
    statement: str
    slot: str
    agent: str
    valid_from: str
    valid_to: str
    superseded_by: str
    retraction_reason: str
    created_at: str
    corroboration_count: int
    names: list[str]


class Erratum(TypedDict, total=False):
    """A governed errata row keyed to an action."""

    action: str
    symptom: str
    guidance: str
    severity: int
    status: str
    read_count: int
    valid_from: str


class WhoAmI(TypedDict, total=False):
    """The caller identity resolved from the access token."""

    tenant: str
    subject: str
    scopes: list[str]


class PromoteResult(TypedDict, total=False):
    """The result of promoting a candidate into canon."""

    memory_id: str
    text: str
    error: str


class SupersedeResult(TypedDict, total=False):
    """The result of a surgical fact supersession."""

    status: str
    new_fact_id: str
    error: str


# Loosely typed responses whose shape is backend-dependent.
Metrics = dict[str, Any]
Attestation = dict[str, Any]
DeleteCounts = dict[str, Any]
