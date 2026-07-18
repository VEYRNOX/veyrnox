// VeyrnoxEnclavePlugin.swift — Capacitor bridge for the M2c Secure Enclave
// key-wrap plugin (F-2 closure scaffold).
//
// PROVISIONAL — NOT AUDITED-SECURE, NOT DEVICE-VERIFIED. Compiled into the app
// via the CapApp-SPM target and auto-registered by Capacitor through CAPBridged-
// Plugin conformance (no AppDelegate wiring needed). The JS side lives in
// src/plugins/veyrnoxEnclave.js and is only reachable behind the native branch
// of the keyStore, which itself is gated OFF by default in M2c-1.
// See docs/M2cd.native-acl-plan.md.

import Foundation
import Capacitor

@objc(VeyrnoxEnclavePlugin)
public class VeyrnoxEnclavePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VeyrnoxEnclavePlugin"
    public let jsName = "VeyrnoxEnclave"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isHardwareKeyAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createWrappingKey",      returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "wrap",                   returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unwrap",                 returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteWrappingKey",      returnType: CAPPluginReturnPromise),
    ]

    private let service = EnclaveKeyService()

    // #729 (M-5): the plugin is auto-registered by Capacitor, so its methods are
    // reachable from ANY in-page JS even though the M2c hardware-wrap path is gated
    // OFF. Fail closed at the native layer too — the key-minting / key-touching
    // methods (createWrappingKey/wrap/unwrap) reject with M2C_DISABLED while this is
    // false, so an injected script cannot mint an orphaned Secure Enclave key.
    //
    // MUST be flipped to true TOGETHER WITH M2C_HARDWARE_WRAP_ENABLED in
    // src/wallet-core/keystore/native.js (and M2C_ENABLED in
    // src/plugins/veyrnoxEnclave.js) once the Enclave path is device-verified —
    // keep all three in lockstep.
    private static let m2cEnabled = true

    // Codex second-pass 2026-07-17 P2-A: intent gate at native bridge closes the
    // auto-registered plugin's M-5 attack surface. The JS wrapper
    // (src/plugins/veyrnoxEnclave.js) already enforces the same allowlist, but
    // injected in-page JS can call Capacitor.Plugins.VeyrnoxEnclave.deleteWrappingKey()
    // directly and skip the JS layer entirely. Enforce the allowlist at the bridge
    // boundary too. Keep in lockstep with the JS _M2C_DELETE_INTENTS Set.
    // NOT DEVICE-VERIFIED (Windows dev box).
    private static let ALLOWED_DELETE_INTENTS: Set<String> = ["cleanup", "unenroll", "wipe"]

    // isHardwareKeyAvailable (read-only probe) is intentionally NOT gated.
    // deleteWrappingKey (cleanup — deleting a key cannot leak material, and
    // clearVault relies on it) is NOT gated on m2cEnabled, but IS gated on an
    // explicit allowlisted `intent` string (P2-A above).
    @objc func isHardwareKeyAvailable(_ call: CAPPluginCall) {
        let capability = service.capability()
        call.resolve([
            "backing": capability.backing,
            "biometryEnrolled": capability.biometryEnrolled,
        ])
    }

    @objc func createWrappingKey(_ call: CAPPluginCall) {
        if !Self.m2cEnabled {
            call.reject("M2c hardware wrap is disabled", "M2C_DISABLED")
            return
        }
        do {
            try service.createWrappingKey()
            call.resolve()
        } catch let error as EnclaveError {
            call.reject(error.message, error.code)
        } catch {
            call.reject(error.localizedDescription, "UNKNOWN")
        }
    }

    @objc func wrap(_ call: CAPPluginCall) {
        if !Self.m2cEnabled {
            call.reject("M2c hardware wrap is disabled", "M2C_DISABLED")
            return
        }
        guard let blob = call.getString("blob") else {
            call.reject("Missing 'blob' parameter", "INVALID_PARAM")
            return
        }
        do {
            let ciphertext = try service.wrap(blobB64: blob)
            call.resolve(["ciphertext": ciphertext])
        } catch let error as EnclaveError {
            call.reject(error.message, error.code)
        } catch {
            call.reject(error.localizedDescription, "UNKNOWN")
        }
    }

    @objc func unwrap(_ call: CAPPluginCall) {
        if !Self.m2cEnabled {
            call.reject("M2c hardware wrap is disabled", "M2C_DISABLED")
            return
        }
        guard let ciphertext = call.getString("ciphertext") else {
            call.reject("Missing 'ciphertext' parameter", "INVALID_PARAM")
            return
        }
        let reason = call.getString("reason") ?? "Unlock your VEYRNOX wallet"
        // unwrap presents the OS biometric prompt; run off the bridge thread.
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            do {
                let blob = try self.service.unwrap(ciphertextB64: ciphertext, reason: reason)
                call.resolve(["blob": blob])
            } catch let error as EnclaveError {
                call.reject(error.message, error.code)
            } catch {
                call.reject(error.localizedDescription, "UNKNOWN")
            }
        }
    }

    @objc func deleteWrappingKey(_ call: CAPPluginCall) {
        // P2-A: fail closed if the caller did not pass an allowlisted intent.
        // The keychain is NOT touched on rejection.
        guard let intent = call.getString("intent"),
              Self.ALLOWED_DELETE_INTENTS.contains(intent) else {
            call.reject(
                "deleteWrappingKey requires an explicit intent",
                "M2C_DELETE_INTENT_REQUIRED"
            )
            return
        }
        do {
            try service.deleteWrappingKey()
            call.resolve()
        } catch let error as EnclaveError {
            call.reject(error.message, error.code)
        } catch {
            call.reject(error.localizedDescription, "UNKNOWN")
        }
    }
}
