#!/usr/bin/env bash
#
# App Store Connect crash/hang watch — the iOS half of the 1.0.1 pre-submission
# telemetry gate (see CLAUDE.md, "iOS — TestFlight crash + Xcode Organizer
# watch"). Apple has no Pre-launch-report equivalent, so this lists recent
# builds and how many diagnostic groups each carries.
#
# It reports COUNTS, not a verdict. A non-zero group count means open
# App Store Connect → TestFlight → Crashes (and Xcode → Organizer → Metrics →
# Hangs) and read them; an unresponsive UI without a crash still reads to a
# reviewer exactly like Play's Broken Functionality finding.
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
AUTH=(--globoff -H "Authorization: Bearer $JWT" -H "Accept: application/json")
APP_JSON=$(curl -sS "${AUTH[@]}" "https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=$BUNDLE_ID")
APP_ID=$(jq -r '.data[0].id // empty' <<<"$APP_JSON")
[ -n "$APP_ID" ] || { echo "app not found for bundle id $BUNDLE_ID" >&2; exit 1; }

echo "=== iOS builds ==="
BUILDS_JSON=$(curl -sS "${AUTH[@]}" "https://api.appstoreconnect.apple.com/v1/builds?filter[app]=$APP_ID&sort=-uploadedDate&limit=10")
for BID in $(jq -r '.data[].id' <<<"$BUILDS_JSON"); do
  VER=$(jq -r --arg id "$BID" '.data[]|select(.id==$id)|.attributes.version' <<<"$BUILDS_JSON")
  SIG=$(curl -sS "${AUTH[@]}" "https://api.appstoreconnect.apple.com/v1/builds/$BID/diagnosticSignatures?filter[diagnosticType]=DISK_WRITES_DIAGNOSTIC,LAUNCH_DIAGNOSTIC,HANGS_DIAGNOSTIC")
  COUNT=$(jq -r '.data|length' <<<"$SIG")
  echo "  build $VER ($BID) — $COUNT diagnostic groups"
done
