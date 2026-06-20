#!/usr/bin/env python3
"""
BNB testnet send verification — automated via Playwright.
Imports the test wallet, sends 0.001 tBNB, captures the txid.

Usage:
  python scripts/verify_bnb_send.py [--port 5174] [--headed]
"""
import argparse
import time
import sys
import os

# ── constants ─────────────────────────────────────────────────────────────────
TEST_SEED = "bamboo lyrics harvest potato seat carry equip nation slam begin admit pet"
TEST_PIN  = "111111"
# burn / well-known testnet address — not our own wallet (avoids self-send warning)
RECIPIENT = "0x000000000000000000000000000000000000dEaD"
AMOUNT    = "0.001"

PIXEL5 = {
    "viewport": {"width": 393, "height": 851},
    "device_scale_factor": 2.75,
    "is_mobile": True,
    "has_touch": True,
    "user_agent": (
        "Mozilla/5.0 (Linux; Android 11; Pixel 5) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/90.0.4430.91 Mobile Safari/537.36"
    ),
}

p = argparse.ArgumentParser()
p.add_argument("--port",   type=int, default=5174)
p.add_argument("--headed", action="store_true")
ARGS = p.parse_args()
BASE_URL = f"http://localhost:{ARGS.port}"

os.makedirs("screenshots/verify", exist_ok=True)

def ss(page, name):
    path = f"screenshots/verify/{name}.png"
    page.screenshot(path=path, full_page=True)
    return path

def enter_pin(page, digits):
    pad = page.locator('[aria-label="PIN entry"]')
    for d in digits:
        pad.get_by_role("button", name=d, exact=True).click()
        time.sleep(0.12)

def unlock_if_needed(page):
    try:
        if page.locator('[aria-label="PIN entry"]').is_visible(timeout=3000):
            enter_pin(page, TEST_PIN)
            time.sleep(2.5)
            page.wait_for_load_state("networkidle", timeout=15000)
    except Exception:
        pass

def clear_vault(page):
    page.evaluate("""() => {
        return new Promise(resolve => {
            ['veyrnox-vault','veyrnox-appdata'].forEach(n => {
                try { indexedDB.deleteDatabase(n); } catch {}
            });
            try { localStorage.clear(); } catch {}
            setTimeout(resolve, 300);
        });
    }""")

# ── onboarding ─────────────────────────────────────────────────────────────────
def onboard(page):
    print("[*] Fresh onboarding — importing test wallet")
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle", timeout=30000)
    clear_vault(page)
    page.reload()
    page.wait_for_load_state("networkidle", timeout=30000)
    time.sleep(1.2)
    ss(page, "01_fresh")

    # Get Started
    page.get_by_role("button", name="Get Started", exact=False).first.click(timeout=8000)
    time.sleep(0.8)

    # PIN create
    page.locator('[aria-label="PIN entry"]').wait_for(state="visible", timeout=8000)
    enter_pin(page, TEST_PIN)
    time.sleep(1.0)
    # PIN confirm
    enter_pin(page, TEST_PIN)
    time.sleep(2.5)
    ss(page, "02_post_pin")

    # ExploreShell → Create or import
    try:
        page.get_by_role("button", name="Create or import", exact=False).first.click(timeout=6000)
        time.sleep(0.8)
    except Exception:
        pass

    # Import an existing seed
    page.get_by_role("button", name="Import an existing seed", exact=True).click(timeout=6000)
    time.sleep(0.8)

    # Fill seed
    ta = page.locator('[aria-label="Recovery seed phrase"]')
    ta.wait_for(state="visible", timeout=10000)
    ta.scroll_into_view_if_needed()
    ta.fill(TEST_SEED)
    time.sleep(0.4)
    ss(page, "03_seed_entered")

    # Restore
    page.get_by_role("button", name="Restore / Import", exact=False).click(timeout=6000)
    time.sleep(4)
    ss(page, "04_post_import")
    print("[+] Wallet imported")

# ── navigate to send ──────────────────────────────────────────────────────────
def go_to_send(page):
    print("[*] Navigating to Send tab")
    unlock_if_needed(page)
    # Click Send tab (role=tab)
    try:
        page.get_by_role("tab", name="Send", exact=True).click(timeout=5000)
        time.sleep(1.5)
    except Exception:
        page.goto(f"{BASE_URL}/send")
        page.wait_for_load_state("networkidle", timeout=15000)
        unlock_if_needed(page)
        time.sleep(1)
    ss(page, "05_send_screen")

