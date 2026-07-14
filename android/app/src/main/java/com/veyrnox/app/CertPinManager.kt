package com.veyrnox.app

import okhttp3.CertificatePinner
import okhttp3.OkHttpClient

/**
 * CertPinManager — G2 Android certificate (SPKI) pinning.
 *
 * STATUS: BUILT-UNVALIDATED.
 *   This file is NOT compiled and NOT device-tested in this session. It is
 *   structurally complete but cannot be validated until (a) a real device build
 *   links it into the Capacitor/OkHttp stack and (b) Play Console registration
 *   supplies the production app-signing leaf cert SHA-256 (see
 *   PLACEHOLDER_PRODUCTION_CERT below). No "verified" claim is made here.
 *
 * WHAT THIS IS
 *   A pure helper that layers an OkHttp [CertificatePinner] on top of an
 *   existing [OkHttpClient]. It is BELT-AND-SUSPENDERS on top of the JS-layer
 *   host allowlist in `src/wallet-core/rpc/pinning.js` (SPKI_PINS) — the same
 *   host list and pin values are mirrored here so the native transport can
 *   enforce the SPKI that the browser JS engine cannot see.
 *
 * HONEST POSTURE (fail-OPEN for unknown hosts — deliberate, read this)
 *   Cert pinning is a defense-in-depth control, NOT the primary egress gate.
 *   The primary gate is the JS host allowlist, which fails CLOSED. This module
 *   fails OPEN: if [PINNED_HOSTS] is empty, or a request targets a host that is
 *   not in the map, [buildPinnedClient] returns the base client UNCHANGED. That
 *   is intentional — failing closed on every unknown host would break all RPC
 *   before the pins are actually configured (they are placeholders today).
 *   This is I4-honest: the control is present, labelled, and does not pretend
 *   to enforce a pin it does not yet hold.
 *
 * SPKI VALUES ARE PLACEHOLDERS
 *   Every pin below is a PLACEHOLDER copied from `rpc/pinning.js`. They MUST be
 *   replaced with real per-host SPKI sha256 hashes (captured and rotated on
 *   device) before any build can honestly claim active pinning. Until then this
 *   module is inert-by-placeholder: a placeholder pin will never match a real
 *   leaf, so pinning against a real host would fail closed at connect time —
 *   which is why WIRE-UP (below) is deferred until the real pins land.
 *
 * SCOPE / SAFETY
 *   Does NOT touch the JS bridge, wallet-core, keystore, or any signing path.
 *   Does NOT override OS hostname verification (a common cert-pin bypass
 *   mistake) — only a CertificatePinner is layered on.
 */
object CertPinManager {

    /**
     * PLACEHOLDER_PRODUCTION_CERT
     *
     * The production app-signing / leaf certificate pin is NOT known yet. Once
     * Play Console registration provides the production leaf cert SHA-256 (in
     * `sha256/<base64==>` SPKI form), add it to the relevant host entries below
     * (or a dedicated first-party host entry). Until this sentinel is replaced
     * with a real value, treat all pins here as inert placeholders.
     */
    private const val PLACEHOLDER_PRODUCTION_CERT =
        "sha256/PLACEHOLDER_PRODUCTION_CERT_REPLACE_AFTER_PLAY_CONSOLE_REGISTRATION="

