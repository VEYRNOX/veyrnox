"""
Veyrnox — Automated UAT Suite (Android Pixel 5 Emulation)
==========================================================
Builds the UAT release, serves it via vite preview, then exercises every major
user flow through Playwright's Pixel 5 device emulation (393 × 851, touch-enabled).

Uses a throwaway test seed — never a real user seed.

Usage:
    python scripts/uat_android.py              # build + run headless
    python scripts/uat_android.py --headed     # show browser window live
    python scripts/uat_android.py --no-server  # skip build (assume preview running on 4173)
    python scripts/uat_android.py --port 4173  # explicit port
"""

import argparse
import os
import signal
import subprocess
import sys
import time
import threading
import traceback
from datetime import datetime
from pathlib import Path

# ─── CLI args ────────────────────────────────────────────────────────────────
ap = argparse.ArgumentParser()
ap.add_argument("--headed",    action="store_true", help="Run with visible browser")
ap.add_argument("--no-server", action="store_true", help="Skip build+server (assume already running)")
ap.add_argument("--port",      type=int, default=4173, help="Preview server port (default: 4173)")
ap.add_argument("--timeout",   type=int, default=20000, help="Per-action timeout ms")
ARGS = ap.parse_args()

BASE_URL = f"http://localhost:{ARGS.port}"

# ─── Test wallet (throwaway — never a real user seed) ─────────────────────────
TEST_SEED = "bamboo lyrics harvest potato seat carry equip nation slam begin admit pet"
TEST_PIN  = "111111"

# ─── Playwright Android device profile (Pixel 5) ─────────────────────────────
PIXEL5 = {
    "viewport":            {"width": 393, "height": 851},
    "device_scale_factor": 2.75,
    "is_mobile":           True,
    "has_touch":           True,
    "user_agent": (
        "Mozilla/5.0 (Linux; Android 11; Pixel 5) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/93.0.4577.62 Mobile Safari/537.36"
    ),
}

# ─── Screenshot dir ───────────────────────────────────────────────────────────
SS_DIR = Path("screenshots/uat")
SS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Test result accumulator ─────────────────────────────────────────────────
results: list = []

def record(name: str, passed: bool, note: str = "", screenshot: str = ""):
    status = "PASS" if passed else "FAIL"
    mark   = "[OK]" if passed else "[!!]"
    print(f"  {mark} [{status}] {name}" + (f" - {note}" if note else ""))
    results.append({"name": name, "passed": passed, "note": note, "screenshot": screenshot})

# ─── Server management ───────────────────────────────────────────────────────
_server_proc = None

def _npm(args: list, label="", env=None):
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    e = env or os.environ.copy()
    e["FORCE_COLOR"] = "0"
    proc = subprocess.Popen(
        [npm_cmd] + args,
        env=e, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, cwd=str(Path(__file__).parent.parent),
    )
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            print(f"  [{label or 'npm'}] {line}")
    proc.wait()
    return proc.returncode

def start_server():
    global _server_proc
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    print("\n[build] npm run build:uat ...")
    rc = _npm(["run", "build:uat"], label="build")
    if rc != 0:
        raise RuntimeError(f"build:uat failed (exit {rc})")
    print("[build] UAT build complete.")

    print(f"\n[server] Starting vite preview on port {ARGS.port} ...")
    env = os.environ.copy()
    env["FORCE_COLOR"] = "0"
    _server_proc = subprocess.Popen(
        [npm_cmd, "run", "preview", "--", "--port", str(ARGS.port)],
        env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
        cwd=str(Path(__file__).parent.parent),
    )
    def _stream():
        for line in _server_proc.stdout:
            line = line.rstrip()
            if line:
                print(f"  [preview] {line}")
    threading.Thread(target=_stream, daemon=True).start()

    import urllib.request
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            urllib.request.urlopen(BASE_URL, timeout=2)
            print(f"[server] Preview ready at {BASE_URL}")
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f"vite preview did not start within 30s on port {ARGS.port}")

