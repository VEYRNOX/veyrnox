> **STATUS 2026-07-18:** 65 of 78 findings landed to `main` across 6 PRs — see the "Follow-up landing 2026-07-18" section at the bottom for the merge log and deferred-items list.

# ECC multi-lens audit — Veyrnox
**Date:** 2026-07-18 · **Type:** READ-ONLY audit report · **Scope:** whole app, user-facing surfaces (`src/pages/**`, `src/components/**`)
**Off-limits:** `src/wallet-core/**`, `src/rasp/**`, and other seed/signing/KEK/auth crypto (design lens does not apply).

## Skills applied

| Lens | Skills bundled |
|---|---|
| Visual system | design-system · liquid-glass-design · make-interfaces-feel-better · frontend-design-direction · design-taste-frontend (substituted for missing `taste`) |
| Motion | motion-foundations · motion-advanced (motion-patterns / motion-ui excluded per user) |
| Accessibility | frontend-a11y · accessibility |
| Flow / IA | click-path-audit · workspace-surface-audit · ui-demo |
| iOS icon | ios-icon-gen |

**Skipped:** `ui-to-vue` — Veyrnox is Vite + React, not Vue.

## Headline totals

| Lens | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|
| Visual system | 5 | 12 | 3 | 20 |
| Motion | 3 | 6 | 5 | 14 |
| Accessibility | 2 | 11 | 7 | 20 |
| Flow / IA | 3 | 12 | 5 | 20 |
| iOS icon | 1 | 1 | 2 | 4 |
| **Total** | **14** | **42** | **22** | **78** |

## Top themes (cross-lens)

