// Copyright 2026 hunta.ai
// SPDX-License-Identifier: Apache-2.0

export { GatherClient, CuratorClient } from "./client.js";
export {
  GatherError,
  GatherAuthError,
  GatherForbiddenError,
  GatherNotFoundError,
  GatherConflictError,
} from "./errors.js";
export type {
  GatherClientOptions,
  RecallHit,
  SearchOptions,
  CaptureResult,
  Candidate,
  Fact,
  FactsOptions,
  Errata,
  ProposeErrataInput,
  WhoAmI,
  MemoryMetrics,
  IsolationAttestation,
  PromoteOptions,
  ConsolidateInput,
  SupersedeInput,
  PromoteResult,
  RejectResult,
  SupersedeResult,
  ForgetResult,
} from "./types.js";
