#!/usr/bin/env python3
"""Gather REST quickstart (no SDK, just the API).

  export GATHER_URL=https://mcp.hunta.ai        # or your Estate deployment
  export GATHER_TOKEN=<owner-key-for-direct-writes>
  python examples/python_quickstart.py

Tenancy is carried by the token's tid claim: no tenant argument, and you cannot request another
tenant's data. Agent keys (capture + read) propose to staging; an owner key writes canon directly,
as shown here for a one-shot demo. In production, give agents propose-only keys.
"""
import os, json, urllib.request

BASE = os.environ["GATHER_URL"].rstrip("/")
TOKEN = os.environ["GATHER_TOKEN"]
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers=H, method="POST")
    return json.load(urllib.request.urlopen(req, timeout=10))


# write a memory (owner key: straight to canon)
print("remember:", post("/v1/memories", {"text": "Our design partner is Acme Corp."}))

# recall it (returns only sealed facts)
print("recall:", post("/v1/memories/search", {"query": "design partner", "limit": 5}))
