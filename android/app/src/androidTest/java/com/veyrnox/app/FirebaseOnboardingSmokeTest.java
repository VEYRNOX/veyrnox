package com.veyrnox.app;

import static androidx.test.platform.app.InstrumentationRegistry.getInstrumentation;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
@LargeTest
public class FirebaseOnboardingSmokeTest {
    private static final long APP_LAUNCH_TIMEOUT_MS = 30_000L;
    private static final long UI_TIMEOUT_MS = 20_000L;
    private static final String TARGET_PACKAGE = "com.veyrnox.app.firebase.testlab";
    private static final String PIN = "24681024";

    private UiDevice device;

    @Before
    public void launchFreshApp() {
        Context context = getInstrumentation().getTargetContext();
        assertEquals(TARGET_PACKAGE, context.getPackageName());

        device = UiDevice.getInstance(getInstrumentation());
        device.pressHome();

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(TARGET_PACKAGE);
        assertNotNull("No launch intent for " + TARGET_PACKAGE, launchIntent);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK);
        context.startActivity(launchIntent);

        assertTrue(
            "App did not reach foreground",
            device.wait(Until.hasObject(By.pkg(TARGET_PACKAGE).depth(0)), APP_LAUNCH_TIMEOUT_MS)
        );
    }

    @Test
    public void completesNewWalletPinOnboarding() {
        clickText("New wallet");

        enterPin(PIN);
        clickText("Submit PIN");

        enterPin(PIN);
        clickText("Submit PIN");

        waitForAnyText("Help improve Veyrnox", "Created.");
    }

    private void enterPin(String digits) {
        for (int i = 0; i < digits.length(); i++) {
            clickText(String.valueOf(digits.charAt(i)));
        }
    }

    private void clickText(String text) {
        UiObject2 object = device.wait(Until.findObject(By.text(text)), UI_TIMEOUT_MS);
        assertNotNull("Timed out waiting for text: " + text, object);
        object.click();
    }

    private void waitForAnyText(String... texts) {
        long deadline = System.currentTimeMillis() + UI_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            for (String text : texts) {
                if (device.hasObject(By.text(text))) {
                    return;
                }
            }
            device.waitForIdle();
        }
        assertTrue(
            "Timed out waiting for any expected post-onboarding text",
            false
        );
    }
}
