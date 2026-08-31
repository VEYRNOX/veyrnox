#!/usr/bin/env bash
#
# Android Vitals crash/ANR watch — the Play half of the 1.0.1 pre-submission
# telemetry gate (see CLAUDE.md, "Play — Android Vitals watch"). Queries the
# Play Developer Reporting API for the last 7 days of daily crash and ANR rate.
#
# This is COMPLEMENTARY to the Pre-launch report, not a substitute: Pre-launch
# is one Robo crawl across ~10 devices, Vitals is every real install over time.
# A clean Pre-launch report with a red Vitals cluster still blocks submission.
#
# "No data yet" is the expected output early in an internal-testing window and
# is NOT a pass — Vitals only fills from installs that opted into usage +
# diagnostics sharing, so confirm each tester has Settings → Google → Usage &
# diagnostics → ON, or a quiet result is a false negative.
#
# Required:
#   PLAY_SA_JSON   path to a Google service-account JSON with the
#                  playdeveloperreporting scope
# Optional:
#   VEYRNOX_PACKAGE   defaults to com.veyrnox.app
#
# The service-account JSON is a CREDENTIAL: keep it outside the repo, never
# commit it, and prefer a path under a directory you control. This script only
# reads it — the key is written to a 0600 temp file for openssl and unlinked in
# a finally block.
#
# Needs: bash, python3, openssl, curl, jq.
set -euo pipefail

PACKAGE="${VEYRNOX_PACKAGE:-com.veyrnox.app}"
: "${PLAY_SA_JSON:?set PLAY_SA_JSON to the path of a service-account JSON with the playdeveloperreporting scope}"
SA_JSON="$PLAY_SA_JSON"
[ -f "$SA_JSON" ] || { echo "missing SA JSON: $SA_JSON" >&2; exit 1; }

get_token() {
python3 - "$SA_JSON" <<'PY'
import base64, json, sys, time, subprocess, tempfile, os, urllib.request, urllib.parse
sa=json.load(open(sys.argv[1]))
now=int(time.time())
h={"alg":"RS256","typ":"JWT","kid":sa["private_key_id"]}
p={"iss":sa["client_email"],"scope":"https://www.googleapis.com/auth/playdeveloperreporting","aud":"https://oauth2.googleapis.com/token","iat":now,"exp":now+3600}
def b(x): return base64.urlsafe_b64encode(x).rstrip(b'=').decode()
si=f"{b(json.dumps(h,separators=(',',':')).encode())}.{b(json.dumps(p,separators=(',',':')).encode())}"
# NamedTemporaryFile creates 0600; delete=False so openssl can reopen it by
# name on every platform. Always removed in the finally below.
f=tempfile.NamedTemporaryFile("w",suffix=".pem",delete=False); f.write(sa["private_key"]); f.close()
try:
    sig=subprocess.run(["openssl","dgst","-sha256","-sign",f.name],input=si.encode(),capture_output=True,check=True).stdout
finally:
    os.unlink(f.name)
jwt=f"{si}.{b(sig)}"
r=urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token",data=urllib.parse.urlencode({"grant_type":"urn:ietf:params:oauth:grant-type:jwt-bearer","assertion":jwt}).encode(),headers={"Content-Type":"application/x-www-form-urlencoded"})).read()
print(json.loads(r)["access_token"])
PY
}

TOKEN=$(get_token)
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
BASE="https://playdeveloperreporting.googleapis.com/v1beta1/apps/$PACKAGE"
NOW=$(date -u +%s); END=$((NOW-24*3600)); SINCE=$((NOW-7*24*3600))
d(){ date -u -r "$1" "$2" 2>/dev/null || date -u -d @"$1" "$2"; }
SY=$(d $SINCE +%Y); SM=$(d $SINCE +%-m); SD=$(d $SINCE +%-d)
EY=$(d $END +%Y);   EM=$(d $END +%-m);   ED=$(d $END +%-d)

echo "=== Package: $PACKAGE ==="
echo "=== Crash rate ==="
CRASH_JSON=$(curl -sS "${AUTH[@]}" -X POST "$BASE/crashRateMetricSet:query" -d "{
  \"timelineSpec\": {\"aggregationPeriod\": \"DAILY\",
    \"startTime\": {\"year\": $SY, \"month\": $SM, \"day\": $SD, \"timeZone\": {\"id\": \"America/Los_Angeles\"}},
    \"endTime\":   {\"year\": $EY, \"month\": $EM, \"day\": $ED, \"timeZone\": {\"id\": \"America/Los_Angeles\"}}},
  \"metrics\": [\"crashRate\", \"distinctUsers\"]}")
if jq -e '.rows // empty' <<<"$CRASH_JSON" >/dev/null; then
  jq -r '.rows[]|"  \(.startTime.year)-\(.startTime.month)-\(.startTime.day): crashRate=\(.metrics[]?|select(.metric=="crashRate")|.decimalValue.value // "n/a")"' <<<"$CRASH_JSON"
else
  echo "  no crash-rate data yet (not a pass — see the opt-in note in this file's header)."
fi

echo "=== ANR rate ==="
ANR_JSON=$(curl -sS "${AUTH[@]}" -X POST "$BASE/anrRateMetricSet:query" -d "{
  \"timelineSpec\": {\"aggregationPeriod\": \"DAILY\",
    \"startTime\": {\"year\": $SY, \"month\": $SM, \"day\": $SD, \"timeZone\": {\"id\": \"America/Los_Angeles\"}},
    \"endTime\":   {\"year\": $EY, \"month\": $EM, \"day\": $ED, \"timeZone\": {\"id\": \"America/Los_Angeles\"}}},
  \"metrics\": [\"anrRate\", \"distinctUsers\"]}")
if jq -e '.rows // empty' <<<"$ANR_JSON" >/dev/null; then
  jq -r '.rows[]|"  \(.startTime.year)-\(.startTime.month)-\(.startTime.day): anrRate=\(.metrics[]?|select(.metric=="anrRate")|.decimalValue.value // "n/a")"' <<<"$ANR_JSON"
else
  echo "  no ANR data yet (not a pass — see the opt-in note in this file's header)."
fi