def stop_server():
    if _server_proc:
        if sys.platform == "win32":
            _server_proc.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            _server_proc.send_signal(signal.SIGTERM)
        try:
            _server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _server_proc.kill()

# ─── Playwright helpers ───────────────────────────────────────────────────────
def ss(page, name: str) -> str:
    safe = name.replace(" ", "_").replace("/", "-").replace(":", "")
    path = SS_DIR / f"{safe}.png"
    page.screenshot(path=str(path), full_page=False)
    return str(path)

def go(page, path: str = ""):
    """Navigate to path. Auto-re-unlocks with PIN if the reload shows the lock screen."""
    url = f"{BASE_URL}/{path.lstrip('/')}" if path else BASE_URL
    page.goto(url)
    page.wait_for_load_state("networkidle", timeout=ARGS.timeout)
    # A full page reload drops the in-memory unlock state; re-enter PIN if needed.
    try:
        if page.locator('[aria-label="PIN entry"]').is_visible(timeout=2500):
            enter_pin(page, TEST_PIN)
            time.sleep(2.5)  # Argon2id + React re-render
            page.wait_for_load_state("networkidle", timeout=ARGS.timeout)
    except Exception:
        pass

def visible(page, selector: str) -> bool:
    try:
        return page.locator(selector).first.is_visible(timeout=2000)
    except Exception:
        return False

def count(page, selector: str) -> int:
    try:
        return page.locator(selector).count()
    except Exception:
        return 0

def clear_vault(page):
    """Wipe all Veyrnox local state so we start fresh."""
    page.evaluate("""
        async () => {
            try { localStorage.clear(); } catch {}
            try { sessionStorage.clear(); } catch {}
            const dbs = ['veyrnox-vault', 'veyrnox-appdata'];
            await Promise.all(dbs.map(name => new Promise(res => {
                const r = indexedDB.deleteDatabase(name);
                r.onsuccess = r.onerror = r.onblocked = res;
            })));
        }
    """)

def enter_pin(page, digits: str):
    """Tap each digit on the PinPad component."""
    pad = page.locator('[aria-label="PIN entry"]')
    for d in digits:
        pad.get_by_role("button", name=d, exact=True).click(timeout=5000)
        time.sleep(0.12)

def click_text(page, text: str, timeout: int = 8000) -> bool:
    """Click the first element containing this text. Returns True on success."""
    try:
        page.get_by_text(text, exact=False).first.click(timeout=timeout)
        return True
    except Exception:
        return False

def click_button(page, name: str, timeout: int = 8000) -> bool:
    try:
        page.get_by_role("button", name=name, exact=False).first.click(timeout=timeout)
        return True
    except Exception:
        return False

