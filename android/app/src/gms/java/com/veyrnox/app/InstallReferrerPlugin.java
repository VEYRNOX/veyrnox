package com.veyrnox.app;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.atomic.AtomicBoolean;

// Play Install Referrer bridge (#2541). A referral share link opened without the
// app installed ends on a web page that can only carry the code into the store
// install by sending the user to Play with `&referrer=ref%3DVYX-XXXXXX`. Play
// hands that string back to the installed app here, locally, from the Play
// Store app on the device — no server call and no third-party SDK.
//
// gms source set only (google + samsung). huawei/fdroid have no Play Store, so
// the class does not exist there and MainActivity registers it reflectively.
// The JS side treats any rejection as "no referrer" (I4: it never blocks launch).
@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {

    @PluginMethod
    public void getReferrer(PluginCall call) {
        InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
        AtomicBoolean settled = new AtomicBoolean(false);
        try {
            client.startConnection(new InstallReferrerStateListener() {
                @Override
                public void onInstallReferrerSetupFinished(int responseCode) {
                    if (!settled.compareAndSet(false, true)) return;
                    try {
                        if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) {
                            call.reject("Install referrer unavailable", "INSTALL_REFERRER_UNAVAILABLE");
                            return;
                        }
                        JSObject ret = new JSObject();
                        ret.put("referrer", client.getInstallReferrer().getInstallReferrer());
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("Install referrer unavailable", "INSTALL_REFERRER_UNAVAILABLE");
                    } finally {
                        client.endConnection();
                    }
                }

                @Override
                public void onInstallReferrerServiceDisconnected() {
                    if (settled.compareAndSet(false, true)) {
                        call.reject("Install referrer service disconnected", "INSTALL_REFERRER_UNAVAILABLE");
                    }
                }
            });
        } catch (Exception e) {
            if (settled.compareAndSet(false, true)) {
                call.reject("Install referrer unavailable", "INSTALL_REFERRER_UNAVAILABLE");
            }
        }
    }
}
