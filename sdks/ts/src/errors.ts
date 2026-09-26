// Copyright 2026 hunta.ai
// SPDX-License-Identifier: Apache-2.0

/**
 * Base error for every failure surfaced by the Gather client. Carries the HTTP
 * status (when the request reached the server) and the parsed error body.
 */
export class GatherError extends Error {
  /** HTTP status code, or undefined for transport/timeout failures. */
  readonly status?: number;
  /** The parsed JSON error body from the server, when present. */
  readonly body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = "GatherError";
    this.status = status;
    this.body = body;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 — the token is missing, malformed, or not accepted by the server. */
export class GatherAuthError extends GatherError {
  constructor(message = "unauthorized", body?: unknown) {
    super(message, 401, body);
    this.name = "GatherAuthError";
  }
}

/**
 * 403 — the token is valid but lacks the scope for this call. Curator methods
 * need a memory:curate or memory:write token; recall and propose do not.
 */
export class GatherForbiddenError extends GatherError {
  /** The scopes the server said it required, when it reported them. */
  readonly required?: string[];

  constructor(message = "insufficient_scope", body?: unknown) {
    super(message, 403, body);
    this.name = "GatherForbiddenError";
    const req = (body as { required?: unknown } | undefined)?.required;
    if (Array.isArray(req)) this.required = req.map(String);
  }
}

/** 404 — the memory, fact, or candidate does not exist in the caller's tenant. */
export class GatherNotFoundError extends GatherError {
  constructor(message = "not_found", body?: unknown) {
    super(message, 404, body);
    this.name = "GatherNotFoundError";
  }
}

/**
 * 409 — the target was not in the state the call required (for example, a
 * candidate that is no longer pending).
 */
export class GatherConflictError extends GatherError {
  constructor(message = "conflict", body?: unknown) {
    super(message, 409, body);
    this.name = "GatherConflictError";
  }
}

/** Map an HTTP status + parsed body to the right typed error. */
export function errorForStatus(status: number, body: unknown): GatherError {
  const message =
    (typeof body === "object" &&
      body !== null &&
      typeof (body as { error?: unknown }).error === "string" &&
      (body as { error: string }).error) ||
    `request failed with status ${status}`;
  switch (status) {
    case 401:
      return new GatherAuthError(message, body);
    case 403:
      return new GatherForbiddenError(message, body);
    case 404:
      return new GatherNotFoundError(message, body);
    case 409:
      return new GatherConflictError(message, body);
    default:
      return new GatherError(message, status, body);
  }
}