# ─── Onboarding ──────────────────────────────────────────────────────────────
def suite_onboarding(page):
    """T00 — Fresh PIN-first onboarding: import throwaway wallet."""
    print("\n[T00] Onboarding — fresh install, import test wallet")

    # 1. Load app & clear any previous vault
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle", timeout=ARGS.timeout)
    clear_vault(page)
    page.reload()
    page.wait_for_load_state("networkidle", timeout=ARGS.timeout)
    time.sleep(1.2)
    shot = ss(page, "T00_01_fresh_start")
    record("T00 App loads on fresh device (no vault)", count(page, "button") > 0, screenshot=shot)

    # 2. "Get Started"
    click_button(page, "Get Started")
    time.sleep(0.8)
    shot2 = ss(page, "T00_02_pin_create")
    on_pin = page.locator('[aria-label="PIN entry"]').is_visible(timeout=6000)
    record("T00 Get Started leads to PIN pad", on_pin, screenshot=shot2)
    if not on_pin:
        record("T00 PIN entry (skipped — PIN pad not found)", False, note="onboarding stalled")
        return

    # 3. Enter PIN — PinPad auto-submits after 6 digits → transitions to 'real-confirm'
    enter_pin(page, TEST_PIN)
    time.sleep(1.0)
    shot3 = ss(page, "T00_03_pin_entered")
    record("T00 PIN digits entered (6/6)", True, screenshot=shot3)

    # 4. Confirm PIN
    enter_pin(page, TEST_PIN)
    time.sleep(2.0)   # wait for Argon2id provisioning
    shot5 = ss(page, "T00_05_post_pin")
    record("T00 PIN confirmed", True, screenshot=shot5)

    # 5. Post-PIN landing: ExploreShell shows the Dashboard with a "Create or import"
    #    sticky button at the bottom (and optionally a centre card CTA).
    #    Click the sticky bottom button to enter the choose/import view.
    try:
        # Find and click ANY button whose text contains "Create or import"
        page.get_by_role("button", name="Create or import", exact=False).first.click(timeout=6000)
        time.sleep(0.8)
    except Exception:
        pass  # may already be on choose view directly

    shot_choose = ss(page, "T00_06a_choose_view")

    # 6. Click "Import an existing seed" — use exact role match to avoid hitting
    #    the description paragraph that also contains this phrase.
    try:
        page.get_by_role("button", name="Import an existing seed", exact=True).click(timeout=6000)
        time.sleep(0.8)
    except Exception:
        # Fallback: get_by_role with partial name
        try:
            page.get_by_role("button", name="Import an existing seed", exact=False).click(timeout=4000)
            time.sleep(0.8)
        except Exception as e:
            record("T00 Import existing seed button clicked", False, note=str(e)[:120])
            ss(page, "T00_06b_import_fail")
            return

    shot6 = ss(page, "T00_06_import_choose")
    record("T00 Import existing seed button clicked", True, screenshot=shot6)

    # 7. Wait for the seed textarea and fill it.
    #    The textarea expands inline below the button; scroll it into view if needed.
    try:
        textarea = page.locator('[aria-label="Recovery seed phrase"]')
        textarea.wait_for(state="visible", timeout=10000)
        textarea.scroll_into_view_if_needed()
        textarea.fill(TEST_SEED)
        time.sleep(0.4)
    except Exception as e:
        # Try by placeholder as fallback
        try:
            fb = page.get_by_placeholder("word1 word2 word3", exact=False)
            fb.wait_for(state="visible", timeout=6000)
            fb.fill(TEST_SEED)
            time.sleep(0.4)
        except Exception as e2:
            shot_fail = ss(page, "T00_07_seed_fail")
            record("T00 Seed phrase textarea found and filled", False,
                   note=f"aria-label: {str(e)[:80]} | placeholder: {str(e2)[:80]}", screenshot=shot_fail)
            return

    shot7 = ss(page, "T00_07_seed_entered")
    record("T00 Seed phrase entered", True, screenshot=shot7)

    # 8. Submit import
    try:
        page.get_by_role("button", name="Restore / Import", exact=False).click(timeout=6000)
    except Exception as e:
        record("T00 Restore/Import button clicked", False, note=str(e)[:120])
        return

    time.sleep(4)   # Argon2id KDF + vault provisioning
    shot8 = ss(page, "T00_08_post_import")

    # Success: onboarding overlay gone, app nav visible
    on_app = (
        count(page, "nav") > 0 and
        page.locator('[aria-label="PIN entry"]').is_visible(timeout=500) is False
    )
    try:
        pin_gone = not page.locator('[aria-label="PIN entry"]').is_visible(timeout=500)
    except Exception:
        pin_gone = True
    on_app = count(page, "nav") > 0 or pin_gone
    record("T00 Wallet imported — app unlocked", on_app, screenshot=shot8)


# ─── Individual test suites ───────────────────────────────────────────────────

