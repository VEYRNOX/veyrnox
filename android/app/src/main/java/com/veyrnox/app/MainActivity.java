package com.veyrnox.app;

import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.veyrnox.app.FileSaverPlugin;
import com.veyrnox.app.HardwareKekPlugin;
import com.veyrnox.app.RaspIntegrityPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileSaverPlugin.class);
        registerPlugin(HardwareKekPlugin.class);
        registerPlugin(RaspIntegrityPlugin.class);
        super.onCreate(savedInstanceState);

        // FLAG_SECURE — block screenshots, screen recording, and the recents /
        // app-switcher thumbnail for the whole window. The wallet's threat model
        // includes a seized device, so sensitive screens (seed reveal/QR, balances,
        // decoy/duress) must not be capturable. Applied window-wide as the safer
        // default for a self-custody wallet.
        // TARGET: verify on a real device that this covers the Capacitor WebView and
        // the seed/decoy screens before treating this control as "done".
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Disable remote WebView debugging in release builds so an attacker with ADB
        // access cannot attach Chrome DevTools to read in-memory JS state or drive the
        // UI. Debug builds keep it on for development.
        // TARGET: verify on a REAL release build that CDP can no longer attach.
        if (!BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(false);
        }
    }
}
