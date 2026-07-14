package com.veyrnox.app;

import android.app.AlertDialog;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.veyrnox.app.FileSaverPlugin;
import com.veyrnox.app.HardwareKekPlugin;
import com.veyrnox.app.RaspIntegrityPlugin;
import com.veyrnox.app.PlayIntegrityPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Pre-WebView RASP gate — must run before plugin registration and
        // super.onCreate() so the Capacitor bridge never initialises on
        // BLOCK-tier (hooked/tampered) devices. Calling super.onCreate(null)
        // in the blocked path satisfies the Activity lifecycle contract and
        // creates a window for the AlertDialog without loading any plugins.
        if (RaspIntegrityPlugin.Companion.earlyCheck(this)) {
            super.onCreate(null);
            showNativeBlockScreen();
            return;
        }

        registerPlugin(FileSaverPlugin.class);
        registerPlugin(HardwareKekPlugin.class);
        registerPlugin(RaspIntegrityPlugin.class);
        registerPlugin(PlayIntegrityPlugin.class);
        super.onCreate(savedInstanceState);

        // FLAG_SECURE — block screenshots, screen recording, and the recents /
        // app-switcher thumbnail for the whole window. The wallet's threat model
        // includes a seized device, so sensitive screens (seed reveal/QR, balances,
        // decoy/duress) must not be capturable. Applied window-wide as the safer
        // default for a self-custody wallet.
        // M13: DEVICE-VERIFIED (INTERNAL, 2026-07-14) — Samsung Galaxy Note 20 5G
        // SM-N981B, Android debug build. `adb exec-out screencap -p` returned 0 bytes
        // (OS refused capture entirely) with mScreenState=ON and mCurrentFocus=
        // com.veyrnox.app.debug/com.veyrnox.app.MainActivity — FLAG_SECURE propagates
        // to the Capacitor WebView surface. Verified via tests/android/specs/
        // flag-secure-screenshot-e2e.spec.js (manual adb path). INTERNAL.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // filterTouchesWhenObscured — refuse tap events on the Capacitor WebView when
        // another app's TYPE_APPLICATION_OVERLAY window is above it. Blocks overlay-
        // phishing attacks that draw a fake "Confirm" button over the real PIN pad or
        // Send button and harvest the tap. Called after super.onCreate() so the Bridge
        // and its WebView are already initialised.
        getBridge().getWebView().setFilterTouchesWhenObscured(true);

        // Disable remote WebView debugging in release builds so an attacker with ADB
        // access cannot attach Chrome DevTools to read in-memory JS state or drive the
        // UI. Debug builds keep it on for development.
        // TARGET: verify on a REAL release build that CDP can no longer attach.
        if (!BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(false);
        }
    }

    // showNativeBlockScreen — shown when earlyCheck() returns BLOCK-tier. Uses a
    // plain AlertDialog with no Capacitor dependency; the WebView was never loaded.
    // finishAffinity() closes the task stack so there is no way back into the app.
    private void showNativeBlockScreen() {
        new AlertDialog.Builder(this)
            .setTitle("Security Alert")
            .setMessage(
                "This device has been modified in a way that cannot be verified as safe. " +
                "Veyrnox cannot start to protect your assets."
            )
            .setCancelable(false)
            .setPositiveButton("Exit", (dialog, which) -> finishAffinity())
            .show();
    }
}