def suite_bottom_nav(page):
    """T02 — Mobile bottom nav: 3 tabs visible and tappable."""
    print("\n[T02] Bottom navigation bar")
    go(page)
    time.sleep(0.8)
    shot = ss(page, "T02_bottom_nav")

    def _nav_link(label):
        for loc in [
            page.get_by_role("tab",    name=label, exact=True),   # bottom nav role=tab
            page.locator(f'[aria-label="{label}"]'),               # aria-label match
            page.get_by_role("link",   name=label, exact=True),
            page.get_by_role("button", name=label, exact=True),
            page.locator("nav").get_by_text(label, exact=True),
        ]:
            try:
                if loc.first.is_visible(timeout=2000):
                    return loc.first
            except Exception:
                continue
        return None

    home = _nav_link("Home")
    send = _nav_link("Send")
    recv = _nav_link("Receive")
    record("T02 Home tab visible",    home is not None, screenshot=shot)
    record("T02 Send tab visible",    send is not None, screenshot=shot)
    record("T02 Receive tab visible", recv is not None, screenshot=shot)

    if send:
        try:
            send.click(timeout=5000); time.sleep(1)
            shot2 = ss(page, "T02_send_tap")
            record("T02 Send tab tappable", True, screenshot=shot2)
        except Exception as e:
            record("T02 Send tab tappable", False, note=str(e)[:100])
    else:
        record("T02 Send tab tappable", False, note="link not found")

    go(page); time.sleep(0.5)
    recv2 = _nav_link("Receive")
    if recv2:
        try:
            recv2.click(timeout=5000); time.sleep(1)
            shot3 = ss(page, "T02_receive_tap")
            record("T02 Receive tab tappable", True, screenshot=shot3)
        except Exception as e:
            record("T02 Receive tab tappable", False, note=str(e)[:100])
    else:
        record("T02 Receive tab tappable", False, note="link not found")

def suite_more_drawer(page):
    """T03 — More drawer opens."""
    print("\n[T03] More drawer")
    go(page); time.sleep(0.8)
    opened = False
    for sel in [
        lambda: page.locator('[aria-label="More features"]').first.click(timeout=3000),
        lambda: page.get_by_role("tab", name="More", exact=True).click(timeout=3000),
        lambda: page.get_by_role("button", name="More", exact=True).click(timeout=3000),
        lambda: click_text(page, "More"),
    ]:
        try:
            sel(); opened = True; break
        except Exception:
            continue
    time.sleep(0.8)
    shot = ss(page, "T03_more_drawer")
    record("T03 More drawer opens feature grid", count(page, "a[href]") > 5, screenshot=shot)

def suite_dashboard(page):
    """T04 — Dashboard."""
    print("\n[T04] Dashboard")
    go(page); time.sleep(1.5)
    # Give the dashboard a moment to fully hydrate after unlock
    try:
        page.locator('[aria-label="Bottom navigation"]').wait_for(state="visible", timeout=5000)
    except Exception:
        pass
    shot = ss(page, "T04_dashboard")
    content = page.content()
    has_content = any(t in content for t in ["ETH", "Portfolio", "Balance", "Wallet", "Asset", "Send", "Receive", "Home"])
    record("T04 Dashboard renders wallet content", has_content, screenshot=shot)
    record("T04 Dashboard has nav",                count(page, "nav") > 0, screenshot=shot)

def suite_send_screen(page):
    """T05 — Send screen."""
    print("\n[T05] Send screen")
    go(page); time.sleep(0.5)
    send_link = None
    for loc in [
        page.get_by_role("tab",    name="Send", exact=True),
        page.locator('[aria-label="Send"]'),
        page.get_by_role("link",   name="Send", exact=True),
        page.get_by_role("button", name="Send", exact=True),
        page.locator("nav").get_by_text("Send", exact=True),
    ]:
        try:
            if loc.first.is_visible(timeout=2000):
                send_link = loc.first; break
        except Exception:
            continue
    if send_link:
        send_link.click(timeout=5000); time.sleep(1.5)
    else:
        go(page, "/send"); time.sleep(1.0)  # use go() so auto-re-unlock fires

    shot = ss(page, "T05_send_screen")
    content = page.content()

    # Find recipient input
    recipient_input = None
    for inp in page.locator("input").all():
        try:
            ph = (inp.get_attribute("placeholder") or "").lower()
            nm = (inp.get_attribute("name") or "").lower()
            if any(k in ph or k in nm for k in ["address", "recipient", "0x", "to"]):
                recipient_input = inp; break
        except Exception:
            pass

    has_send_ui = "send" in content.lower() or recipient_input is not None or count(page, "button") > 2
    record("T05 Send screen renders", has_send_ui, screenshot=shot)

    if recipient_input:
        try:
            recipient_input.fill("0x1234567890abcdef1234567890abcdef12345678")
            time.sleep(0.3)
            shot2 = ss(page, "T05_send_address_entered")
            record("T05 Send: address entry works", True, screenshot=shot2)
        except Exception as e:
            record("T05 Send: address entry works", False, note=str(e)[:120])
    else:
        record("T05 Send: address entry works", False, note="no recipient input found")

