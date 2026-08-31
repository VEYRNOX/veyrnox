package com.veyrnox.app;

import android.app.Activity;

/**
 * No-op twin of the GMS {@code FirebaseTestLabObservability}, wired into the
 * huawei and fdroid flavors.
 *
 * <p>Neither flavor declares a Firebase dependency — huawei replaces GMS with
 * HMS, and fdroid ships no proprietary dependencies at all. Firebase Test Lab
 * only ever runs the {@code googleFirebaseTest} variant, so there is nothing to
 * start here. This is an honest absence, not a stub standing in for a control:
 * no observability is claimed for these flavors anywhere.
 */
final class FirebaseTestLabObservability {
    private FirebaseTestLabObservability() {}

    static void start(Activity activity) {
        // Intentionally empty — no GMS on this flavor's classpath.
    }
}
