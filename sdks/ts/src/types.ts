// Copyright 2026 hunta.ai
// SPDX-License-Identifier: Apache-2.0

/** Options for constructing a {@link GatherClient}. */
export interface GatherClientOptions {
  /**
   * Bearer token. Falls back to the GATHER_TOKEN env var.
   * A read/propose token is enough for the default methods; curator methods
   * need a memory:curate or memory:write token.
   */
  token?: string;
  /**
   * Base URL of the memory service. Falls back to GATHER_URL, then
   * https://mcp.hunta.ai. A trailing slash is stripped.
   */
  baseUrl?: string;
  /** Per-request timeout in milliseconds (default 30000). */
  timeoutMs?: number;
  /** Retries on 429 and 5xx and transport errors (default 2). */
  retries?: number;
  /** Base backoff in ms for the exponential retry schedule (default 200). */
  retryBaseMs?: number;
  /** Override the fetch implementation (default: the global fetch). */
  fetch?: typeof fetch;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
}

/** A single recall/search hit. Facts carry provenance; raw memories do not. */
export interface RecallHit {
  /** The distilled fact statement or raw memory text. */
  memory: string;
  id: string;
  agent: string;
  score: number;
  /** "fact" when the hit is a distilled current-truth fact. */
  kind?: string;
  /** The raw memory a fact was derived from (provenance). */
  source_memory_id?: string;
  /** Event-time the fact became true (ISO-8601). */
  valid_from?: string;
}

/** Filters for {@link GatherClient.search}. */
export interface SearchOptions {
  /** Semantic + lexical query. Empty means a filter-only listing. */
  query?: string;
  limit?: number;
  /** Restrict to a single writer agent. */
  agent?: string;
  /** Bi-temporal: facts in force at this instant (ISO-8601). */
  asOf?: string;
  /** Facts about a named entity. */
  entity?: string;
}

/** Result of a propose (gather/capture) call: a staged candidate. */
export interface CaptureResult {
  candidate_id: string;
  tenant: string;
  status: string;
}

/** A staged candidate row from the curation queue. */
export interface Candidate {
  id: string;
  [key: string]: unknown;
}

/** A fact row with reconciliation metadata. */
export interface Fact {
  id: string;
  statement?: string;
  slot?: string;
  valid_from?: string;
  valid_to?: string | null;
  superseded_by?: string | null;
  retraction_reason?: string | null;
  [key: string]: unknown;
}

/** Filters for {@link GatherClient.facts}. */
export interface FactsOptions {
  sourceMemoryId?: string;
  supersededBy?: string;
  includeSuperseded?: boolean;
  limit?: number;
}

/** One governed errata row. */
export interface Errata {
  action: string;
  symptom?: string;
  guidance?: string;
  severity?: number | null;
  status?: string | null;
  read_count?: number | null;
  [key: string]: unknown;
}

/** Body for {@link GatherClient.proposeErrata}. */
export interface ProposeErrataInput {
  action: string;
  /** The verbatim misleading signal that just fooled you. */
  symptom: string;
  /** Concrete invocation tokens for later matching (Scope C). */
  retrievalKeys?: Record<string, string | string[]>;
}

/** The caller's resolved identity. */
export interface WhoAmI {
  tenant: string;
  subject: string;
  scopes: string[];
}

/** Store health for the caller's tenant (shape varies by backend). */
export interface MemoryMetrics {
  [key: string]: unknown;
}

/** A signed isolation attestation (verify against the published JWKS). */
export interface IsolationAttestation {
  [key: string]: unknown;
}

/** Options for {@link CuratorClient.promoteCandidate}. */
export interface PromoteOptions {
  /** Promote a distilled statement instead of the raw capture. */
  text?: string;
  agent?: string;
  severity?: number;
}

/** Body for {@link CuratorClient.consolidateCandidate}. */
export interface ConsolidateInput {
  action: string;
  symptom: string;
  guidance: string;
  retireSlots?: string[];
  severity?: number;
}

/** Body for {@link CuratorClient.supersedeFact}. */
export interface SupersedeInput {
  statement: string;
  agent?: string;
  /** Successor's effective date (ISO-8601, not future). Defaults to now. */
  validFrom?: string;
}

/** Result of a candidate promotion. */
export interface PromoteResult {
  memory_id?: string;
  text?: string;
  [key: string]: unknown;
}

/** Result of a candidate rejection. */
export interface RejectResult {
  status?: string;
  [key: string]: unknown;
}

/** Result of a fact supersession. */
export interface SupersedeResult {
  status?: string;
  new_fact_id?: string;
  [key: string]: unknown;
}

/** Result of a GDPR cascade forget. */
export interface ForgetResult {
  [key: string]: unknown;
}