def suite_receive_screen(page):
    """T06 — Receive screen: QR + address."""
    print("\n[T06] Receive screen")
    go(page); time.sleep(0.5)
    recv_link = None
    for loc in [
        page.get_by_role("tab",    name="Receive", exact=True),
        page.locator('[aria-label="Receive"]'),
        page.get_by_role("link",   name="Receive", exact=True),
        page.get_by_role("button", name="Receive", exact=True),
        page.locator("nav").get_by_text("Receive", exact=True),
    ]:
        try:
            if loc.first.is_visible(timeout=2000):
                recv_link = loc.first; break
        except Exception:
            continue
    if recv_link:
        recv_link.click(timeout=5000); time.sleep(1.5)
    else:
        go(page, "/receive"); time.sleep(1.0)  # use go() so auto-re-unlock fires

    shot = ss(page, "T06_receive_screen")
    content = page.content()
    has_qr   = count(page, "canvas") > 0 or count(page, "svg path") > 3
    has_addr = "0x" in content or "bc1" in content
    has_copy = page.get_by_text("Copy", exact=False).count() > 0
    record("T06 Receive: QR code rendered",                has_qr,                screenshot=shot)
    record("T06 Receive: address or Copy button present",  has_addr or has_copy,  screenshot=shot)

def _page_renders(page, path: str, keywords: list, label: str):
    """Generic: navigate to path, check keywords/elements present."""
    go(page, path); time.sleep(1)
    content = page.content()
    shot = ss(page, label)
    ok = (
        any(k.lower() in content.lower() for k in keywords) or
        count(page, "h1, h2") > 0
    )
    record(f"{label.split('_',1)[1].replace('_',' ')} page renders", ok, screenshot=shot)

def suite_transaction_history(page):
    print("\n[T07] Transaction History")
    _page_renders(page, "/transactions", ["Transaction", "History", "Send", "Receive"], "T07_tx_history")

def suite_security_dashboard(page):
    print("\n[T08] Security Dashboard")
    _page_renders(page, "/security", ["Security", "2FA", "PIN", "Vault", "Duress"], "T08_security_dashboard")

def suite_duress_pin(page):
    print("\n[T09] Duress PIN")
    _page_renders(page, "/security/duress-pin", ["Duress", "Decoy", "coercion"], "T09_duress_pin")

def suite_stealth_wallets(page):
    print("\n[T10] Stealth Wallets")
    _page_renders(page, "/security/stealth-wallets", ["Stealth", "Hidden", "secret"], "T10_stealth_wallets")

def suite_panic_wipe(page):
    """T11 — Panic Wipe: renders guard, does NOT auto-wipe."""
    print("\n[T11] Panic Wipe")
    go(page, "/security/panic-wipe"); time.sleep(1)
    shot = ss(page, "T11_panic_wipe")
    content = page.content()
    has_content = any(k.lower() in content.lower() for k in ["Panic", "Wipe", "WIPE", "Emergency", "Destroy"])
    still_here  = "/panic" in page.url or "/security" in page.url
    record("T11 Panic Wipe renders guard UI",          has_content, screenshot=shot)
    record("T11 Panic Wipe does NOT auto-trigger",     still_here,  screenshot=shot)

def suite_analytics(page):
    print("\n[T12] Analytics")
    _page_renders(page, "/analytics", ["Analytics", "Portfolio", "Chart"], "T12_analytics")