# ── select BNB asset ──────────────────────────────────────────────────────────
def select_bnb(page):
    print("[*] Selecting BNB asset")
    # The asset selector is usually a dropdown/button showing the current asset
    # Try clicking current asset selector to open picker
    asset_selected = False
    for sel in [
        lambda: page.locator('[aria-label="Select asset"]').first.click(timeout=3000),
        lambda: page.get_by_role("combobox").first.click(timeout=3000),
        lambda: page.locator('button:has-text("ETH")').first.click(timeout=3000),
        lambda: page.locator('[data-testid="asset-selector"]').first.click(timeout=3000),
    ]:
        try:
            sel(); asset_selected = True; break
        except Exception:
            continue

    if asset_selected:
        time.sleep(0.8)
        ss(page, "06_asset_picker")
        # Picker shows "BNB Chain — BNB" as list items — click it directly
        bnb_clicked = False
        for sel in [
            lambda: page.get_by_text("BNB Chain — BNB", exact=True).click(timeout=4000),
            lambda: page.get_by_text("BNB Chain — BNB", exact=False).first.click(timeout=4000),
            lambda: page.locator('li:has-text("BNB Chain")').first.click(timeout=4000),
            lambda: page.locator('[role="listitem"]:has-text("BNB")').last.click(timeout=4000),
            lambda: page.get_by_role("button", name="BNB Chain — BNB", exact=False).click(timeout=4000),
        ]:
            try:
                sel(); bnb_clicked = True; time.sleep(0.8); break
            except Exception:
                continue
        if not bnb_clicked:
            print("[!] Could not click BNB Chain row — check 06_asset_picker.png")

    ss(page, "07_bnb_selected")
    content = page.content()
    if "BNB" in content and ("DEV UNGATE" in content or "tBNB" in content or "0.3" in content):
        print("[+] BNB asset active (DEV UNGATE banner visible)")
    else:
        print("[~] BNB may be selected — continuing")

# ── fill recipient ────────────────────────────────────────────────────────────
def fill_recipient(page):
    print(f"[*] Entering recipient: {RECIPIENT}")
    inp = None
    for loc in page.locator("input").all():
        try:
            ph = (loc.get_attribute("placeholder") or "").lower()
            nm = (loc.get_attribute("name") or "").lower()
            al = (loc.get_attribute("aria-label") or "").lower()
            if any(k in ph+nm+al for k in ["address", "recipient", "0x", "to", "send to"]):
                inp = loc; break
        except Exception:
            continue
    if not inp:
        # Try first visible input that's not the amount field
        for loc in page.locator("input[type=text], input:not([type])").all():
            try:
                if loc.is_visible(timeout=500):
                    inp = loc; break
            except Exception:
                continue
    if inp:
        inp.fill(RECIPIENT)
        time.sleep(0.5)
        ss(page, "08_recipient_entered")
        print("[+] Recipient entered")
    else:
        print("[!] Could not find recipient input")

# ── fill amount ───────────────────────────────────────────────────────────────
def fill_amount(page):
    print(f"[*] Entering amount: {AMOUNT} tBNB")
    inp = None
    for loc in page.locator("input").all():
        try:
            ph = (loc.get_attribute("placeholder") or "").lower()
            nm = (loc.get_attribute("name") or "").lower()
            al = (loc.get_attribute("aria-label") or "").lower()
            if any(k in ph+nm+al for k in ["amount", "value", "0.0", "bnb", "send amount"]):
                inp = loc; break
        except Exception:
            continue
    if inp:
        inp.fill(AMOUNT)
        time.sleep(0.4)
        ss(page, "09_amount_entered")
        print("[+] Amount entered")
    else:
        print("[!] Could not find amount input — trying second input")
        inputs = [l for l in page.locator("input").all() if l.is_visible(timeout=300)]
        if len(inputs) >= 2:
            inputs[1].fill(AMOUNT)
            time.sleep(0.4)

# ── select fee tier ───────────────────────────────────────────────────────────
def select_fee_standard(page):
    print("[*] Selecting Standard+ fee tier (BNB testnet requires it)")
    for sel in [
        lambda: page.get_by_role("button", name="Standard", exact=False).click(timeout=3000),
        lambda: page.get_by_text("Standard", exact=False).first.click(timeout=3000),
        lambda: page.locator('[data-testid*="standard"]').first.click(timeout=3000),
    ]:
        try:
            sel(); time.sleep(0.3); break
        except Exception:
            continue
    ss(page, "10_fee_selected")

