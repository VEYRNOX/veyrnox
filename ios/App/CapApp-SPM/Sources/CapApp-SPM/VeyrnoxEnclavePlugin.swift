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

    @objc func isHardwareKeyAvailable(_ call: CAPPluginCall) {
        let capability = service.capability()
        call.resolve([
            "backing": capability.backing,
            "biometryEnrolled": capability.biometryEnrolled,
        ])
    }

    @objc func createWrappingKey(_ call: CAPPluginCall) {
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