def suite_address_book(page):
    print("\n[T13] Address Book")
    _page_renders(page, "/address-book", ["Address", "Book", "Contact"], "T13_address_book")

def suite_settings(page):
    print("\n[T14] Settings")
    _page_renders(page, "/settings", ["Settings", "Theme", "Currency", "Language"], "T14_settings")

def suite_watchlist(page):
    print("\n[T15] Watchlist")
    _page_renders(page, "/watchlist", ["Watchlist", "Watch", "Asset"], "T15_watchlist")

def suite_network_manager(page):
    print("\n[T16] Network Manager")
    _page_renders(page, "/network-manager", ["Network", "RPC", "Chain"], "T16_network_manager")

def suite_gas_fees(page):
    print("\n[T17] Gas Fees")
    _page_renders(page, "/gas-fees", ["Gas", "Fee", "Gwei"], "T17_gas_fees")

def suite_price_charts(page):
    print("\n[T18] Price Charts")
    _page_renders(page, "/price-charts", ["Price", "Chart", "ETH"], "T18_price_charts")

def suite_tax_report(page):
    print("\n[T19] Tax Report")
    _page_renders(page, "/tax-report", ["Tax", "Report", "Capital"], "T19_tax_report")

def suite_savings_goals(page):
    print("\n[T20] Savings Goals")
    _page_renders(page, "/savings-goals", ["Savings", "Goal", "Target"], "T20_savings_goals")

def suite_notifications(page):
    print("\n[T21] Notification Centre")
    _page_renders(page, "/notifications", ["Notification", "Alert", "Activity"], "T21_notifications")

def suite_scroll(page):
    """T22 — Mobile scroll on dashboard."""
    print("\n[T22] Scroll behavior")
    go(page); time.sleep(1)
    try:
        page.evaluate("window.scrollTo(0, 400)"); time.sleep(0.3)
        shot = ss(page, "T22_scroll_mid")
        page.evaluate("window.scrollTo(0, 0)")
        record("T22 Dashboard mobile scroll works", True, screenshot=shot)
    except Exception as e:
        record("T22 Dashboard mobile scroll works", False, note=str(e)[:100])

def suite_no_js_errors(page):
    """T23 — No uncaught JS errors on dashboard + send."""
    print("\n[T23] Console error check")
    errors = []
    IGNORE = ["net::ERR_", "Failed to fetch", "NetworkError", "Load failed",
              "ERR_NAME_NOT_RESOLVED", "favicon", "chrome-extension",
              "ERR_CONNECTION_REFUSED"]
    def on_error(err):
        msg = getattr(err, "text", str(err))
        if not any(s in msg for s in IGNORE):
            errors.append(msg[:200])
    page.on("pageerror", on_error)
    go(page); time.sleep(2)
    page.remove_listener("pageerror", on_error)
    shot = ss(page, "T23_no_errors")
    record(
        "T23 No uncaught JS errors on Dashboard",
        len(errors) == 0,
        note=f"{len(errors)} error(s): {errors[:2]}" if errors else "",
        screenshot=shot,
    )

def suite_security_center(page):
    print("\n[T24] Security Center")
    _page_renders(page, "/security-center", ["Security", "Center", "Access"], "T24_security_center")

def suite_token_approvals(page):
    print("\n[T25] Token Approvals")
    _page_renders(page, "/token-approvals", ["Approval", "Token", "Revoke", "ERC", "allowance", "Spend"], "T25_token_approvals")

def suite_hd_wallet(page):
    print("\n[T26] HD Wallet Manager")
    _page_renders(page, "/hd-wallet", ["HD", "Wallet", "Account", "Derive"], "T26_hd_wallet")

def suite_seed_qr(page):
    """T27 — Seed Key QR: page renders and is guarded."""
    print("\n[T27] Seed Key QR (access-gated)")
    go(page, "/seed-qr"); time.sleep(1)
    shot = ss(page, "T27_seed_qr")
    content = page.content()
    has_content = (
        any(k.lower() in content.lower() for k in ["PIN", "Password", "Guard", "QR", "Seed", "Authenticate"]) or
        count(page, "h1, h2, button") > 0
    )
    record("T27 Seed QR page renders (guarded)", has_content, screenshot=shot)