1. **Second-accent leakage across ~15 files.** The "ONE teal accent" rule is broken by blue/purple/violet/orange/emerald/pink chrome — most costly on the Send preview brand pill (a signing-critical surface). Deniability-adjacent risk too: colour-coded state cues can become session tells.
2. **Async state changes are silent to screen readers.** RiskVerdictBanner (poison-address CAUTION/RISK sentence), RASP condition flips, SendCrypto error banners, and toasts either miss `aria-live` or use `polite` when `alert` is required. Users of assistive tech can proceed to sign without any signal.
3. **Motion ignores OS accessibility settings.** `Layout.jsx` (highest-traffic animation surface) never calls `useReducedMotion`; 87 raw Tailwind `animate-spin/pulse` uses lack `motion-safe:`; zero `visibilitychange` handlers — every `repeat: Infinity` keeps GPU active when backgrounded.
4. **Primary wallet actions misfiled or buried.** "Add wallet" (the app's primary noun) is 3–4 taps behind Security → HD Wallet Manager. Send is 4–6 taps vs. 2-tap benchmark. 80-item flat More drawer with no pins/recents.
5. **Two P1 deniability tells.** PersonalBackup export tab renders "Switch to your primary wallet" in decoy — a plain-English I3 violation. NotificationBell `unseenCount` may render a numeric cardinality tell.
6. **Design tokens are strong; surfaces ignore them.** Hardcoded `#RRGGBB` on Recharts, light-scheme classes (`bg-yellow-50`, `bg-blue-50`) rendering as bright boxes in the dark app, duplicated primary Button with literal hex.
7. **iOS icon P1 blocker for App Store.** Shipped `AppIcon-512@2x.png` has an alpha channel — App Store Connect rejects with `ITMS-90717`.

## Recommended P1 sequence (14 items, ordered by fix cost)

Cheap and high-value first:

1. **iOS icon alpha channel** — one command, unblocks App Store submit.
   `sips -s format png -s formatOptions normal AppIcon-512@2x.png` or `magick … -alpha remove`.
2. **PersonalBackup decoy tell (F1)** — replace "Switch to your primary wallet" with "Backup is temporarily unavailable." One-line copy fix, closes an I3 violation.
3. **Send preview violet+pink gradient pill** — swap `from-[#4ADAC2] via-[#A78BFA] to-[#F472B6]` for `bg-primary`. Two-file change on the highest-value surface.
4. **HiddenWalletUnlockSettings light-scheme classes** — replace `bg-yellow-50 / bg-blue-50 / text-yellow-800` with semantic tokens (`bg-caution/10`, `bg-info/10`). Renders as bright white boxes in the dark app today.
5. **RiskVerdictBanner missing `role="alert"`** — one-line wrap. Screen reader users currently get no signal when a poison-address sentence appears pre-sign.
6. **WalletConnect modal dialog semantics + focus trap** — larger job (two files). Convert `RequestApprovalModal` + `SessionProposalModal` to a dialog primitive with focus trap, Escape, focus restore. Keyboard users tab behind an active signing sheet today.
7. **QuickAccessGrid rainbow chrome** — collapse 7 hues to `text-primary bg-primary/10`; icon shape carries identity.
8. **Landing hero rainbow coin discs** — replace 3 pulsing color-family gradients with flat mono glyphs.
9. **NetworkManager `logo_color` chrome usage** — reserve chain-brand hex for the coin glyph interior, not tile chrome.
10. **Reveal Seed tile decoy guard verification** — confirm `/wallet-seed-qr` fails-closed on decoy/hidden; also verify Settings tile renders identically in decoy.
11. **Add wallet promoted out of Security** — move `HD Wallet Manager` → `Wallets` in Wallet nav group; add `+` affordance on AccountHeader.
12. **Layout.jsx `useReducedMotion` + `visibilitychange`** — one file, unblocks all downstream motion P2s.
13. **Repo-wide `animate-spin/pulse` → `motion-safe:animate-…`** — sed sweep + `pretest` lint rule to prevent regression.
14. **Fan out infinite-animation `visibilitychange` gating** — RiskShield, Skeleton, SuccessBeacon, VaultIllustration, WalletEntry aurora blobs. Best done as one shared `useInfiniteAnimation` hook.

---

# 1. Visual system findings

Scope: `src/pages/**/*.jsx`, `src/components/**/*.jsx` audited against `src/index.css` (one teal accent `--primary` 170/66/57 + semantic `caution/risk/info/success`; Schibsted Grotesk prose + IBM Plex Mono for verifiable values). Baseline token file is strong and internally coherent — findings are surfaces that ignore or contradict it.

## P1

### V-P1-1 Light-mode utility classes hardcoded into a dark-only app
- **File:** [src/components/security/HiddenWalletUnlockSettings.jsx:146](src/components/security/HiddenWalletUnlockSettings.jsx:146),[:189](src/components/security/HiddenWalletUnlockSettings.jsx:189)
- **Lens:** design-system
- **Issue:** Uses raw `bg-yellow-50 border-yellow-200 text-yellow-800` and `bg-blue-50 border-blue-200 text-blue-900` — light-scheme Tailwind palette that renders as near-white boxes in a `.dark` app.
- **Action:** Replace with `bg-caution/10 border-caution/30 text-caution` and `bg-info/10 border-info/30 text-info`.

### V-P1-2 QuickAccessGrid introduces six decorative color families for tile chrome
- **File:** [src/components/QuickAccessGrid.jsx:17-23](src/components/QuickAccessGrid.jsx:17)
- **Lens:** design-system · frontend-design-direction
- **Issue:** Every tile is a different hue (`blue/green/purple/yellow/cyan/indigo/primary`), contradicting "ONE teal accent" — a rainbow of hues on a security-tool dashboard.
- **Action:** Collapse to `text-primary bg-primary/10` (or `text-muted-foreground bg-secondary`); use icon shape/label for identity.

### V-P1-3 Landing hero coin tokens are hardcoded gradient candy
- **File:** [src/pages/LandingPage.jsx:153-155](src/pages/LandingPage.jsx:153)
- **Lens:** frontend-design-direction · design-system
- **Issue:** `from-orange-500 to-orange-600`, `from-blue-500 to-blue-600`, `from-green-500 to-green-600` with `animate-pulse text-white` — the "generic AI-generated hero" anti-pattern.
- **Action:** Render coins as flat mono glyphs in `text-muted-foreground` with a single teal-tinted focal shield.

### V-P1-4 Send preview brand pill uses a violet+pink gradient
- **File:** [src/pages/SendCrypto.jsx:1252](src/pages/SendCrypto.jsx:1252),[:1264](src/pages/SendCrypto.jsx:1264)
- **Lens:** design-system
- **Issue:** `from-[#4ADAC2] via-[#A78BFA] to-[#F472B6]` on a signing-critical screen — exact violet+pink candy the ONE-teal rule prohibits, on the surface where visual calm matters most.
- **Action:** Replace with solid `bg-primary` (or `bg-primary/20 border-primary/40`).

### V-P1-5 NetworkManager `logo_color` seed data ships as raw hex
- **File:** [src/pages/NetworkManager.jsx:15-21](src/pages/NetworkManager.jsx:15),[:28](src/pages/NetworkManager.jsx:28),[:44](src/pages/NetworkManager.jsx:44)
- **Lens:** design-system
- **Issue:** Chain-brand hex (`#627EEA`, `#F3BA2F`, `#8247E5`, …) used as UI accent (not just SVG logo fill), spraying eight extra hues into the network-picker chrome.
- **Action:** Route chain identity through `bg-secondary text-muted-foreground`, or reserve brand hex strictly for the coin-glyph interior of a `<CoinLogo/>`.

## P2

- **V-P2-1** Recharts fills hardcoded `#22c55e / #ef4444 / #f97316` — [PortfolioBenchmark.jsx:119-120](src/pages/PortfolioBenchmark.jsx:119), [PortfolioRewind.jsx:142](src/pages/PortfolioRewind.jsx:142), [PortfolioRiskScore.jsx:116](src/pages/PortfolioRiskScore.jsx:116). Swap to `hsl(var(--success))` / `hsl(var(--risk))` / `hsl(var(--caution))`.
- **V-P2-2** [AssetCorrelationTimeline.jsx:67-72](src/pages/AssetCorrelationTimeline.jsx:67) claims "no new accent colours" then defines `#A78BFA` + `#FB923C` inline. Honesty gap. Use `hsl(var(--primary))` / `hsl(var(--chart-2))` / `hsl(var(--chart-5))`; delete misleading comment.
- **V-P2-3** Chain-typed tile chrome across [MultiChainNFT.jsx:14-18](src/pages/MultiChainNFT.jsx:14), [NFTPortfolio.jsx:13](src/pages/NFTPortfolio.jsx:13), [SolanaTokens.jsx:60](src/pages/SolanaTokens.jsx:60), [SecurityScanner.jsx:83-84](src/pages/SecurityScanner.jsx:83). Use `bg-secondary text-muted-foreground` + `text-primary` for verified state.
- **V-P2-4** Ad-hoc status pills across [StealthWallets.jsx:730-731](src/pages/StealthWallets.jsx:730), [FraudDetection.jsx:137](src/pages/FraudDetection.jsx:137),[:343](src/pages/FraudDetection.jsx:343), [AdvancedAnalytics.jsx:103](src/pages/AdvancedAnalytics.jsx:103). Map hidden/decoy→caution, visible→success, critical→risk, info→info.
- **V-P2-5** [PortfolioChart.jsx:145](src/components/PortfolioChart.jsx:145) positive delta uses `bg-green-500/15 text-green-400` while negative uses `bg-destructive/…` — asymmetric. Positive → `bg-success/15 text-success`.
- **V-P2-6** [RecurringPayments.jsx:268](src/pages/RecurringPayments.jsx:268) reimplements primary Button with literal `bg-[#4ADAC2]`. Delete classes; use default `<Button>`.
- **V-P2-7** [ReferralTracker.jsx:20](src/pages/ReferralTracker.jsx:20),[:192](src/pages/ReferralTracker.jsx:192) introduces bronze/silver/gold via `text-amber-400 / text-slate-300 / text-yellow-400`. Express tiers via weight/size or caution token in graded opacities.
- **V-P2-8** [src/components/ui/toast.jsx:67](src/components/ui/toast.jsx:67) `group-[.destructive]` uses `text-red-300/50/400/600` — replace with `destructive-foreground` + `ring-destructive/60`.
- **V-P2-9** [Skeleton.jsx:29](src/components/Skeleton.jsx:29) shimmer uses `via-white/[0.06]` — invisible on light-theme white card. Use `via-foreground/5`.
- **V-P2-10** [WalletCard.jsx:11-17](src/components/WalletCard.jsx:11) per-coin gradient chrome (`SOL: from-purple-500/20`, `USDC: from-blue-500/20`, `USDT: from-emerald-500/20`). Use `from-primary/10 to-transparent` uniformly; coin glyph carries identity.
- **V-P2-11** [CryptoDetailPage.jsx:57](src/pages/CryptoDetailPage.jsx:57) uses literal `text-[#4ADAC2]`. Use `text-success` / `text-primary`.
- **V-P2-12** Recharts `fontSize: 10` inline prop escapes the mobile clamp — `PortfolioRewind.jsx:139-140`, `PortfolioBenchmark.jsx:115-116` and ~8 more. Bump to 12 or share a `CHART_TICK` constant.
- **V-P2-13** Concentric-radius drift: `rounded-lg` inside `rounded-xl` with `p-3` doesn't follow `outer = inner + padding`. Visible on QuickAccessGrid tile chips, Correlation/Send cards. Either bump inner to `rounded-lg` at `p-3` or drop outer to `rounded-lg`.

## P3

- **V-P3-1** `text-white` on non-teal token surfaces bypasses theme foreground — [CorrelationMatrix.jsx:21-26](src/pages/CorrelationMatrix.jsx:21), [LandingPage.jsx:153-155](src/pages/LandingPage.jsx:153). Use `text-{token}-foreground`.
- **V-P3-2** [VeyrnoxLogo.jsx:79](src/components/VeyrnoxLogo.jsx:79) monochrome text-clip gradient — keep, the only in-brand gradient inside the token system.
- **V-P3-3** `transition-all` used in ~22 files ([WalletCard.jsx:23](src/components/WalletCard.jsx:23), Layout.jsx ×3, 19 others). Replace with explicit property list (`transition-[transform,background-color,border-color,box-shadow]`).

---

# 2. Motion findings

Lens legend: **F** = motion-foundations, **A** = motion-advanced.

## P1

### M-P1-1 Route transitions ignore `prefers-reduced-motion`
- **File:** [src/components/Layout.jsx:369-374](src/components/Layout.jsx:369), [:411-416](src/components/Layout.jsx:411)
- **Lens:** F Rule 3
- **Issue:** `Layout.jsx` never imports `useReducedMotion` (grep-confirmed: 0 uses). Desktop + mobile route transitions unconditionally animate `x: 8→0` / `x: 20→0` with fixed `duration: 0.15/0.2 easeOut`. The single most-frequent animation surface in the app.
- **Fix:** Import `useReducedMotion`; when true, drop x-transform and cap to opacity fade ≤ 0.15s (or `duration: 0`).

### M-P1-2 Infinite animations never pause on tab hide — many files
- **Lens:** A Rule 2 (`repeat: Infinity` must pause on `document.visibilityState === "hidden"`)
- **Issue:** `grep -rn "visibilitychange" src/` returns zero hits. Every one of these keeps a JS RAF loop running in background tabs (and, on Capacitor mobile, when backgrounded):
  - [RiskShield.jsx:62](src/components/RiskShield.jsx:62),[:68](src/components/RiskShield.jsx:68) — dual pulsing rings
  - [Skeleton.jsx:32](src/components/Skeleton.jsx:32) — shimmer sweep
  - [SuccessBeacon.jsx:25](src/components/SuccessBeacon.jsx:25),[:53](src/components/SuccessBeacon.jsx:53),[:76](src/components/SuccessBeacon.jsx:76) — three infinite loops on tx-success screen
  - [VaultIllustration.jsx:51](src/components/VaultIllustration.jsx:51),[:55](src/components/VaultIllustration.jsx:55),[:61](src/components/VaultIllustration.jsx:61) — 24s + 18s rotate + breathing pulse
  - [WalletEntry.jsx:227](src/components/WalletEntry.jsx:227),[:269](src/components/WalletEntry.jsx:269),[:274](src/components/WalletEntry.jsx:274) — welcome-hero shimmer + two aurora blobs
- **Fix:** Shared `useInfiniteAnimation` hook that gates on `document.visibilitychange`.

### M-P1-3 Raw `animate-spin` / `animate-pulse` used without `motion-safe:` — 87 sites
- **Lens:** F Rule 3
- **Issue:** `grep -c "animate-(spin|pulse|bounce|ping)"` = 87 across 30+ files; almost none use the `motion-safe:` prefix. Tailwind's built-in keyframes do NOT auto-stop under `prefers-reduced-motion: reduce`. High-count offenders: [LandingPage.jsx:145-156](src/pages/LandingPage.jsx:145), [Dashboard.jsx:176](src/pages/Dashboard.jsx:176), [LiveBalances.jsx:123](src/pages/LiveBalances.jsx:123), [Calculator.jsx:264](src/pages/Calculator.jsx:264), [NFTPortfolio.jsx:75](src/pages/NFTPortfolio.jsx:75), all `BiometricAuth.jsx` spinner buttons.
- **Fix:** Repo-wide sed to `motion-safe:animate-*` + `pretest` lint rule. `WalletConnect.module.css:172` shows the correct pattern.

## P2

- **M-P2-1** Every animated component (17 files) imports from `framer-motion`, not `motion/react`. Skill's foundation is written against `motion/react`; `framer-motion` is the legacy alias. Single-shot migration + `no-restricted-imports` ESLint rule.
- **M-P2-2** No shared `motionTokens` / `springs` module exists. 6 durations, 3 easings, 6 spring configs inlined across the app. A designer changing "the smooth curve" needs 15+ edits. Add `src/lib/motion-tokens.js`.
- **M-P2-3** Duration inconsistency for same UX beat — [Layout.jsx:374](src/components/Layout.jsx:374) desktop `duration: 0.15`, [:416](src/components/Layout.jsx:416) mobile `duration: 0.2`, SendDone `0.34`, KEK gate `0.5`, SeedGrid `0.28`. Normalize to `motionTokens.duration.normal` (~0.35).
- **M-P2-4** [Dashboard.jsx:219-222](src/pages/Dashboard.jsx:219) 24h change chip springs in unconditionally without `useReducedMotion`.
- **M-P2-5** [WalletConnect.module.css:172-175](src/pages/WalletConnect.module.css:172) reduced-motion just slows spin to 1.6s instead of stopping it. Users with vestibular sensitivity still get rotation. Use `animation: none`.
- **M-P2-6** [NotificationBell.jsx:38-41](src/components/NotificationBell.jsx:38) uses 600ms `easeInOut` for a wiggle micro-interaction — reads wooden. Wiggle attention cues should be springs (overshoot + settle).

## P3

- **M-P3-1** [Skeleton.jsx:32](src/components/Skeleton.jsx:32) shimmer easing is `'linear'`. Shimmers should decelerate at ends — use `motionTokens.easing.smooth`.
- **M-P3-2** [WalletEntry.jsx:266-275](src/components/WalletEntry.jsx:266) 14s + 18s aurora blobs run 24/7 on pre-unlock screen. Gate on low-end detection + couple with P1-2 visibility fix.
- **M-P3-3** [SuccessBeacon.jsx:44-77](src/components/SuccessBeacon.jsx:44) stacks 3 infinite loops after check spring — noisy after ~5s. Consider bounded 3-cycle then decay.
- **M-P3-4** [Layout.jsx:411-416](src/components/Layout.jsx:411) mobile transition always slides `20 → 0 → -20` regardless of Back vs forward. Add `useNavigationDirection` hook.
- **M-P3-5** [RiskShield.jsx:62-68](src/components/RiskShield.jsx:62) two rings use same easing — read as one thick ring. Different easing on trailing ring for perceptual separation.

---

# 3. Accessibility findings

Focus: WCAG 2.2 AA + Capacitor/mobile. WalletCore/RASP files excluded per scope.

## P1

### A-P1-1 WalletConnect modals are not dialogs (WCAG 4.1.2, 2.4.3, 2.1.2)
- **File:** [RequestApprovalModal.jsx:101](src/components/walletconnect/RequestApprovalModal.jsx:101),[:193](src/components/walletconnect/RequestApprovalModal.jsx:193); [SessionProposalModal.jsx](src/components/walletconnect/SessionProposalModal.jsx)
- **Issue:** Both approval surfaces render as bare `<div><div>`:
  - No `role="dialog"` / `aria-modal="true"` — AT does not announce it or scope reading.
  - No `aria-labelledby` pointing at the title.
  - No initial focus move, no focus trap, no Escape-to-close, no restore-focus.
  - Keyboard users tab behind the modal into the page underneath while a signing request is live — **security-relevant a11y bug on a signing surface**.
  - No `inert`/`aria-hidden` on underlying app tree.
- **Fix:** Convert to a dialog primitive (Radix Dialog or `focus-trap-react`), move initial focus to primary action, trap Tab, handle Escape, restore focus on close.

### A-P1-2 Risk verdict banner not announced to screen readers (WCAG 4.1.3)
- **File:** [RiskVerdictBanner.jsx:56](src/components/RiskVerdictBanner.jsx:56) (CAUTION/RISK branch), [:38](src/components/RiskVerdictBanner.jsx:38) (pending branch)
- **Issue:** Banner appears asynchronously and can flip pending→CAUTION/RISK. No `role="alert"`, `role="status"`, or `aria-live`. Screen reader users get no signal that a poison-address sentence has appeared — they can proceed to Confirm & Send without knowing a warning was rendered.
- **Fix:** `role="alert"` for RISK; `role="status" aria-live="polite" aria-atomic="true"` for CAUTION/pending.

## P2

- **A-P2-1** [NotificationToast.jsx:49-58](src/components/NotificationToast.jsx:49) — `<div role="status" aria-live="polite">` with `onClick` dismiss but no keyboard handler, no `tabIndex`. `risk` toasts should be `role="alert"`. Auto-dismiss 4000ms risks WCAG 2.2.1. Replace `onClick` div with real `<button>`; branch role on level; pause on focus/hover.
- **A-P2-2** [SendCrypto.jsx:1472-1494](src/pages/SendCrypto.jsx:1472),[:1528-1547](src/pages/SendCrypto.jsx:1528),[:1553-1562](src/pages/SendCrypto.jsx:1553) — amount input has no `aria-invalid`, no `aria-describedby`; error `<p>` not id-linked, not `role="alert"`. Screen readers reading the field skip errors.
- **A-P2-3** [RaspSecurity.jsx:122-129](src/pages/RaspSecurity.jsx:122) — condition re-probes on foreground + 60s heartbeat; can flip clean → warn/block silently. Wrap condition row in `aria-live="polite" aria-atomic="true"`.
- **A-P2-4** [BiometricPrompt.jsx:35-71](src/components/security/BiometricPrompt.jsx:35) — has `role="dialog"` (good) but no focus move on mount, no Tab trap, no Escape, no focus restore. `animate-pulse` at :51 ignores `prefers-reduced-motion`.
- **A-P2-5** Placeholder-as-label on password / recovery inputs — [WalletEntry.jsx:1338](src/components/WalletEntry.jsx:1338),[:1606](src/components/WalletEntry.jsx:1606),[:1665](src/components/WalletEntry.jsx:1665). Add visible `<Label>` or `aria-label`.
- **A-P2-6** Settings danger-zone "Type DELETE" input has no label — [Settings.jsx:339-344](src/pages/Settings.jsx:339). Add `aria-label`.
- **A-P2-7** [SendCrypto.jsx:1500-1519](src/pages/SendCrypto.jsx:1500) insufficient-balance / "sending not enabled" banners not live regions. Give each `role="status"` (or `alert` for destructive).
- **A-P2-8** [SendCrypto.jsx:1403](src/pages/SendCrypto.jsx:1403) "Poison test address" inline button — anchor-styled `<button>` with underline-only affordance and no focus-visible ring. Add `focus-visible:ring-2 focus-visible:ring-primary`.
- **A-P2-9** [Settings.jsx:78-83](src/pages/Settings.jsx:78) loading spinner has no accessible name. Wrap in `<div role="status" aria-live="polite"><span className="sr-only">Loading settings…</span></div>`.
- **A-P2-10** [WalletEntry.jsx:216-229](src/components/WalletEntry.jsx:216) provisioning bar `aria-hidden` — consider `role="progressbar" aria-valuetext={currentStep}`.
- **A-P2-11** Motion without reduced-motion check — `BiometricPrompt.jsx:51` `animate-pulse`, `NotificationToast.jsx:56` `animate-in fade-in slide-in-from-bottom-2`. PinPad correctly uses `motion-reduce:` — replicate.

## P3

- **A-P3-1** [PinPad.jsx:180](src/components/security/PinPad.jsx:180) Submit is `tabIndex={-1}` (documented as intentional). Consider `tabIndex={0}` — Submit is not shoulder-surf sensitive.
- **A-P3-2** [RaspSecurity.jsx:126-128](src/pages/RaspSecurity.jsx:126) severity conveyed by colour dot + raw label. AT hears "rooted" with no weight. Prepend severity word ("High risk — rooted").
- **A-P3-3** [RiskVerdictBanner.jsx:73-81](src/components/RiskVerdictBanner.jsx:73) checkbox has no `aria-describedby` pointing at the verdict sentence above.
- **A-P3-4** [SendCrypto.jsx:1649-1665](src/pages/SendCrypto.jsx:1649) inline buttons at :1649 and :1671 — verify AT reads full name.
- **A-P3-5** [Settings.jsx:107](src/pages/Settings.jsx:107),[:128](src/pages/Settings.jsx:128),[:175](src/pages/Settings.jsx:175) Radix `<Switch>` default target ~24×24; verify shadcn config exceeds 44×44 on Capacitor.
- **A-P3-6** [WalletEntry.jsx:1449](src/components/WalletEntry.jsx:1449),[:1547](src/components/WalletEntry.jsx:1547),[:1661](src/components/WalletEntry.jsx:1661) — placeholder "word1 word2 …" for seed format; verify Windows high-contrast shows sufficient contrast.
- **A-P3-7** [Toaster](src/App.jsx) config — verify sonner error toasts fire with `aria-live="assertive"` and duration ≥ 6s.

---

# 4. Flow / IA findings

## Click-path table (from cold app open, mobile, vault unlocked)

| Primary task | Taps | Path |
|---|---|---|
| Send funds | 4–6 | bottom-nav Send → asset select → amount → recipient → Continue → 2FA |
| Receive / copy address | 2 | bottom-nav Receive → Copy |
| Backup seed (QR) | 3 + re-auth | More → Security → Seed Key QR |
| Backup seed (encrypted file) | 5–6 | More → Security → Personal Backup → password + PIN → Download |
| **Add wallet** | **3–4** | More → **Security(!)** → HD Wallet Manager → Add |
| Enroll hardware KEK | 5–6 | More → Settings → scroll → Hardware KEK card → enable → PIN + biometric |
| Disable duress PIN | 4 | More → Security → Duress PIN → Remove → confirm |
| WalletConnect approve | 5 | More → Connect → dApp Connector → paste URI → approve modal |

Anchor benchmark: Send is 2 taps in reference wallets. Add-wallet is buried under Security.

## P1

### F-P1-1 Deniability tell in PersonalBackup export tab
- **File:** [PersonalBackup.jsx:62-70](src/pages/PersonalBackup.jsx:62)
- **Lens:** click-path (dead path with disclosure)
- **Issue:** In decoy/hidden sessions, literal copy reads: "Backup only works in the main wallet. Switch to your primary wallet to back it up." Plain-English tell to a coercer that a primary wallet exists — I3 violation.
- **Action:** Replace with generic "Backup is temporarily unavailable" OR mirror the real flow end-to-end for the decoy vault (identical UX, decoy artifact returned).

### F-P1-2 "Reveal Seed" tile in Settings routes to `/wallet-seed-qr` with no explicit session guard visible at link site
- **File:** [Settings.jsx:283-289](src/pages/Settings.jsx:283)
- **Issue:** Decoy user tapping "Reveal Seed" must never see real seed. Verify destination fails-closed on `isDecoy`/`isHidden`; Settings tile itself should render identically in decoy so tap is not a probe.

### F-P1-3 "Add wallet" buried under Security → HD Wallet Manager
- **File:** [src/lib/navigation.js:75](src/lib/navigation.js:75)
- **Issue:** A wallet is the primary noun of a wallet app; three-tap access via a "Security" folder plus non-obvious label ("HD Wallet Manager") makes multi-wallet setup effectively hidden and misfiled.
- **Action:** Move to Wallet group as "Wallets", plus `+` affordance on `AccountHeader`.

## P2

- **F-P2-1** Naming duplication: "Hardware Wallets" (Trezor/Ledger, `/hardware-wallet`) vs "Hardware KEK" (Secure Enclave / StrongBox settings). Rename Settings row to "On-device hardware protection".
- **F-P2-2** Duplicate spam surfaces: `/spam-filter` and `/trust-score`. Merge or clarify (blocklist vs live score).
- **F-P2-3** 5 redirect entries in [App.jsx:176-180](src/App.jsx:176) (`/history`, `/transaction-history`, `/hardware-wallets`, `/security-center`, `/address-screening`) — symptom of nav/copy divergence.
- **F-P2-4** 80-item flat "More" drawer at [Layout.jsx:508-547](src/components/Layout.jsx:508) — no pinning, no recents. Pin top 6 recents; hoist Duress/Backup to top.
- **F-P2-5** [Settings.jsx:42-59](src/pages/Settings.jsx:42) "Delete account" — legacy hosted-account language on a local build. Rename to "Clear local cache" or remove; disambiguate from Panic Wipe.
- **F-P2-6** [Layout.jsx:357](src/components/Layout.jsx:357) mobile Exit icon adjacent to Settings gear (identical size/colour) commits `lock()` after 380ms with no confirm. Easy mis-tap during mid-Send. Long-press or peek-menu confirm.
- **F-P2-7** Command palette (⌘K) is desktop-first — [Layout.jsx:167-176](src/components/Layout.jsx:167). Surface search as fixed pill on Home for mobile.
- **F-P2-8** Empty/loading/error states inconsistent across ~40 pages (AddressBook, AdvancedAnalytics, AuditLog, BudgetLimits, ColdSign, CorrelationMatrix, CryptoSigning, CustomDashboardWidgets, DAppSecurityAlerts, Documentation, Features, GasFeeControl, HardwareWalletPage, LiveBalances, +26 more). Enforce a triad via shared `<PageState>` component.
- **F-P2-9** [Layout.jsx:327-346](src/components/Layout.jsx:327) `navigate(-1)` collapses deep-link entry (notification, share) to `/`. Add parent-route fallback map.
- **F-P2-10** [DuressPin.jsx:571-576](src/pages/DuressPin.jsx:571) still ships a DEMO oracle block that prints the real wallet address. Gated inside `DEMO` so DCE should strip in prod — **verify build output actually removes it**.
- **F-P2-11** [Layout.jsx:334-338](src/components/Layout.jsx:334) `fromMore` state on More-tile navigation only works when history matches; deep link / state-restored won't carry it. Add explicit `fromMore` fallback map.
- **F-P2-12** [Layout.jsx:296](src/components/Layout.jsx:296) "Sign Out" (desktop) vs [:357](src/components/Layout.jsx:357) "Exit — lock wallet" (mobile) — same action, different names. Standardise to "Lock".

## P3

- **F-P3-1** Inconsistent spinners: `TabSpinner`, ad-hoc `border-2`, lucide `Loader2`. Standardise on one primitive.
- **F-P3-2** [Layout.jsx:271](src/components/Layout.jsx:271) "Preferences" is a bare label, not a collapsible group. Fold into Preferences group or drop header.
- **F-P3-3** No first-run tour. 80 features, no walkthrough. Users won't find Duress, Stealth, Panic Wipe, KEK.
- **F-P3-4** [Layout.jsx:198](src/components/Layout.jsx:198),[:352](src/components/Layout.jsx:352) NotificationBell `unseenCount` — verify always renders as dot (not number) in decoy to avoid plural/cardinality tell.
- **F-P3-5** [App.jsx:216](src/App.jsx:216) `/onboarding → /` redirect — legacy base44 route. Prune.

---

# 5. iOS icon findings

Scope: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`, `public/veyrnox-icon.svg`, `capacitor.config.json`.

**Icon set inventory:**
- `Contents.json` — single-entry, `idiom: "universal"`, `platform: "ios"`, `size: "1024x1024"` (modern Xcode 14+ single-size format). Valid.
- `AppIcon-512@2x.png` — 1024×1024, **8-bit RGBA**, non-interlaced.
- No `dark`, `tinted`, or per-appearance variants.
- Brand master: `public/veyrnox-icon.svg` 512×512 hexagon + teal V on `#0B0F14`. No visible link between SVG and shipped PNG (drift risk).
- Capacitor config: `LocalNotifications.smallIcon` + `iconColor: "#4ADAC2"` only. Correct.

## Findings

### I-P1-1 Alpha channel on App Store icon
- **File:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
- **Issue:** RGBA. App Store Connect rejects app icons with an alpha channel (`ITMS-90717: Invalid App Store Icon`).
- **Action:** `sips -s format png -s formatOptions normal AppIcon-512@2x.png` or `magick convert AppIcon-512@2x.png -background '#0B0F14' -alpha remove -alpha off AppIcon-512@2x.png`.

### I-P2-1 No dark / tinted variants (iOS 18+)
- **Issue:** `Contents.json` declares only default appearance. iOS 18 renders a monochrome-tinted fallback from the default icon, which typically looks muddy for gradient marks.
- **Action:** Add `dark` and `tinted` entries + two extra 1024×1024 PNGs.

### I-P3-1 No build pipeline from master SVG to shipped PNG
- **Issue:** `public/veyrnox-icon.svg` is the apparent master, but 1024 PNG is a one-off hand export with no `scripts/` or npm target that regenerates it. Any brand tweak drifts silently.
- **Action:** Add npm script (`sharp` / `resvg` / `rsvg-convert`) that renders SVG → PNG variants.

### I-P3-2 Master SVG uses gradient strokes + thin V
- **Issue:** 42px-stroke V at 512-source scales to ~10-12px at Settings/Spotlight sizes (76/58/40pt). Should be legible (single glyph, high contrast) but not tested.
- **Action:** Eyeball in Xcode simulator at Home / Spotlight / Settings sizes; widen V stroke if it disappears at 40pt.

---

## Provenance

- **Type:** INTERNAL AI multi-agent audit — read-only, code inspection only.
- **Not:** an independent third-party audit (Veyrnox still has one outstanding — this report doesn't substitute).
- **Method:** 5 parallel `general-purpose` agents, each loading the relevant `SKILL.md` files from `~/.claude/plugins/marketplaces/ecc/skills/` and grepping/reading `src/pages/**` + `src/components/**`. Wallet-core / RASP / signing files were excluded from every agent's scope per the design-lens rule.
- **What was NOT tested:** on-device rendering, real screen-reader traversal, live keyboard flow through modals, on-device motion perception, or App Store submission of the icon. Every finding is a static-analysis observation; verify on device before treating any as closed.

---

## Follow-up landing 2026-07-18

65 of 78 findings landed to `main` across 6 PRs same day. 13 deferred (larger UX/nav restructuring or architectural refactors), 2 verification-only confirmed sound without code change.

### PR log

| PR | Merge commit | Batch | Count |
|---|---|---|---|
| [#1144](https://github.com/aljobson/VEYRNOX-CLONE-ECC/pull/1144) | `fc3dff28` | Visual system | 19 |
| [#1146](https://github.com/aljobson/VEYRNOX-CLONE-ECC/pull/1146) | `62899934` | Motion foundations | 13 |
| [#1147](https://github.com/aljobson/VEYRNOX-CLONE-ECC/pull/1147) | `0da53715` | Accessibility | 14 |
| [#1148](https://github.com/aljobson/VEYRNOX-CLONE-ECC/pull/1148) | `abb26ec5` | Flow / IA | 12 (+ 2 bundled a11y) |
| [#1149](https://github.com/aljobson/VEYRNOX-CLONE-ECC/pull/1149) | `1adddd07` | framer-motion → motion/react (M-P2-1) | 17 files |
| [#1150](https://github.com/aljobson/VEYRNOX-CLONE-ECC/pull/1150) | `a33f3df4` | iOS icon | 3 |

Per-PR user-facing detail: see [docs/Feature-Status.md](../Feature-Status.md) "2026-07-18 ECC multi-lens audit sweep" section and [CLAUDE.md](../../CLAUDE.md) "2026-07-18 ECC multi-lens audit sweep" section.

### Verified verification-only (2)

- **F-P1-2 Reveal Seed decoy guard** — architectural trace verified sound. `Settings.jsx:284` renders identically in every session (correct — a hidden tile is itself a probe); `revealWalletMnemonic` at `WalletProvider.jsx:1230-1242` reads whichever container the entered credential decrypted. Design correct per I3/I4.
- **F-P2-10 DuressPin DEMO block DCE** — verified via `npm run build:release`. Grepped `dist/` for 5 DEMO-only signatures — 0 hits each. Terser DCE's the block after `import.meta.env.VITE_RELEASE === "1"` folds `DEMO` to `false`. Belt-and-suspenders: `vite.config.js` refuses to build when both `VITE_RELEASE=1` and `VITE_DEMO_MODE=1` are set; `demoClient.js` throws at import time if a release build ever resolves `DEMO=true`.

### Deferred (13)

Larger UX/nav restructuring — F-P2-4 (More drawer pinning/recents), F-P2-7 (mobile ⌘K discoverability), F-P2-9 (`navigate(-1)` parent-route fallback map), F-P2-11 (`fromMore` state fallback map), F-P3-1 (spinner primitive standardisation across 22+ files), F-P3-2 (Preferences label group), F-P3-3 (first-run tour), PageState 40-page rollout (primitive at `src/components/PageState.jsx` created but not adopted broadly). Motion — M-P3-2 (WalletEntry low-end device gating), M-P3-4 (mobile route back-vs-forward direction awareness). Architectural a11y — A-P3-5 (Radix Switch primitive target size — affects every switch), A-P3-7 (sonner global error toast duration — needs 31-site wrapper), WC modal → full Radix Dialog refactor (kept `useModalA11y` hand-rolled per PR #1147 note). iOS — I-P3-2 (V-stroke thickness at 40pt — needs Xcode simulator eyeball).

INTERNAL AI-driven fix batches — not independently audited, not device-verified (except iOS icon RGB byte check on PR #1150).
