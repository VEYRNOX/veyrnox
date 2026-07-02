package com.veyrnox.plugins.webauthn;

import android.content.Context;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.util.concurrent.Executor;

@CapacitorPlugin(name = "WebAuthnNative")
public class WebAuthnNativePlugin extends Plugin {

    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "veyrnox_webauthn_key";
    private static final int GCM_TAG_LENGTH = 128;

    @Override
    public void load() {
        // Initialize plugin
    }

    /**
     * Register a new WebAuthn credential using native biometric + Android Keystore
     */
    @PluginMethod
    public void registerCredential(PluginCall call) {
        try {
            String userId = call.getString("userId", "default");

            // Generate a new key in Android Keystore
            generateBiometricKey(userId);

            // Show biometric prompt to confirm enrollment
            showBiometricPrompt("Enroll biometric unlock", new BiometricCallback() {
                @Override
                public void onSuccess(BiometricPrompt.AuthenticationResult result) {
                    // Get the public key material
                    String credentialId = generateCredentialId(userId);

                    JSObject response = new JSObject();
                    response.put("credentialId", credentialId);
                    response.put("publicKey", getPubKeyFromKeystore(userId));
                    response.put("attestationObject", "attestation_placeholder");

                    call.resolve(response);
                }

                @Override
                public void onError(String error) {
                    call.reject("Biometric enrollment cancelled: " + error);
                }
            });
        } catch (Exception e) {
            call.reject("Registration failed: " + e.getMessage());
        }
    }

    /**
     * Authenticate with a registered WebAuthn credential
     */
    @PluginMethod
    public void authenticateCredential(PluginCall call) {
        try {
            String credentialId = call.getString("credentialId");

            showBiometricPrompt("Unlock with biometric", new BiometricCallback() {
                @Override
                public void onSuccess(BiometricPrompt.AuthenticationResult result) {
                    try {
                        // Sign a challenge with the biometric-protected key
                        String challenge = call.getString("challenge", "");
                        byte[] signature = signWithKey(credentialId, challenge.getBytes());

                        JSObject response = new JSObject();
                        response.put("clientDataJSON", Base64.encodeToString(challenge.getBytes(), Base64.NO_WRAP));
                        response.put("authenticatorData", "authenticator_data");
                        response.put("signature", Base64.encodeToString(signature, Base64.NO_WRAP));

                        call.resolve(response);
                    } catch (Exception e) {
                        call.reject("Authentication failed: " + e.getMessage());
                    }
                }

                @Override
                public void onError(String error) {
                    call.reject("Biometric authentication cancelled: " + error);
                }
            });
        } catch (Exception e) {
            call.reject("Auth error: " + e.getMessage());
        }
    }

    /**
     * Generate a biometric-protected key in Android Keystore
     */
    private void generateBiometricKey(String userId) throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);

        if (!keyStore.containsAlias(KEY_ALIAS + "_" + userId)) {
            KeyGenerator keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);

            keyGenerator.init(
                new KeyGenParameterSpec.Builder(
                    KEY_ALIAS + "_" + userId,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setUserAuthenticationRequired(true)
                    .setUserAuthenticationValidityDurationSeconds(300) // 5 min
                    .build());

            keyGenerator.generateKey();
        }
    }

    /**
     * Generate a unique credential ID
     */
    private String generateCredentialId(String userId) {
        return Base64.encodeToString(
            ("credential_" + userId + "_" + System.currentTimeMillis()).getBytes(),
            Base64.NO_WRAP);
    }

    /**
     * Get public key from keystore
     */
    private String getPubKeyFromKeystore(String userId) {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            SecretKey key = (SecretKey) keyStore.getKey(KEY_ALIAS + "_" + userId, null);

            if (key != null) {
                return Base64.encodeToString(key.getEncoded(), Base64.NO_WRAP);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return "";
    }

    /**
     * Sign data with the biometric-protected key
     */
    private byte[] signWithKey(String credentialId, byte[] data) throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);

        SecretKey key = (SecretKey) keyStore.getKey(KEY_ALIAS + "_default", null);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);

        return cipher.doFinal(data);
    }

    /**
     * Show biometric prompt to user
     */
    private void showBiometricPrompt(String title, BiometricCallback callback) {
        FragmentActivity activity = getActivity();

        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle("Confirm your fingerprint")
            .setNegativeButtonText("Cancel")
            .build();

        BiometricPrompt biometricPrompt = new BiometricPrompt(
            activity,
            new BiometricExecutor(),
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(
                        BiometricPrompt.AuthenticationResult result) {
                    super.onAuthenticationSucceeded(result);
                    callback.onSuccess(result);
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    super.onAuthenticationError(errorCode, errString);
                    callback.onError(errString.toString());
                }
            });

        biometricPrompt.authenticate(promptInfo);
    }

    private class BiometricExecutor implements Executor {
        @Override
        public void execute(Runnable command) {
            command.run();
        }
    }

    private interface BiometricCallback {
        void onSuccess(BiometricPrompt.AuthenticationResult result);
        void onError(String error);
    }
}
