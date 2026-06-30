#!/usr/bin/env bash
# simdev — lean iOS Simulator control for low-RAM Macs (8 GB M1).
#
# The problem this solves: opening the Xcode IDE just to run a sim, or leaving
# stray booted devices around, wastes 1-2 GB on a machine that does not have it.
# simdev keeps exactly one device booted, never opens the full IDE, and always
# tells you the RAM cost.
#
# Usage:
#   simdev                 # status: free RAM, swap, booted devices
#   simdev clean           # shut down ALL sims + quit Simulator.app, report freed RAM
#   simdev boot [name]     # clean first, then boot ONE device (default: first available iPhone)
#   simdev list            # list available devices
#
# Install (optional): add an alias to your shell profile —
#   echo "alias simdev='bash $(pwd)/scripts/simdev.sh'" >> ~/.zshrc && source ~/.zshrc

set -euo pipefail

free_pct() { memory_pressure 2>/dev/null | awk -F': ' '/percentage/{print $2}'; }
swap_used() { sysctl -n vm.swapusage 2>/dev/null | sed -E 's/.*used = ([0-9.]+[A-Z]).*/\1/'; }

report_mem() { echo "  free: $(free_pct)   swap used: $(swap_used)"; }

booted_list() {
  xcrun simctl list devices booted 2>/dev/null | grep -i booted || true
}

clean() {
  echo "Before:"; report_mem
  xcrun simctl shutdown all 2>/dev/null && echo "  shut down all booted devices" || true
  osascript -e 'tell application "Simulator" to quit' 2>/dev/null && echo "  quit Simulator.app" || true
  sleep 3
  if pgrep -qf "Simulator.app/Contents/MacOS/Simulator"; then
    echo "  WARNING: a Simulator process is still alive (likely launched by another session)"
  else
    echo "  no Simulator processes remain"
  fi
  echo "After:"; report_mem
}

pick_default_device() {
  # First available, non-unavailable iPhone
  xcrun simctl list devices available 2>/dev/null \
    | grep -iE "iPhone" \
    | grep -v unavailable \
    | head -1 \
    | sed -E 's/^[[:space:]]*//; s/ \([0-9A-F-]+\).*$//'
}

boot() {
  local name="${1:-}"
  if [ -z "$name" ]; then name="$(pick_default_device)"; fi
  if [ -z "$name" ]; then echo "No available iPhone simulator found. Run: simdev list"; exit 1; fi
  echo "Cleaning stray sims first..."
  clean
  echo
  echo "Booting a single device: $name"
  xcrun simctl boot "$name"
  open -a Simulator
  sleep 2
  echo "Booted:"; booted_list
  echo "RAM now:"; report_mem
}

case "${1:-status}" in
  status)
    echo "Memory:"; report_mem
    echo "Booted devices:"; booted_list | sed 's/^/  /' || echo "  none"
    ;;
  clean|kill)  clean ;;
  boot)        boot "${2:-}" ;;
  list)        xcrun simctl list devices available 2>/dev/null | grep -iE "iPhone|iPad" ;;
  *)           echo "Usage: simdev [status|clean|boot [name]|list]"; exit 1 ;;
esac
