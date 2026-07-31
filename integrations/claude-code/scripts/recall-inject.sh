#!/bin/bash
# gather: UserPromptSubmit / SessionStart(compact) hook — deterministic recall injection.
#
# Reads the hook JSON on stdin, queries Gather (top-N facts, hard token budget), prints them to
# stdout (Claude Code injects stdout as context). FAIL-OPEN BY CONSTRUCTION: every failure path
# exits 0 with no output — a dead/slow memory server can never block or degrade the turn.
#
# Config (env):
#   GATHER_URL          e.g. https://mcp.hunta.ai            (required)
#   GATHER_TOKEN        Bearer JWT, or GATHER_TOKEN_FILE  (one required)
#   GATHER_URL_2 / GATHER_TOKEN_2 / GATHER_TOKEN_FILE_2  optional second notebook
#                          (org tenants read BOTH shared + own-org: the both-notebooks pattern)
#   GATHER_RECALL_LIMIT   facts per notebook   (default 3)
#   GATHER_RECALL_BUDGET  max injected chars   (default 1200 ≈ 300 tokens)
#   GATHER_METRICS_FILE   JSONL instrumentation sink (default ~/.gather-metrics.jsonl)
exec 2>/dev/null
export _CT_HOOK_INPUT="$(cat 2>/dev/null)"
[ -z "$GATHER_URL" ] && exit 0
python3 - "$@" <<'PY' 2>/dev/null || exit 0
import json, os, sys, time, urllib.request

t0 = time.time()
mode = "post_compact" if "--post-compact" in sys.argv[1:] else "prompt"
raw = os.environ.get("_CT_HOOK_INPUT") or ""
try:
    hook = json.loads(raw) if raw else {}
except Exception:
    hook = {}
query = (hook.get("prompt") or "").strip()
if mode == "post_compact" and not query:
    query = "current project state, active tasks, key infrastructure facts"
if not query or len(query) < 8:          # trivial prompts: don't spend a roundtrip
    sys.exit(0)
query = query[:400]

LIMIT = int(os.environ.get("GATHER_RECALL_LIMIT", "3"))
BUDGET = int(os.environ.get("GATHER_RECALL_BUDGET", "1200"))

def tok(n):
    v = os.environ.get(f"GATHER_TOKEN{n}") or ""
    f = os.environ.get(f"GATHER_TOKEN_FILE{n}") or ""
    if not v and f and os.path.exists(f):
        v = open(f).read().strip()
    return v

notebooks = []
if os.environ.get("GATHER_URL") and tok(""):
    notebooks.append((os.environ["GATHER_URL"].rstrip("/"), tok("")))
if os.environ.get("GATHER_URL_2") and tok("_2"):
    notebooks.append((os.environ["GATHER_URL_2"].rstrip("/"), tok("_2")))

lines, used, hits = [], 0, 0
for base, token in notebooks:
    try:
        req = urllib.request.Request(
            base + "/v1/memories/search",
            data=json.dumps({"query": query, "limit": LIMIT}).encode(),
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=4) as r:
            results = json.loads(r.read()).get("results", [])
    except Exception:
        continue                          # fail-open per notebook
    for m in results:
        line = "- " + m.get("memory", "").strip().replace("\n", " ")
        if m.get("valid_from"):
            line += f" (as of {m['valid_from'][:10]})"
        if used + len(line) > BUDGET:
            break
        lines.append(line); used += len(line); hits += 1

if lines:
    print("[org-memory] Facts recalled from Gather (verify before acting on stale-looking ones):")
    print("\n".join(lines))

try:                                       # instrumentation — day-1 measurement, never blocking
    mf = os.environ.get("GATHER_METRICS_FILE") or os.path.expanduser("~/.gather-metrics.jsonl")
    with open(mf, "a") as f:
        f.write(json.dumps({"ts": int(time.time()), "event": f"recall_{mode}", "qlen": len(query),
                            "notebooks": len(notebooks), "hits": hits, "chars": used,
                            "ms": int((time.time()-t0)*1000)}) + "\n")
except Exception:
    pass
PY
exit 0
