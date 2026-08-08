# Copyright 2026 hunta.ai
# SPDX-License-Identifier: Apache-2.0
"""Hunta Gather: governed Python client for attestable agent memory.

Recall and propose are the default trusted path; canon-mutating calls are
curate-scoped and live on the separated ``.curate`` sub-client.
"""
from __future__ import annotations

from ._core import __version__
from ._errors import (
    GatherAuthError,
    GatherConflictError,
    GatherError,
    GatherForbiddenError,
    GatherNotFoundError,
)
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
from .aclient import AsyncCurateClient, AsyncGatherClient
from .client import CurateClient, GatherClient

__all__ = [
    "__version__",
    "GatherClient",
    "CurateClient",
    "AsyncGatherClient",
    "AsyncCurateClient",
    "GatherError",
    "GatherAuthError",
    "GatherForbiddenError",
    "GatherNotFoundError",
    "GatherConflictError",
    "RecallResult",
    "GatherResult",
    "CaptureResult",
    "Candidate",
    "Fact",
    "Erratum",
    "WhoAmI",
    "PromoteResult",
    "SupersedeResult",
    "Metrics",
    "Attestation",
    "DeleteCounts",
]
