// Copyright 2026 hunta.ai
// SPDX-License-Identifier: Apache-2.0

import { Transport } from "./transport.js";
import type {
  Candidate,
  CaptureResult,
  ConsolidateInput,
  Errata,
  Fact,
  FactsOptions,
  ForgetResult,
  GatherClientOptions,
  IsolationAttestation,
  MemoryMetrics,
  PromoteOptions,
  PromoteResult,
  ProposeErrataInput,
  RecallHit,
  RejectResult,
  SearchOptions,
  SupersedeInput,
  SupersedeResult,
  WhoAmI,
} from "./types.js";

/**
 * The curate/write side of Gather, deliberately kept in its own namespace. Every
 * method here mutates canon and needs a memory:curate or memory:write token. The
 * governed principle is: agents propose (via {@link GatherClient.gather} /
 * {@link GatherClient.proposeErrata}); a curator admits. Reach these only through
 * {@link GatherClient.curate}.
 */
export class CuratorClient {
  constructor(private readonly transport: Transport) {}

  /**
   * Promote a pending candidate into canon via the full curated-write pipeline
   * (extraction, dedup, bi-temporal supersession, provenance). curated_by and
   * lane are stamped server-side from the token, never from this call.
   * Scope: memory:curate or memory:write.
   */
  promoteCandidate(
    candidateId: string,
    opts: PromoteOptions = {},
  ): Promise<PromoteResult> {
    return this.transport.request<PromoteResult>({
      method: "POST",
      path: `/v1/candidates/${encodeURIComponent(candidateId)}/promote`,
      body: {
        text: opts.text,
        agent: opts.agent,
        severity: opts.severity,
      },
    });
  }

  /**
   * Close a pending candidate without promotion. Kept as status="rejected" for
   * audit and stamped with who rejected it. Scope: memory:curate or memory:write.
   */
  rejectCandidate(candidateId: string): Promise<RejectResult> {
    return this.transport.request<RejectResult>({
      method: "POST",
      path: `/v1/candidates/${encodeURIComponent(candidateId)}/reject`,
    });
  }

  /**
   * Admit a consolidate proposal as a curator-composed merge: write one merged
   * errata and retire the source slots it supersedes.
   * Scope: memory:curate or memory:write.
   */
  consolidateCandidate(
    candidateId: string,
    input: ConsolidateInput,
  ): Promise<PromoteResult> {
    return this.transport.request<PromoteResult>({
      method: "POST",
      path: `/v1/candidates/${encodeURIComponent(candidateId)}/consolidate`,
      body: {
        action: input.action,
        symptom: input.symptom,
        guidance: input.guidance,
        retire_slots: input.retireSlots,
        severity: input.severity,
      },
    });
  }

  /**
   * Surgically correct ONE fact: bi-temporal closure of the target and the
   * corrected statement put in force. Siblings untouched; the extractor is not
   * run. Scope: memory:curate or memory:write.
   */
  supersedeFact(
    factId: string,
    input: SupersedeInput,
  ): Promise<SupersedeResult> {
    return this.transport.request<SupersedeResult>({
      method: "POST",
      path: `/v1/facts/${encodeURIComponent(factId)}/supersede`,
      body: {
        statement: input.statement,
        agent: input.agent,
        valid_from: input.validFrom,
      },
    });
  }

  /**
   * GDPR erasure: permanently delete a raw memory plus every fact derived from it
   * (current and superseded) and any entity thereby orphaned. Returns delete
   * counts. Scope: memory:write.
   */
  forget(memoryId: string): Promise<ForgetResult> {
    return this.transport.request<ForgetResult>({
      method: "DELETE",
      path: `/v1/memories/${encodeURIComponent(memoryId)}`,
    });
  }
}

/**
 * A governed client for Hunta Gather attestable agent memory.
 *
 * The default methods are the trusted path: {@link GatherClient.recall} /
 * {@link GatherClient.search} read sealed facts, and {@link GatherClient.gather}
 * proposes a candidate into staging (it does NOT write canon). Candidates are
 * never returned by recall until a curator admits them. Canon-mutating calls live
 * behind {@link GatherClient.curate} and need a curate/write-scoped token.
 *
 * @example
 * const gather = new GatherClient({ token: process.env.GATHER_TOKEN });
 * await gather.gather("Our design partner is Acme Corp.");
 * const hits = await gather.recall("design partner", { limit: 5 });
 */
export class GatherClient {
  private readonly transport: Transport;

  /** Curate/write-scoped methods, kept explicitly separate from the read path. */
  readonly curate: CuratorClient;

  constructor(opts: GatherClientOptions = {}) {
    this.transport = new Transport(opts);
    this.curate = new CuratorClient(this.transport);
  }

  // ---- read path -------------------------------------------------------------

  /**
   * Retrieve the most relevant sealed facts for the caller's tenant. Convenience
   * form of {@link GatherClient.search}. Scope: memory:read.
   */
  async recall(
    query: string,
    opts: { limit?: number } = {},
  ): Promise<RecallHit[]> {
    return this.search({ query, limit: opts.limit });
  }

