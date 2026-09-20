#!/usr/bin/env bash
#
# App Store Connect crash/hang watch — the iOS half of the 1.0.1 pre-submission
# telemetry gate (see CLAUDE.md, "iOS — TestFlight crash + Xcode Organizer
# watch"). Apple has no Pre-launch-report equivalent, so this reads what App
# Store Connect will tell an API client about crashes, hangs and tester reports.
#
# Three sources, because no one of them answers the gate on its own:
#
#   1. betaFeedbackCrashSubmissions  — TestFlight → Crashes, the tester-reported
#      crash reports. Read beside betaFeedbackScreenshotSubmissions, which acts
#      as the control: if BOTH are zero the family has no data and a zero crash
#      count proves nothing (UNVERIFIED). Screenshot comments are printed too —
#      they are free-text bug reports and a wedged boot arrives there, never as
#      a crash.
#   2. diagnosticSignatures — queried with NO filter[diagnosticType], because a
#      filtered query cannot tell "no diagnostics" from "diagnostics of a type
#      the filter did not name".
#   3. perfPowerMetrics — Xcode → Organizer → Metrics (hangs, launch, disk
#      writes). Needs its own Accept header; plain application/json returns 406.
#
# Both per-build endpoints return 404 for most builds — measured 2026-09-20,
# only the RELEASED build 59 of the ten most recent had either resource. That
# is why the status is checked: jq '.data|length' on a 404 body is 0, so this
# script used to print "0 diagnostic groups" for nine builds it had never
# successfully asked. UNAVAILABLE and 0 are now separate outcomes.
#
# It reports COUNTS, not a verdict, and it distinguishes ERROR / EMPTY / DATA
# rather than collapsing them. An EMPTY perfPowerMetrics is unmeasured, NOT
# clean — it fills only from testers who left Analytics sharing on, the same
# way Play Vitals does. An unresponsive UI without a crash still reads to a
# reviewer exactly like Play's Broken Functionality finding, so an all-zero run
# is a reason to do the row-5 stock-device walkthrough, not a substitute for it.
#
# Exit 0 on a clean read, 2 if any query errored.
#
# Required:
#   ASC_KEY_ID      App Store Connect API key id (the .p8's key id)
#   ASC_ISSUER_ID   App Store Connect issuer id
# Optional:
#   VEYRNOX_BUNDLE_ID   defaults to com.veyrnox.app
#
# The private key itself is never read from env or from this repo — it is
# expected at ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8, which is
# where the upload chain already keeps it. Nothing here is committed.
#
# Needs: bash, python3, openssl, curl, jq.
set -euo pipefail

: "${ASC_KEY_ID:?set ASC_KEY_ID (App Store Connect API key id)}"
: "${ASC_ISSUER_ID:?set ASC_ISSUER_ID (App Store Connect issuer id)}"
KEY_ID="$ASC_KEY_ID"
ISSUER_ID="$ASC_ISSUER_ID"
BUNDLE_ID="${VEYRNOX_BUNDLE_ID:-com.veyrnox.app}"
KEY_FILE="${HOME}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"
[ -f "$KEY_FILE" ] || { echo "missing key: $KEY_FILE" >&2; exit 1; }

mint_jwt() {
python3 - <<PY
import base64, json, time, subprocess
def b(x): return base64.urlsafe_b64encode(x).rstrip(b'=').decode()
now=int(time.time())
h={"alg":"ES256","kid":"$KEY_ID","typ":"JWT"}
p={"iss":"$ISSUER_ID","iat":now,"exp":now+1200,"aud":"appstoreconnect-v1"}
si=f"{b(json.dumps(h,separators=(',',':')).encode())}.{b(json.dumps(p,separators=(',',':')).encode())}"
der=subprocess.run(["openssl","dgst","-sha256","-sign","$KEY_FILE"],input=si.encode(),capture_output=True,check=True).stdout
def der_to_raw(s):
    assert s[0]==0x30; total=s[1]; body=s[2:2+total]
    assert body[0]==0x02; rlen=body[1]; r=body[2:2+rlen]
    b2=body[2+rlen:]; assert b2[0]==0x02; slen=b2[1]; ss=b2[2:2+slen]
    def pad(v):
        if len(v)>32: v=v[-32:]
        return b'\x00'*(32-len(v))+v
    return pad(r)+pad(ss)
print(f"{si}.{b(der_to_raw(der))}")
PY
}

JWT=$(mint_jwt)
AUTH_BASE=(--globoff -H "Authorization: Bearer $JWT")
AUTH=("${AUTH_BASE[@]}" -H "Accept: application/json")
APP_JSON=$(curl -sS "${AUTH[@]}" "https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=$BUNDLE_ID")
APP_ID=$(jq -r '.data[0].id // empty' <<<"$APP_JSON")
[ -n "$APP_ID" ] || { echo "app not found for bundle id $BUNDLE_ID" >&2; exit 1; }

# --- TestFlight tester feedback (app-level) ------------------------------
# The crash half of the gate. A zero here is only meaningful if the feedback
# family is answering at all, so the screenshot count is read as the control:
# both zero means "no tester feedback of any kind" (UNVERIFIED), while crashes
# zero beside a non-zero screenshot count is a genuine zero.
echo "=== TestFlight tester feedback ==="
FB_CRASH=$(curl -sS -w '\n%{http_code}' "${AUTH[@]}" \
  "https://api.appstoreconnect.apple.com/v1/apps/$APP_ID/betaFeedbackCrashSubmissions?limit=1")
