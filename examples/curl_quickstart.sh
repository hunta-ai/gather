#!/usr/bin/env bash
# Gather REST quickstart with curl.
#   export GATHER_URL=https://mcp.hunta.ai        # or your Estate deployment
#   export GATHER_TOKEN=<owner-key-for-direct-writes>
#   ./examples/curl_quickstart.sh
set -euo pipefail
: "${GATHER_URL:?set GATHER_URL}" "${GATHER_TOKEN:?set GATHER_TOKEN}"
BASE="${GATHER_URL%/}"

# write a memory (owner key: straight to canon)
curl -sS -X POST "$BASE/v1/memories" \
  -H "Authorization: Bearer $GATHER_TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"Our design partner is Acme Corp."}'
echo

# recall it (sealed facts only)
curl -sS -X POST "$BASE/v1/memories/search" \
  -H "Authorization: Bearer $GATHER_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"design partner","limit":5}'
echo