    /**
     * PINNED_HOSTS — hostname -> list of SHA-256 SPKI pins ("sha256/base64==").
     *
     * Mirrors SPKI_PINS in `src/wallet-core/rpc/pinning.js`. All values are
     * PLACEHOLDERS (see class doc) and MUST be replaced with real captured pins
     * before enabling enforcement. Keep this map in lockstep with the JS map.
     */
    val PINNED_HOSTS: Map<String, List<String>> = mapOf(
        // ---- EVM (publicnode + chain defaults) ----
        "ethereum-sepolia-rpc.publicnode.com" to listOf("sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE="),
        "ethereum-rpc.publicnode.com" to listOf("sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE="),
        "rpc-amoy.polygon.technology" to listOf("sha256/PLACEHOLDER_POLYGON_REPLACE_ON_DEVICE="),
        "polygon-bor-rpc.publicnode.com" to listOf("sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE="),
        "sepolia-rollup.arbitrum.io" to listOf("sha256/PLACEHOLDER_ARBITRUM_REPLACE_ON_DEVICE="),
        "arbitrum-one-rpc.publicnode.com" to listOf("sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE="),
        "sepolia.optimism.io" to listOf("sha256/PLACEHOLDER_OPTIMISM_REPLACE_ON_DEVICE="),
        "optimism-rpc.publicnode.com" to listOf("sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE="),
        "avalanche-fuji-c-chain-rpc.publicnode.com" to listOf("sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE="),
        "avalanche-c-chain-rpc.publicnode.com" to listOf("sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE="),
        "bsc-testnet-rpc.publicnode.com" to listOf("sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE="),
        "bsc-rpc.publicnode.com" to listOf("sha256/PLACEHOLDER_PUBLICNODE_REPLACE_ON_DEVICE="),

        // ---- BTC (Esplora / mempool.space) ----
        "mempool.space" to listOf("sha256/PLACEHOLDER_MEMPOOL_REPLACE_ON_DEVICE="),

        // ---- SOL (Solana RPC defaults) ----
        "api.devnet.solana.com" to listOf("sha256/PLACEHOLDER_SOLANA_REPLACE_ON_DEVICE="),
        "api.testnet.solana.com" to listOf("sha256/PLACEHOLDER_SOLANA_REPLACE_ON_DEVICE="),
        "api.mainnet-beta.solana.com" to listOf("sha256/PLACEHOLDER_SOLANA_REPLACE_ON_DEVICE="),
    )

    /**
     * Build an [OkHttpClient] with a [CertificatePinner] applied for every host
     * in [PINNED_HOSTS].
     *
     * FAIL-OPEN on empty config: if [PINNED_HOSTS] is empty, the base client is
     * returned UNCHANGED (see class doc — pinning is belt-and-suspenders, not the
     * primary egress gate). Hosts absent from the map are simply not pinned by
     * OkHttp's CertificatePinner (its default behaviour), so they connect via the
     * base client's normal trust chain.
     *
     * Does NOT alter OS hostname verification — standard verification stays.
     *
     * @param base the existing OkHttpClient (e.g. the one Capacitor builds).
     * @return a new client with pinning, or [base] unchanged if nothing to pin.
     */
    fun buildPinnedClient(base: OkHttpClient): OkHttpClient {
        if (PINNED_HOSTS.isEmpty()) {
            return base
        }
        val builder = CertificatePinner.Builder()
        for ((host, pins) in PINNED_HOSTS) {
            for (pin in pins) {
                builder.add(host, pin)
            }
        }
        return base.newBuilder()
            .certificatePinner(builder.build())
            .build()
    }

    // ── WIRE-UP (TODO — do NOT implement until real pins land) ──────────────────
    //
    // This module is not yet wired into the app. Once Play Console registration
    // supplies the real production leaf cert SHA-256 and PINNED_HOSTS carries real
    // (non-PLACEHOLDER) pins, call buildPinnedClient() at the point where the
    // Capacitor/OkHttp client is constructed. Concretely:
    //
    //   * Capacitor's HTTP bridge builds its OkHttpClient internally. The clean
    //     integration point is a custom Capacitor plugin (or a Bridge/OkHttp
    //     interceptor hook) that wraps the client with:
    //         val pinned = CertPinManager.buildPinnedClient(baseClient)
    //     and hands `pinned` to the outbound request path.
    //   * Alternatively, if a dedicated first-party OkHttpClient is created in a
    //     native networking layer, wrap it there before first use.
    //
    // Do NOT modify MainActivity, RaspIntegrityPlugin, or any existing Kotlin
    // file to add this wiring blind — it needs a real-device build + on-device
    // verification + the outstanding independent audit first.
}
