// Hunta Gather TypeScript SDK quickstart.
//
//   export GATHER_URL=https://mcp.hunta.ai        # or your Estate deployment
//   export GATHER_TOKEN=<your-agent-key>          # propose + recall is enough here
//   node examples/quickstart.mjs
//
// The SDK is governed by construction: gather() PROPOSES a candidate into staging,
// it does not write canon. A curator admits it later. Recall returns only sealed
// facts. Tenancy is the token's tid claim: there is no tenant argument.

import { GatherClient } from "@hunta/gather";

const gather = new GatherClient(); // reads GATHER_TOKEN / GATHER_URL from the env

// propose a memory (staging inbox, never recalled until a curator promotes it)
const proposed = await gather.gather("Our design partner is Acme Corp.");
console.log("gather (proposed candidate):", proposed);

// recall sealed facts
const hits = await gather.recall("design partner", { limit: 5 });
console.log("recall:", hits);

// who am I, and what can this token do
console.log("whoami:", await gather.whoami());

// Curator (needs a memory:curate or memory:write token). Kept separate on purpose:
//   await gather.curate.promoteCandidate(proposed.candidate_id);