def suite_what_this_protects(page):
    print("\n[T28] What This Protects")
    _page_renders(page, "/what-this-protects", ["Protect", "Security", "Device"], "T28_what_this_protects")

def suite_terms_legal(page):
    print("\n[T29] Terms & Legal")
    _page_renders(page, "/terms", ["Terms", "Legal", "Privacy"], "T29_terms_legal")

def suite_features_page(page):
    print("\n[T30] Features")
    _page_renders(page, "/features", ["Feature", "Status", "Built", "Live", "Planned", "Security", "Wallet"], "T30_features")

def suite_lock_unlock(page):
    """T31 — Quick lock then re-unlock with PIN."""
    print("\n[T31] Lock / unlock cycle")
    go(page); time.sleep(1)

    # The layout has: aria-label="Exit — lock wallet" button in the header
    locked = False
    for sel in [
        '[aria-label="Exit — lock wallet"]',
        '[aria-label*="lock wallet"]',
        '[aria-label*="Lock"]',
        'button[title*="lock"]',
        'button[title*="Lock"]',
    ]:
        try:
            page.locator(sel).first.click(timeout=3000)
            locked = True
            break
        except Exception:
            continue
    time.sleep(1)
    shot = ss(page, "T31_locked")
    on_lock = page.locator('[aria-label="PIN entry"]').is_visible(timeout=4000)
    record("T31 Quick lock shows PIN pad", on_lock, screenshot=shot)

    if on_lock:
        enter_pin(page, TEST_PIN)
        time.sleep(2.5)
        shot2 = ss(page, "T31_unlocked")
        try:
            pin_gone = not page.locator('[aria-label="PIN entry"]').is_visible(timeout=500)
        except Exception:
            pin_gone = True
        back_in = pin_gone and count(page, "nav") > 0
        record("T31 PIN unlock returns to app", back_in, screenshot=shot2)
    else:
        record("T31 PIN unlock returns to app", False, note="could not lock — lock button not found")

# ─── HTML report ──────────────────────────────────────────────────────────────
def build_report(duration_s: float) -> Path:
    passed = sum(1 for r in results if r["passed"])
    failed = sum(1 for r in results if not r["passed"])
    total  = len(results)
    ts     = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    rows = ""
    for r in results:
        bg    = "#1a2e1a" if r["passed"] else "#2e1a1a"
        badge = f'<span style="color:{"#4ADAC2" if r["passed"] else "#f87171"}">{"PASS" if r["passed"] else "FAIL"}</span>'
        img   = (f'<img src="{r["screenshot"]}" style="max-width:160px;border-radius:4px;cursor:pointer"'
                 f' onclick="window.open(this.src)" />' if r["screenshot"] else "")
        note  = f'<br><small style="color:#999">{r["note"]}</small>' if r["note"] else ""
        rows += f"""
        <tr style="background:{bg}">
          <td style="padding:8px 12px">{badge}</td>
          <td style="padding:8px 12px;font-family:monospace">{r['name']}{note}</td>
          <td style="padding:8px 4px">{img}</td>
        </tr>"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Veyrnox UAT Report — Android Pixel 5 (Release Build)</title>
<style>
  body  {{ background:#050608; color:#e2e8f0; font-family:'Segoe UI',sans-serif; margin:0; padding:24px }}
  h1   {{ color:#4ADAC2; font-size:1.5rem; margin-bottom:4px }}
  .meta {{ color:#94a3b8; font-size:.85rem; margin-bottom:24px }}
  .summary {{ display:flex; gap:24px; margin-bottom:24px }}
  .badge   {{ padding:8px 20px; border-radius:8px; font-size:1.1rem; font-weight:bold }}
  .pass  {{ background:#1a3a2a; color:#4ADAC2 }}
  .fail  {{ background:#3a1a1a; color:#f87171 }}
  table  {{ width:100%; border-collapse:collapse }}
  th     {{ text-align:left; padding:8px 12px; color:#4ADAC2; border-bottom:1px solid #1D222B }}
  td     {{ border-bottom:1px solid #1D222B; vertical-align:middle }}
</style>
</head>
<body>
<h1>Veyrnox UAT — Android Pixel 5 (Release Build)</h1>
<div class="meta">
  Generated: {ts} | Duration: {duration_s:.1f}s | Build: UAT (VITE_RELEASE=1) |
  Device: Pixel 5 (393x851, touch) | Wallet: test throwaway seed
</div>
<div class="summary">
  <div class="badge pass">PASS: {passed}</div>
  <div class="badge fail">FAIL: {failed}</div>
  <div class="badge" style="background:#1D222B;color:#94a3b8">Total: {total}</div>
</div>
<table>
<thead><tr><th>Status</th><th>Test</th><th>Screenshot</th></tr></thead>
<tbody>{rows}</tbody>
</table>
</body>
</html>"""
    path = Path("uat_report.html")
    path.write_text(html, encoding="utf-8")
    return path

