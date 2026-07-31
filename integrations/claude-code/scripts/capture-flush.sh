#!/bin/bash
# gather: PreCompact / SessionEnd hook — deterministic capture-to-staging.
#
# Hooks are shell commands; they CANNOT make the model write. So instead of a model-driven flush,
# this deterministically posts a compact marker of the session to Gather's STAGING inbox
# (/v1/memories/capture → status=candidate). Nothing enters the canonical store — an operator or a
# curation pass promotes candidates later. This is the loss-proof half of the invocation layer:
# the write survives the interrupt/compaction that kills a judgment-triggered write.
#
# Because hooks can't read the transcript body, v0.1 captures a lightweight anchor (event, cwd,
# session id, timestamp) as a curation breadcrumb — enough for the operator to know "something
# happened here worth recording" and promote with a distilled statement. (Richer transcript capture
# is a v0.2 item once transcript-path exposure is confirmed.) FAIL-OPEN: any failure exits 0.
#
# Config: GATHER_URL + GATHER_TOKEN(_FILE); optional GATHER_CAPTURE=off to disable.
exec 2>/dev/null
export _CT_HOOK_INPUT="$(cat 2>/dev/null)"
export _CT_EVENT="${1:-flush}"
[ -z "$GATHER_URL" ] && exit 0
[ "$GATHER_CAPTURE" = "off" ] && exit 0
python3 - <<'PY' 2>/dev/null || exit 0
import json, os, time, urllib.request

base = os.environ.get("GATHER_URL", "").rstrip("/")
token = os.environ.get("GATHER_TOKEN") or ""
tf = os.environ.get("GATHER_TOKEN_FILE") or ""
if not token and tf and os.path.exists(tf):
    token = open(tf).read().strip()
if not base or not token:
    raise SystemExit(0)

event = os.environ.get("_CT_EVENT", "flush")
try:
    hook = json.loads(os.environ.get("_CT_HOOK_INPUT") or "{}")
except Exception:
    hook = {}
sid = hook.get("session_id", "")[:12]
cwd = hook.get("cwd") or os.getcwd()

text = (f"[session breadcrumb] {event} at {time.strftime('%Y-%m-%d %H:%M')} in {cwd}"
        + (f" (session {sid})" if sid else "")
        + ". Curation note: review this session for facts worth promoting "
          "(credentials created, infra changed, rulings, gotchas).")

try:
    req = urllib.request.Request(
        base + "/v1/memories/capture",
        data=json.dumps({"text": text, "source": f"hook_{event}", "agent": "claude-code"}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=4).read()
except Exception:
    raise SystemExit(0)                    # fail-open

try:
    mf = os.environ.get("GATHER_METRICS_FILE") or os.path.expanduser("~/.gather-metrics.jsonl")
    with open(mf, "a") as f:
        f.write(json.dumps({"ts": int(time.time()), "event": f"capture_{event}"}) + "\n")
except Exception:
    pass
PY
exit 0
