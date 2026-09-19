#!/usr/bin/env bash
#
# Android Vitals crash/ANR watch — the Play half of the pre-submission telemetry
# gate (see CLAUDE.md, "Play — Android Vitals watch"). Queries the Play Developer
# Reporting API for daily crash and ANR rate.
#
# This is COMPLEMENTARY to the Pre-launch report, not a substitute: Pre-launch is
# one Robo crawl across ~10 devices, Vitals is every real install over time. A
# clean Pre-launch report with a red Vitals cluster still blocks submission.
#
# THREE OUTCOMES, AND THEY ARE NOT THE SAME THING:
#   DATA   rows came back — read them, and judge.
#   EMPTY  the query succeeded and returned nothing. NOT a pass. Vitals only
#          fills from installs that opted into usage + diagnostics sharing, so a
#          quiet result is a false negative unless you know qualifying installs
#          exist. Play also suppresses metrics below a privacy threshold.
#   ERROR  the API refused. Never report this as EMPTY.
#
# The previous version of this script conflated EMPTY and ERROR: it tested
# `jq -e '.rows // empty'` and printed "no data yet" on anything else, including
# a 400. Worse, its window ended at now-24h while DAILY freshness runs ~2 days
# behind, so every run 400'd and every run printed the reassuring line. It had
# never produced a reading. Hence: freshness is queried first and the window
# clamped to it, and .error is checked before .rows.
#
# Exit status: 0 = DATA or EMPTY, 2 = ERROR. Empty is not a failure of the tool,
# so it does not fail the script — but it is not a pass of the gate either, and
# only a human can tell those apart.
#
# Credentials, either:
#   PLAY_SA_JSON      path to a service-account JSON with the
#                     playdeveloperreporting scope, or
#   PLAY_VITALS_ACCOUNT  a gcloud account that already holds such a key, e.g.
#                     github-actions-testlab@veyrnox-wallet.iam.gserviceaccount.com
#                     — gcloud can mint a scoped token for an activated service
#                     account with no key file on disk, which is how the
#                     2026-09-19 read was done.
# Optional:
#   VEYRNOX_PACKAGE   defaults to com.veyrnox.app
#   VITALS_DAYS       days of history to request (default 28)
#
# A service-account JSON is a CREDENTIAL: keep it outside the repo, never commit
# it. This script only reads it — the key goes to a 0600 temp file for openssl
# and is unlinked in a finally block.
#
# Needs: bash, python3, curl, jq (openssl too, for the PLAY_SA_JSON path).
set -euo pipefail

PACKAGE="${VEYRNOX_PACKAGE:-com.veyrnox.app}"
DAYS="${VITALS_DAYS:-28}"
SCOPE="https://www.googleapis.com/auth/playdeveloperreporting"

get_token() {
  if [ -n "${PLAY_VITALS_ACCOUNT:-}" ]; then
    gcloud auth print-access-token --account="$PLAY_VITALS_ACCOUNT" --scopes="$SCOPE"
    return
  fi
  : "${PLAY_SA_JSON:?set PLAY_SA_JSON (service-account JSON) or PLAY_VITALS_ACCOUNT (gcloud account)}"
  [ -f "$PLAY_SA_JSON" ] || { echo "missing SA JSON: $PLAY_SA_JSON" >&2; exit 2; }
  python3 - "$PLAY_SA_JSON" "$SCOPE" <<'PY'
import base64, json, sys, time, subprocess, tempfile, os, urllib.request, urllib.parse
sa=json.load(open(sys.argv[1])); scope=sys.argv[2]; now=int(time.time())
h={"alg":"RS256","typ":"JWT","kid":sa["private_key_id"]}
p={"iss":sa["client_email"],"scope":scope,"aud":"https://oauth2.googleapis.com/token","iat":now,"exp":now+3600}
def b(x): return base64.urlsafe_b64encode(x).rstrip(b'=').decode()
si=f"{b(json.dumps(h,separators=(',',':')).encode())}.{b(json.dumps(p,separators=(',',':')).encode())}"
f=tempfile.NamedTemporaryFile("w",suffix=".pem",delete=False); f.write(sa["private_key"]); f.close()
try:
    sig=subprocess.run(["openssl","dgst","-sha256","-sign",f.name],input=si.encode(),capture_output=True,check=True).stdout
finally:
    os.unlink(f.name)
jwt=f"{si}.{b(sig)}"
r=urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token",
    data=urllib.parse.urlencode({"grant_type":"urn:ietf:params:oauth:grant-type:jwt-bearer","assertion":jwt}).encode(),
    headers={"Content-Type":"application/x-www-form-urlencoded"})).read()
