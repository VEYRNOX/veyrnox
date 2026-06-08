# Spike: does WebAuthn PRF work in the Veyrnox Capacitor WebView?

**Status:** SPIKE (throwaway investigation). Gates the KEK build (`kek-architecture-spec.md` §8).
**Owner:** Al · **Executes in:** Claude Code session, named worktree.
**Framing:** PRE-AUDIT. This is a viability probe, not a feature — the output is an
**answer**, not merged production code.

---

## 1. Why this exists

The KEK design binds seed decryption to a hardware factor `H` produced by the
WebAuthn `prf` extension (or CTAP2 `hmac-secret`) — a stable high-entropy secret the
authenticator derives from a credential that never leaves the secure element. The
entire hardware half of the spec assumes that extension is reachable **from inside the
Capacitor WebView on the target Android device.**

That assumption is unverified. `prf` is well-supported in a clean Chrome/Android
browser context, but a Capacitor WebView is not a clean browser context — it may not
expose `navigator.credentials` with the `prf` extension at all, or may return it
unsupported. **If it's unreachable, the keying in spec §3 changes shape** (native
bridge required, with the boundary tradeoffs in §8). Building the combine before
knowing this risks building against a fiction.

This spike answers one question and stops. Do not let it grow into the KEK build.

---

## 2. The one question

> On the AVD Pixel_7 emulator **and** at least one physical Android device, from inside
> the Veyrnox Capacitor WebView, can we:
> (a) create a passkey with the `prf` extension, and
> (b) on a subsequent `get()`, receive **stable** `prf` output bytes for a fixed salt
>     (same salt in → same bytes out across calls and across app restarts)?

Stability is the property the KEK depends on — `H` must be reproducible or the seed
never decrypts twice. A one-off `prf` value that changes per call is useless here.

---

## 3. What to actually do

1. In a throwaway worktree, add a minimal probe screen (behind a dev flag, never
   shipped) that calls `navigator.credentials.create()` with a `publicKey` request
   carrying the `prf` extension, then `navigator.credentials.get()` requesting `prf`
   evaluation against a **fixed** salt.
2. Log: is `prf` reported supported? Are output bytes returned? Are they identical
   across two `get()` calls with the same salt? Identical after killing and relaunching
   the app?
3. Run on:
   - **AVD Pixel_7 emulator** (the current dev target — note its SwiftShader software-
     graphics constraint; record whether that affects credential APIs at all).
   - **At least one physical Android device** — the emulator's passkey/authenticator
     behaviour is not authoritative for real hardware, and the secure-element binding
     is the whole point.
4. If the WebView path fails or reports unsupported, do a **second** probe: the same
   FIDO2 call through a native bridge (Capacitor plugin) returning bytes across the
   JS boundary — just enough to establish *whether* the native path yields stable
   `prf`/`hmac-secret` output. Do not build the full bridge; establish viability only.

---

## 4. The three possible outcomes (and what each means for the spec)

| Outcome | Meaning for KEK spec |
|---|---|
| **A — WebView `prf` works, stable** | Best case. Spec §3 stands as written, crypto stays in audited JS. Proceed to KEK build. |
| **B — WebView fails, native bridge `prf`/`hmac-secret` works, stable** | Spec §3 keying is unchanged, but §8 native-bridge boundary becomes real: do KEK-combine + DEK-unwrap native-side, hand only decrypted-seed-or-nothing across. Adds audit line-item #6. Proceed, with that change. |
| **C — neither yields stable hardware-bound output** | The PRF approach is not viable on target. **Stop and redesign the hardware factor** — fall back to a StrongBox/Keystore-wrapped key as the hardware factor (the weaker Option B from the original design fork), or reconsider whether hardware-binding ships in v1 at all. Spec §3 changes materially. |

---

## 5. Boundaries (what this spike is NOT)

- Not the KEK build. No combine, no DEK layer, no PIN-path resolution.
- Not merged to main. Throwaway worktree; the probe screen never ships.
- Not a decision on §7 (non-enrolled PIN) — that's a parallel blocking decision, not
  part of this spike.
- Produces a **written answer** (A / B / C + logs) that updates `kek-architecture-spec.md`
  §8 from "open" to "resolved: outcome X."

---

## 6. Honest note on why this is the next action and the KEK build is not

Everything below §8 in the spec is gated on this. The KEK keying is the tempting,
buildable, delegatable thing — but building it against an unverified PRF assumption is
exactly the kind of motion that *feels* like progress while resting on a fiction. The
spike is cheap, answers the gate, and is the only thing that makes the KEK build safe
to start. It is also not, itself, a mainnet blocker — the audit and first-customer
conversations remain the real bottlenecks; this just keeps the KEK work from being
built twice.