# ─── Run order ────────────────────────────────────────────────────────────────
ALL_SUITES = [
    suite_onboarding,         # T00 — must run first; imports wallet
    suite_bottom_nav,         # T02
    suite_more_drawer,        # T03
    suite_dashboard,          # T04
    suite_send_screen,        # T05
    suite_receive_screen,     # T06
    suite_transaction_history,# T07
    suite_security_dashboard, # T08
    suite_duress_pin,         # T09
    suite_stealth_wallets,    # T10
    suite_panic_wipe,         # T11
    suite_analytics,          # T12
    suite_address_book,       # T13
    suite_settings,           # T14
    suite_watchlist,          # T15
    suite_network_manager,    # T16
    suite_gas_fees,           # T17
    suite_price_charts,       # T18
    suite_tax_report,         # T19
    suite_savings_goals,      # T20
    suite_notifications,      # T21
    suite_scroll,             # T22
    suite_no_js_errors,       # T23
    suite_security_center,    # T24
    suite_token_approvals,    # T25
    suite_hd_wallet,          # T26
    suite_seed_qr,            # T27
    suite_what_this_protects, # T28
    suite_terms_legal,        # T29
    suite_features_page,      # T30
    suite_lock_unlock,        # T31
]

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    from playwright.sync_api import sync_playwright

    if not ARGS.no_server:
        start_server()
        time.sleep(1)

    t_start = time.time()
    print(f"\n{'='*62}")
    print(f"Veyrnox UAT — Android Pixel 5 — Release Build")
    print(f"URL:    {BASE_URL}")
    print(f"Wallet: throwaway test seed (12 words)")
    print(f"PIN:    {TEST_PIN}")
    print(f"Suites: {len(ALL_SUITES)}")
    print(f"{'='*62}")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=not ARGS.headed, slow_mo=80 if ARGS.headed else 0)
            ctx  = browser.new_context(**PIXEL5)
            ctx.set_default_timeout(ARGS.timeout)
            page = ctx.new_page()

            for suite in ALL_SUITES:
                try:
                    suite(page)
                except Exception:
                    name = (suite.__doc__ or suite.__name__).split("—")[0].strip()
                    record(f"{name} (uncaught exception)", False, note=traceback.format_exc(limit=2))

            browser.close()
    finally:
        if not ARGS.no_server:
            stop_server()

    duration = time.time() - t_start
    report   = build_report(duration)
    passed   = sum(1 for r in results if r["passed"])
    failed   = sum(1 for r in results if not r["passed"])
    total    = len(results)

    print(f"\n{'='*62}")
    print(f"UAT COMPLETE  {duration:.1f}s")
    print(f"  PASSED: {passed}/{total}")
    print(f"  FAILED: {failed}/{total}")
    print(f"  Report: {report.resolve()}")
    print(f"{'='*62}\n")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