print(json.loads(r)["access_token"])
PY
}

TOKEN=$(get_token)
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
BASE="https://playdeveloperreporting.googleapis.com/v1beta1/apps/$PACKAGE"

status=0

# Ask the API how fresh each metric set is, rather than guessing a window.
# DAILY freshness runs roughly two days behind; requesting anything newer is a
# hard 400, which is what broke the previous version.
report() {
  local set_name="$1" metric="$2"
  local fresh
  fresh=$(curl -sS "${AUTH[@]}" "$BASE/$set_name") || { echo "  ERROR: freshness request failed"; status=2; return; }
  local end
  end=$(printf '%s' "$fresh" | jq -r '
    if .error then "ERROR:\(.error.status // .error.code) \(.error.message)"
    else ([.freshnessInfo.freshnesses[]? | select(.aggregationPeriod=="DAILY") | .latestEndTime] | first
          | if . == null then "NONE" else "\(.year)-\(.month)-\(.day)" end)
    end')
  case "$end" in
    ERROR:*) echo "  ERROR reading freshness: ${end#ERROR:}"; status=2; return ;;
    NONE)    echo "  ERROR: API reports no DAILY freshness for $set_name"; status=2; return ;;
  esac
  local ey em ed
  IFS=- read -r ey em ed <<<"$end"
  local start_epoch sy sm sd
  start_epoch=$(python3 -c "
import datetime,sys
e=datetime.date(int('$ey'),int('$em'),int('$ed'))-datetime.timedelta(days=int('$DAYS'))
print(f'{e.year} {e.month} {e.day}')")
  read -r sy sm sd <<<"$start_epoch"

  local body resp
  body=$(jq -nc --argjson sy "$sy" --argjson sm "$sm" --argjson sd "$sd" \
                --argjson ey "$ey" --argjson em "$em" --argjson ed "$ed" --arg m "$metric" '{
    timelineSpec:{aggregationPeriod:"DAILY",
      startTime:{year:$sy,month:$sm,day:$sd,timeZone:{id:"America/Los_Angeles"}},
      endTime:{year:$ey,month:$em,day:$ed,timeZone:{id:"America/Los_Angeles"}}},
    metrics:[$m,"distinctUsers"]}')
  resp=$(curl -sS "${AUTH[@]}" -X POST "$BASE/$set_name:query" -d "$body") || {
    echo "  ERROR: query request failed"; status=2; return; }

  # .error BEFORE .rows. Conflating these is the bug this rewrite exists to fix.
  if printf '%s' "$resp" | jq -e '.error' >/dev/null 2>&1; then
    echo "  ERROR: $(printf '%s' "$resp" | jq -r '"\(.error.status // .error.code): \(.error.message)"' | head -3)"
    status=2; return
  fi
  local n
  n=$(printf '%s' "$resp" | jq '[.rows[]?] | length')
  echo "  window: $sy-$sm-$sd .. $end (DAILY freshness), $DAYS days requested"
  if [ "$n" = "0" ]; then
    echo "  EMPTY — query succeeded, zero rows. NOT a pass: confirm qualifying"
    echo "  installs exist (testers with Usage & diagnostics ON) before reading"
    echo "  this as clean. Play also suppresses metrics below a privacy threshold."
    return
  fi
  echo "  DATA — $n daily rows:"
  printf '%s' "$resp" | jq -r --arg m "$metric" '.rows[] |
    "    \(.startTime.year)-\(.startTime.month)-\(.startTime.day)  " +
    "\($m)=\([.metrics[]? | select(.metric==$m) | .decimalValue.value] | first // "n/a")  " +
    "users=\([.metrics[]? | select(.metric=="distinctUsers") | .decimalValue.value] | first // "n/a")"'
}

echo "=== Package: $PACKAGE ==="
echo "=== Crash rate ==="
report crashRateMetricSet crashRate
echo "=== ANR rate ==="
report anrRateMetricSet anrRate
exit "$status"