  /**
   * Filtered fact search. An empty query is a filter-only listing. Hits carry
   * provenance (source_memory_id, valid_from). Scope: memory:read.
   */
  async search(opts: SearchOptions = {}): Promise<RecallHit[]> {
    const res = await this.transport.request<{ results: RecallHit[] }>({
      method: "POST",
      path: "/v1/memories/search",
      body: {
        query: opts.query ?? "",
        limit: opts.limit,
        agent: opts.agent,
        as_of: opts.asOf,
        entity: opts.entity,
      },
    });
    return res.results ?? [];
  }

  /**
   * List facts with reconciliation metadata (slot, valid_from/to, superseded_by,
   * retraction_reason). Filter by sourceMemoryId to preview the cascade a
   * forget(memoryId) would destroy. Scope: memory:read.
   */
  async facts(opts: FactsOptions = {}): Promise<Fact[]> {
    const res = await this.transport.request<{ facts: Fact[] }>({
      method: "GET",
      path: "/v1/facts",
      query: {
        source_memory_id: opts.sourceMemoryId,
        superseded_by: opts.supersededBy,
        include_superseded: opts.includeSuperseded,
        limit: opts.limit,
      },
    });
    return res.facts ?? [];
  }

  /**
   * Get one enriched fact by id (adds created_at, corroboration_count, and
   * decrypted entity names). Returns null if it does not exist.
   * Scope: memory:read.
   */
  async fact(factId: string): Promise<Fact | null> {
    try {
      return await this.transport.request<Fact>({
        method: "GET",
        path: `/v1/facts/${encodeURIComponent(factId)}`,
      });
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  }

  /**
   * The staging/curation queue for the caller's tenant. Reading the queue is a
   * read; admitting from it is a curator action (see {@link GatherClient.curate}).
   * Scope: memory:read, memory:capture, memory:curate, or memory:write.
   */
  async candidates(
    status: "pending" | "promoted" | "rejected" | "expired" = "pending",
    limit = 50,
  ): Promise<Candidate[]> {
    const res = await this.transport.request<{ candidates: Candidate[] }>({
      method: "GET",
      path: "/v1/candidates",
      query: { status, limit },
    });
    return res.candidates ?? [];
  }

  /**
   * Deterministic governed-errata lookup: the gate query to run before a risky
   * action. Pass an action for that action's current errata; omit it for the full
   * current set grouped by action. Scope: memory:read.
   */
  checkErrata(action: string, limit?: number): Promise<{ action: string; errata: Errata[]; count: number }>;
  checkErrata(): Promise<{ actions: Array<{ action: string; errata: Errata[]; count: number }>; count: number }>;
  checkErrata(action?: string, limit?: number): Promise<unknown> {
    return this.transport.request({
      method: "GET",
      path: "/v1/errata",
      query: { action, limit },
    });
  }

  // ---- propose path (governed default write) ---------------------------------

  /**
   * Gather (capture) text as a CANDIDATE memory: the governed default write. This
   * stages a proposal in the curation inbox; it is NEVER returned by recall until
   * a curator promotes it (see {@link GatherClient.curate}). Use this instead of
   * writing canon directly. Scope: memory:capture or memory:write.
   */
  gather(
    text: string,
    opts: { agent?: string; source?: string } = {},
  ): Promise<CaptureResult> {
    return this.transport.request<CaptureResult>({
      method: "POST",
      path: "/v1/memories/capture",
      body: {
        text,
        agent: opts.agent,
        source: opts.source ?? "api",
      },
    });
  }

  /**
   * Propose an errata candidate: stage a lesson bound to an action with the
   * verbatim symptom that just fooled you. Guidance is added by a curator at
   * promotion; the candidate is never surfaced by checkErrata until then.
   * Scope: memory:capture or memory:write.
   */
  proposeErrata(input: ProposeErrataInput): Promise<Candidate> {
    return this.transport.request<Candidate>({
      method: "POST",
      path: "/v1/errata/candidates",
      body: {
        action: input.action,
        symptom: input.symptom,
        retrieval_keys: input.retrievalKeys,
      },
    });
  }

  // ---- identity, health, proof -----------------------------------------------

  /** Resolve the caller's tenant, subject, and scopes. Any valid token. */
  whoami(): Promise<WhoAmI> {
    return this.transport.request<WhoAmI>({
      method: "GET",
      path: "/v1/whoami",
    });
  }

  /**
   * The caller's tenant isolation attestation (Ed25519-signed, live probes). Pass
   * a nonce to bind freshness; verify the signature against the published JWKS
   * (kid hunta-attest-1). Scope: memory:read.
   */
  verifyIsolation(nonce?: string): Promise<IsolationAttestation> {
    return this.transport.request<IsolationAttestation>({
      method: "POST",
      path: "/v1/admin/verify-isolation",
      query: { nonce },
    });
  }

  /** Store health for the caller's tenant. Scope: memory:read. */
  memoryMetrics(): Promise<MemoryMetrics> {
    return this.transport.request<MemoryMetrics>({
      method: "GET",
      path: "/v1/metrics",
    });
  }
}