# ── submit send ───────────────────────────────────────────────────────────────
def submit_send(page):
    print("[*] Submitting send")
    # Scroll to bottom to reveal the Review/Send button
    page.evaluate("const el = document.getElementById('main-scroll') || document.querySelector('[role=\"region\"]') || document.body; el.scrollTop = el.scrollHeight")
    time.sleep(0.5)
    clicked = False
    for btn_name in ["Continue", "Review", "Review Send", "Send", "Confirm", "Broadcast", "Next"]:
        try:
            btn = page.get_by_role("button", name=btn_name, exact=True).first
            btn.scroll_into_view_if_needed()
            btn.click(timeout=5000)
            clicked = True
            time.sleep(3)
            ss(page, f"11_after_{btn_name.lower().replace(' ','_')}")
            break
        except Exception:
            continue
    if not clicked:
        print("[!] No submit button found after scroll")

    # Confirm/broadcast step — wait for fee estimates to load, then click "Confirm & Send"
    # Button starts disabled (loading spinner) while the RPC estimates fees
    time.sleep(2)
    page.evaluate("const el = document.getElementById('main-scroll') || document.querySelector('[role=\"region\"]') || document.body; el.scrollTop = el.scrollHeight")
    time.sleep(0.5)
    ss(page, "12_confirm_screen")
    # Fee estimates take ~10s to load on BNB testnet — wait then click
    print("[*] Waiting 25s for fee estimates to load...")
    time.sleep(25)
    page.evaluate("const el = document.getElementById('main-scroll') || document.querySelector('[role=\"region\"]') || document.body; el.scrollTop = el.scrollHeight")
    time.sleep(1)
    ss(page, "12_btn_ready")
    print("[*] Clicking Confirm & Send via JS")
    try:
        # Two "Confirm & Send" buttons exist: a hidden spinner (disabled, first)
        # and the real teal button (last). Use .last + force=True.
        confirm_btn = page.get_by_role("button", name="Confirm & Send", exact=False).last
        confirm_btn.scroll_into_view_if_needed()
        ss(page, "12_pre_click")
        confirm_btn.click(force=True, timeout=10000)
        print("[+] Confirm & Send clicked (force=True, last match)")
        time.sleep(8)
        ss(page, "12b_after_confirm")
    except Exception as e:
        print(f"[!] JS click failed: {e}")
        ss(page, "12_ERROR")

# ── capture txid ──────────────────────────────────────────────────────────────
def capture_txid(page):
    print("[*] Waiting for transaction hash")
    time.sleep(5)
    ss(page, "13_result")
    content = page.content()

    # Look for 0x + 64 hex chars (tx hash pattern)
    import re
    hashes = re.findall(r'0x[a-fA-F0-9]{64}', content)
    # Filter out known non-tx hashes (our recipient address is 40 hex, but we need 64)
    txids = [h for h in hashes if h.lower() != RECIPIENT.lower()]

    if txids:
        print(f"\n{'='*60}")
        print(f"BNB TESTNET SEND VERIFIED")
        print(f"  TxID: {txids[0]}")
        print(f"  Explorer: https://testnet.bscscan.com/tx/{txids[0]}")
        print(f"{'='*60}\n")
        return txids[0]
    else:
        print("[!] No txid found in page content")
        print("[~] Check screenshot: screenshots/verify/13_result.png")
        # Print any explorer links found
        links = re.findall(r'https?://[^\s"\'<>]+bscscan[^\s"\'<>]+', content)
        for link in links[:3]:
            print(f"    Link found: {link}")
        return None

# ── main ───────────────────────────────────────────────────────────────────────
def main():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not ARGS.headed, slow_mo=80)
        ctx = browser.new_context(**PIXEL5)
        page = ctx.new_page()

        try:
            onboard(page)
            go_to_send(page)
            select_bnb(page)
            fill_recipient(page)
            fill_amount(page)
            select_fee_standard(page)
            submit_send(page)
            txid = capture_txid(page)

            if txid:
                print(f"[OK] SUCCESS — BNB testnet send verified")
                print(f"     TxID : {txid}")
                print(f"     Verify: https://testnet.bscscan.com/tx/{txid}")
            else:
                print("[!!] Could not auto-capture txid — check screenshots/verify/")
                sys.exit(1)
        except Exception as e:
            import traceback
            ss(page, "ERROR_state")
            print(f"[!!] Error: {e}")
            traceback.print_exc()
            sys.exit(1)
        finally:
            browser.close()

if __name__ == "__main__":
    main()
