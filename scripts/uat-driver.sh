#!/bin/bash
# UAT sim driver — single allowlisted entry point for taps/typing/screenshots.
# Usage:
#   uat-driver.sh tap "x1,y1 x2,y2 ..." [shotPath]   # tap each point (0.4s apart), optional screenshot
#   uat-driver.sh text "string" [shotPath]            # type text into focused field
#   uat-driver.sh key <code> [count]                  # press a key code N times (e.g. 42=backspace)
#   uat-driver.sh swipe x1 y1 x2 y2 [shotPath]        # swipe (duration 0.6)
#   uat-driver.sh shot <shotPath>                     # screenshot only
UDID=4A1C75B2-3757-4580-9A96-DEBB7D8D05FD
IDB=/tmp/idb-venv/bin/idb
cmd="$1"; shift
case "$cmd" in
  tap)
    pts="$1"; shot="$2"
    for p in $pts; do
      x="${p%,*}"; y="${p#*,}"
      "$IDB" ui tap --udid "$UDID" "$x" "$y"; sleep 0.4
    done
    ;;
  text)
    "$IDB" ui text --udid "$UDID" "$1"; sleep 1; shot="$2"
    ;;
  key)
    n="${2:-1}"; for i in $(seq 1 "$n"); do "$IDB" ui key --udid "$UDID" "$1"; done; shot="$3"
    ;;
  swipe)
    "$IDB" ui swipe --udid "$UDID" --duration 0.6 "$1" "$2" "$3" "$4"; sleep 0.5; shot="$5"
    ;;
  shot) shot="$1" ;;
  *) echo "unknown cmd: $cmd"; exit 2 ;;
esac
if [ -n "$shot" ]; then sleep 1.2; xcrun simctl io "$UDID" screenshot "$shot" >/dev/null 2>&1; sips -Z 700 "$shot" --out /tmp/v.png >/dev/null 2>&1; echo "shot: $shot (small: /tmp/v.png)"; fi
echo "ok"