FB_SHOT=$(curl -sS -w '\n%{http_code}' "${AUTH[@]}" \
  "https://api.appstoreconnect.apple.com/v1/apps/$APP_ID/betaFeedbackScreenshotSubmissions?limit=200")
http_of() { tail -n1 <<<"$1"; }
body_of() { sed '$d' <<<"$1"; }

if [ "$(http_of "$FB_CRASH")" != 200 ] || [ "$(http_of "$FB_SHOT")" != 200 ]; then
  echo "  ERROR: feedback query failed (crash HTTP $(http_of "$FB_CRASH"), screenshot HTTP $(http_of "$FB_SHOT"))" >&2
  jq -r '.errors[]?|"    \(.status) \(.code): \(.detail)"' <<<"$(body_of "$FB_CRASH")" >&2 || true
  jq -r '.errors[]?|"    \(.status) \(.code): \(.detail)"' <<<"$(body_of "$FB_SHOT")" >&2 || true
  FAILED=2
else
  N_CRASH=$(jq -r '.meta.paging.total // 0' <<<"$(body_of "$FB_CRASH")")
  N_SHOT=$(jq -r '.meta.paging.total // 0' <<<"$(body_of "$FB_SHOT")")
  echo "  crash submissions:      $N_CRASH"
  echo "  screenshot submissions: $N_SHOT"
  if [ "$N_CRASH" -gt 0 ]; then
    echo "  DATA: read App Store Connect -> TestFlight -> Crashes before submitting."
  elif [ "$N_SHOT" -gt 0 ]; then
    echo "  CLEAN: zero crash submissions, and the feedback family is answering"
    echo "         ($N_SHOT screenshot submissions prove it is not an empty endpoint)."
  else
    echo "  UNVERIFIED: no tester feedback of ANY kind. Zero crashes here is not"
    echo "              evidence of no crashes - it is evidence of no data."
  fi
  # Screenshot comments are free-text bug reports and routinely describe boot
  # failures, which never appear as crashes. Print them.
  jq -r '.data[]? | "  feedback \(.attributes.createdDate[0:10]) \(.attributes.deviceModel)/iOS \(.attributes.osVersion): \(.attributes.comment // "(no comment)")"' \
    <<<"$(body_of "$FB_SHOT")"
fi

echo "=== iOS builds ==="
BUILDS_JSON=$(curl -sS "${AUTH[@]}" "https://api.appstoreconnect.apple.com/v1/builds?filter[app]=$APP_ID&sort=-uploadedDate&limit=10")
# sort=-uploadedDate, never -version: version is the BUILD NUMBER, it restarts
# per train and is not unique, so -version means "highest build number anyone
# ever used on any train" and a fresh 1.0.2 (1) sorts LAST.
if ! BUILD_IDS=$(jq -er '.data[].id' <<<"$BUILDS_JSON"); then
  echo "  ERROR: builds query returned no .data -- response was:" >&2
  head -c 500 <<<"$BUILDS_JSON" >&2; echo >&2
  exit 2
fi
for BID in $BUILD_IDS; do
  VER=$(jq -r --arg id "$BID" '.data[]|select(.id==$id)|.attributes.version' <<<"$BUILDS_JSON")

  # No filter[diagnosticType]: a filtered query cannot tell "no diagnostics"
  # from "diagnostics of a type this filter does not name".
  #
  # The HTTP status is checked because a 404 here is NOT a zero. Builds too new
  # to have the resource return 404, and `jq '.data|length'` on that error body
  # yields 0 -- which is how this script reported "0 diagnostic groups" for two
  # builds that had never been asked the question at all.
  SIG=$(curl -sS -w '\n%{http_code}' "${AUTH[@]}" \
    "https://api.appstoreconnect.apple.com/v1/builds/$BID/diagnosticSignatures?limit=200")
  case "$(http_of "$SIG")" in
    200) COUNT=$(jq -r '.data|length' <<<"$(body_of "$SIG")")
         TYPES=$(jq -r '[.data[]?.attributes.diagnosticType]|unique|join(",")' <<<"$(body_of "$SIG")")
         DIAG="$COUNT diagnostic groups${TYPES:+ [$TYPES]}" ;;
    404) DIAG="diagnostics UNAVAILABLE (no resource for this build - not a zero)" ;;
    *)   DIAG="diagnostics ERROR (HTTP $(http_of "$SIG"))"; FAILED=2 ;;
  esac

  # Xcode Organizer metrics (hangs, launch, disk writes). Needs its own Accept
  # header; plain application/json returns 406. An empty productData is EMPTY,
  # never "clean" - it fills only from testers who left Analytics sharing on.
  PPM=$(curl -sS -w '\n%{http_code}' "${AUTH_BASE[@]}" \
    -H "Accept: application/vnd.apple.xcode-metrics+json" \
    "https://api.appstoreconnect.apple.com/v1/builds/$BID/perfPowerMetrics")
  if [ "$(http_of "$PPM")" = 404 ]; then
    METRICS="metrics UNAVAILABLE (no resource for this build - not a zero)"
  elif [ "$(http_of "$PPM")" != 200 ]; then
    METRICS="metrics ERROR (HTTP $(http_of "$PPM"))"
    FAILED=2
  elif [ "$(jq -r '.productData|length' <<<"$(body_of "$PPM")")" -eq 0 ]; then
    METRICS="metrics EMPTY (no qualifying installs - unmeasured, not clean)"
  else
    METRICS="metrics DATA ($(jq -r '[.productData[].metricCategories[]?.identifier]|unique|join(",")' <<<"$(body_of "$PPM")"))"
  fi

  echo "  build $VER ($BID) - $DIAG; $METRICS"
done

exit "${FAILED:-0}"
