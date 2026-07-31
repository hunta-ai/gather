// Gather REST quickstart (no SDK, just fetch).
//
//   export GATHER_URL=https://mcp.hunta.ai        # or your Estate deployment
//   export GATHER_TOKEN=<owner-key-for-direct-writes>
//   node examples/node_quickstart.mjs
//
// Tenancy is the token's tid claim: no tenant argument. Agent keys (capture + read) propose to
// staging; an owner key writes canon directly, as shown here. Give agents propose-only keys in prod.

const BASE = process.env.GATHER_URL.replace(/\/+$/, "");
const H = { Authorization: `Bearer ${process.env.GATHER_TOKEN}`, "Content-Type": "application/json" };

// write a memory (owner key: straight to canon)
const remembered = await fetch(`${BASE}/v1/memories`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ text: "Our design partner is Acme Corp." }),
}).then((r) => r.json());
console.log("remember:", remembered);

// recall it (returns only sealed facts)
const recalled = await fetch(`${BASE}/v1/memories/search`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ query: "design partner", limit: 5 }),
}).then((r) => r.json());
console.log("recall:", recalled);
