#!/usr/bin/env python3
# Copyright 2026 hunta.ai
# SPDX-License-Identifier: Apache-2.0
"""Hunta Gather Python SDK quickstart.

  export GATHER_TOKEN=<your-key>
  export GATHER_URL=https://mcp.hunta.ai    # optional; this is the default
  python examples/quickstart.py

Tenancy is carried by the token: no tenant argument, and you cannot request
another tenant's data. An owner key writes canon directly (gather), as shown
here for a one-shot demo. In production, give agents propose-only keys and use
capture / propose_errata so a curator admits into canon.
"""
from hunta_gather import GatherClient

with GatherClient() as gather:
    who = gather.whoami()
    print("whoami:", who)

    # store a memory (owner key: straight to canon)
    stored = gather.gather("Our design partner is Acme Corp.")
    print("gather:", stored)

    # recall it (returns only sealed facts)
    hits = gather.recall("design partner", limit=5)
    print("recall:", hits)

    # propose-only path: stage a candidate for a curator to admit
    candidate = gather.capture("Acme's primary contact is Dana.", source="api")
    print("capture:", candidate)
