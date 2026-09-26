# Copyright 2026 hunta.ai
# SPDX-License-Identifier: Apache-2.0
"""Typed exceptions for the Hunta Gather client."""
from __future__ import annotations

from typing import Any


class GatherError(Exception):
    """Base error for every failure surfaced by the Gather client.

    Carries the HTTP status (when the request reached the server) and the parsed
    error body. ``status`` is None for transport or timeout failures.
    """

    def __init__(self, message: str, status: int | None = None, body: Any = None) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.body = body


class GatherAuthError(GatherError):
    """401: the token is missing, malformed, or not accepted by the server."""

    def __init__(self, message: str = "unauthorized", body: Any = None) -> None:
        super().__init__(message, 401, body)


class GatherForbiddenError(GatherError):
    """403: the token is valid but lacks the scope for this call.

    Curator methods need a memory:curate or memory:write token; recall and
    propose do not. ``required`` holds the scopes the server reported, if any.
    """

    def __init__(self, message: str = "insufficient_scope", body: Any = None) -> None:
        super().__init__(message, 403, body)
        required = body.get("required") if isinstance(body, dict) else None
        self.required: list[str] | None = (
            [str(s) for s in required] if isinstance(required, list) else None
        )


class GatherNotFoundError(GatherError):
    """404: the memory, fact, or candidate does not exist in the caller's tenant."""

    def __init__(self, message: str = "not_found", body: Any = None) -> None:
        super().__init__(message, 404, body)


class GatherConflictError(GatherError):
    """409: the target was not in the state the call required.

    For example, a candidate that is no longer pending.
    """

    def __init__(self, message: str = "conflict", body: Any = None) -> None:
        super().__init__(message, 409, body)


_STATUS_MAP: dict[int, type[GatherError]] = {
    401: GatherAuthError,
    403: GatherForbiddenError,
    404: GatherNotFoundError,
    409: GatherConflictError,
}


def error_for_status(status: int, body: Any) -> GatherError:
    """Map an HTTP status and parsed body to the right typed error."""
    message = f"request failed with status {status}"
    if isinstance(body, dict) and isinstance(body.get("error"), str):
        message = body["error"]
    cls = _STATUS_MAP.get(status)
    if cls is GatherForbiddenError or cls is GatherAuthError:
        return cls(message, body)  # type: ignore[call-arg]
    if cls is not None:
        return cls(message, body)  # type: ignore[call-arg]
    return GatherError(message, status, body)
