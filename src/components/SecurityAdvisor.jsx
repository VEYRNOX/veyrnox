// @ts-nocheck
// Security Advisor — AI chat panel powered by TIP's /api/v1/chat (SSE)
// with a local knowledge base fallback for offline/unreachable scenarios.
//
// I3: suppressed in deniability/demo — FAB hidden, no egress.
// I4: streaming errors fall back to local knowledge, never silently fail.
// P1: system prompt (server-side) refuses seeds/keys/PINs.

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router";
import { ShieldCheck, Send, X, Loader2, WifiOff, AlertTriangle, CheckCircle2, ShieldAlert as ShieldAlertIcon } from "lucide-react";
import { screenTransaction } from "@/api/tipScreen.js";
import { scrubSecrets } from "@/lib/advisorScrubber.js";
import { ZERO_FROM_ADDRESS } from "@/lib/tipZeroFrom.js";
import { lookupThreatSync, SEED_THREATS } from "@/lib/threatIntelStore";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession.js";
// 2026-08-16 audit remediation: hard-code the event name to avoid coupling
// the subscription to a mockable named export — existing test suites mock
// deniabilitySession.js without exporting this constant. The string here
// MUST match DENIABILITY_SESSION_CHANGED_EVENT in wallet-core/deniabilitySession.js.
const DENIABILITY_SESSION_CHANGED_EVENT = 'veyrnox:deniability-session-changed';
import { DEMO } from "@/api/demoClient";
import { getOrCreateDeviceId } from "@/lib/deviceId";
import {
  findLocalAnswer,
  buildAdvisorSystemContext,
  getFollowUpQuestions,
} from "@/lib/advisorKnowledge";
import {
  getAdvisorConsentState,
  hasAdvisorConsent,
  setAdvisorConsent,
} from "@/lib/advisorConsent";

const TIP_CONFIGURED = !!import.meta.env.VITE_TIP_BASE_URL;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
// Advisor now goes through the tip-chat Supabase Edge Function proxy.
//
// PR #48 (veyrnox-tip 57c9bed) made `/api/v1/chat` HMAC-required. A
// direct-from-browser call would either need to ship TIP_API_KEY +
// TIP_SIGNING_SECRET to every wallet build (I1 violation — credentials
// leave the device) or fail 401. tip-chat holds the secrets server-side
// and signs the outbound request; the wallet only needs the Supabase
// anon key to reach the proxy. Cloudflare Bot Fight Mode is no longer a
// concern because the proxy now presents valid HMAC headers, which CF
// treats as API traffic.
const TIP_CHAT_URL = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? `${String(SUPABASE_URL).replace(/\/$/, '')}/functions/v1/tip-chat`
  : null;
const SCREEN_MAP = {
  '/': 'dashboard',
  '/send': 'send',
  '/receive': 'receive',
  '/settings': 'settings',
  '/plans': 'subscription',
  '/security-dashboard': 'security',
  '/walletconnect': 'walletconnect',
  '/notifications': 'notifications',
  '/address-book': 'address_book',
  '/deniability': 'deniability',
  '/price-alerts': 'price_alerts',
  '/transaction-history': 'transaction_history',
};

function resolveScreen(pathname) {
  if (SCREEN_MAP[pathname]) return SCREEN_MAP[pathname];
  if (pathname.startsWith('/asset/')) return 'asset_detail';
  if (pathname.startsWith('/tx/')) return 'transaction_detail';
  return 'general';
}

const PAGE_CONTEXT = {
  dashboard: `The user is on the DASHBOARD — the main home screen after unlocking. It shows:
- Portfolio total balance across all chains (ETH, MATIC, ARB, OP, AVAX, BNB, BTC, SOL, USDC, USDT)
- Individual asset cards with balances and 24h price changes
- Quick-action buttons: Send, Receive, Buy
- Bottom navigation: Dashboard, Send, Receive, WalletConnect, More
The user may want to understand their portfolio, learn about supported assets, or get general security advice.`,

  send: `The user is on the SEND screen — preparing to send crypto. It shows:
- Asset selector (which token to send)
- Recipient address input field
- Amount input with USD conversion
- Fee tier selector (Slow/Standard/Fast with gas estimates)
- A "Verify" step that checks the recipient address against threat intelligence
- The transaction must be signed with PIN/biometrics before broadcast
Security is critical here: address poisoning, wrong address, wrong chain, excessive fees, and scam addresses are all risks. The advisor should proactively warn about verifying the recipient, double-checking the amount, and understanding gas fees.`,

  receive: `The user is on the RECEIVE screen — sharing their address to receive crypto. It shows:
- QR code of their wallet address
- Copyable address text
- Chain/asset selector
The user may worry about sharing their address publicly. Reassure them that public addresses are safe to share — they cannot be used to steal funds. Warn about address poisoning attacks and fake airdrop scams.`,

  settings: `The user is on the SETTINGS screen. Available options include:
- PIN management (change PIN, minimum 8 digits)
- Biometric authentication toggle
- Hardware key encryption (KEK) status and enrollment
- Backup/export seed phrase
- Privacy settings (telemetry consent toggle)
- Deniability mode setup
- About/version info
The advisor should help with security configuration, explain what each setting does, and guide best practices for PIN strength and backup.`,

  walletconnect: `The user is on the WALLETCONNECT screen — managing dApp connections. It shows:
- Active WalletConnect sessions with dApp names and URLs
- Option to connect new dApps via QR code or deep link
- Disconnect buttons for each session
- Session expiry information
The advisor should help the user understand what permissions dApps have, how to verify dApp legitimacy, the risks of token approvals, and when to disconnect sessions.`,

  deniability: `The user is on the DENIABILITY setup screen — configuring coercion resistance. Features:
- Duress PIN setup (a separate PIN that opens a decoy wallet)
- Stealth wallet configuration
- Panic wipe settings
- Demo mode for testing
This is Veyrnox's most distinctive security feature (requires Safety Plus subscription). The advisor should explain how deniability works, the difference between decoy and stealth wallets, what panic wipe does, and the I3 invariant (zero network calls in deniability mode).`,

  subscription: `The user is on the SAFETY PLUS subscription screen. It shows:
- Monthly ($5.99) and Annual ($49.99) plan options
- Feature comparison (free vs Safety Plus)
- Current subscription status
- Referral programme details
The advisor should explain what Safety Plus adds (deniability features, encrypted backup, advanced alerts) and reassure that core security and threat screening are free.`,

  security: `The user is on the SECURITY DASHBOARD — an overview of their security posture. It shows:
- RASP tamper detection status
- Hardware key encryption (KEK) status
- Vault encryption status
- Device integrity checks
- Per-category review items (not a numeric score — the dashboard never asserts "safe")
The advisor should explain each security layer, what the statuses mean, and how to improve their security posture.`,

  asset_detail: `The user is viewing a specific ASSET DETAIL page. It shows:
- Asset balance and price
- Price chart (24h/7d/30d/1y)
- Transaction history for this asset
- Send/Receive buttons for this asset
The advisor can help with understanding price movements, transaction history, and asset-specific security considerations.`,

  transaction_detail: `The user is viewing a specific TRANSACTION DETAIL page. It shows:
- Transaction hash, status, and timestamp
- From/to addresses
- Amount and fees paid
- Block confirmation count
- Link to block explorer
The advisor can help the user understand transaction details, confirmation times, and how to verify a transaction on-chain.`,

  notifications: `The user is on the NOTIFICATIONS screen — viewing security alerts and app notifications.
The advisor can help explain what different notification types mean and what actions to take.`,

  address_book: `The user is on the ADDRESS BOOK screen — managing saved recipient addresses.
The advisor should emphasise the importance of verifying addresses before saving, and warn about address poisoning.`,

  general: `The user is browsing the Veyrnox wallet app. Veyrnox is a self-custody, coercion-resistant crypto wallet supporting ETH, MATIC, ARB, OP, AVAX, BNB, BTC, SOL, USDC, and USDT. Key features: hardware-bound encryption (KEK), RASP tamper detection, deniability mode with duress PINs, vault with AES-256-GCM + Argon2id, and built-in threat intelligence screening.`,
};

const SUGGESTED_QUESTIONS_BY_SCREEN = {
  dashboard: [
    "How do I keep my wallet safe?",
    "What should I know about self-custody?",
    "What is a seed phrase?",
    "What happens if I lose my device?",
    "How do I back up my wallet?",
    "What makes Veyrnox different?",
    "What blockchains does Veyrnox support?",
    "How does deniability mode protect me?",
    "What are common crypto scams?",
    "What is hardware key encryption?",
    "What is RASP tamper detection?",
    "How does the vault protect my keys?",
  ],
  send: [
    "Is this address safe to send to?",
    "What should I check before signing?",
    "How do gas fees work?",
    "What is address poisoning?",
    "What are common crypto scams?",
    "How do I verify a recipient address?",
    "What is a token approval?",
    "Can a transaction be reversed?",
    "What happens if I send to the wrong address?",
    "How do I choose the right fee tier?",
  ],
  receive: [
    "Is it safe to share my address?",
    "What is address poisoning?",
    "How do I verify a sender?",
    "What should I know about receiving crypto?",
    "Can someone steal my funds with my public address?",
    "What are fake airdrop scams?",
    "Do I need the app open to receive?",
    "Can I use the same address for all chains?",
  ],
  settings: [
    "How do I set up a strong PIN?",
    "What does hardware key encryption do?",
    "How do I back up my wallet?",
    "What happens if I lose my device?",
    "What is RASP tamper detection?",
    "How does the vault protect my keys?",
    "Can I change my PIN?",
    "What is biometric authentication?",
    "How do I export my seed phrase?",
    "What data does Veyrnox collect?",
  ],
  walletconnect: [
    "How do I verify a dApp is legitimate?",
    "What permissions am I granting?",
    "What should I check before signing?",
    "Can a dApp drain my wallet?",
    "How do WalletConnect sessions work?",
    "What is a token approval and why is it risky?",
    "How do I disconnect a dApp?",
    "What does session expiry mean?",
    "What is typed data signing?",
    "How does Veyrnox protect me from malicious dApps?",
  ],
  deniability: [
    "How does deniability mode work?",
    "What is a duress PIN?",
    "Does deniability leave any traces?",
    "How do I set up stealth wallets?",
    "What is panic wipe?",
    "Can someone detect I have a hidden wallet?",
    "What happens after a panic wipe?",
    "How do I recover after a panic wipe?",
    "What is the difference between decoy and stealth?",
    "Does deniability mode make any network calls?",
  ],
  subscription: [
    "What is Safety Plus?",
    "Do I need Safety Plus to be secure?",
    "What extra features does Safety Plus include?",
    "How do I cancel my subscription?",
    "Is there a free trial?",
    "What is the referral programme?",
  ],
  security: [
    "What is RASP tamper detection?",
    "How does hardware key encryption work?",
    "How does the vault protect my keys?",
    "What does fail-closed mean?",
    "What security checks happen before signing?",
    "How does Veyrnox detect a rooted device?",
    "What is the threat intelligence platform?",
    "How are sanctions lists checked?",
  ],
  general: [
    "How do I keep my wallet safe?",
    "What are common crypto scams?",
    "How does deniability mode protect me?",
    "What should I check before signing?",
    "What is self-custody?",
    "What blockchains does Veyrnox support?",
    "What makes Veyrnox different?",
    "How do I back up my wallet?",
  ],
};

function getSuggestedQuestions(screen) {
  return SUGGESTED_QUESTIONS_BY_SCREEN[screen] || SUGGESTED_QUESTIONS_BY_SCREEN.general;
}

// Per-chain address regexes. Order-of-check matters: EVM's `0x…` pattern is
// unambiguous, so try that first. Bitcoin bech32 (`bc1…`) is next — it can't
// be confused with legacy BTC. Legacy BTC (`1…`/`3…`) then Solana overlap on
// Base58 alphabet: SOL addresses are 32–44 chars, legacy BTC 26–35, so we
// range-gate to disambiguate. The tuple order below IS the resolution order.
const CHAIN_ADDRESS_PATTERNS = [
  { chain: 'ethereum', re: /\b(0x[a-fA-F0-9]{40})\b/ },
  { chain: 'bitcoin',  re: /\b(bc1[a-z0-9]{39,59})\b/ },
  { chain: 'bitcoin',  re: /\b([13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/ },
  { chain: 'solana',   re: /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/ },
];

// Returns { address, chain } for the first pattern that matches, or null.
// Called once per user message; we do NOT try to extract multiple addresses
// from the same input — the UI screens one address at a time.
function extractAddress(text) {
  for (const { chain, re } of CHAIN_ADDRESS_PATTERNS) {
    const match = text.match(re);
    if (match) return { address: match[1], chain };
  }
  return null;
}

// Per-chain "empty from-address" is imported from src/lib/tipZeroFrom.js
// so SendCrypto can share it (Codex P1 2026-08-15 privacy fix).

function ScreeningVerdict({ result }) {
  if (!result) return null;

  // 'unknown' — TIP could not screen (all sources skipped/errored). Distinct
  // from 'warn': warn = we found signals; unknown = we found NOTHING because
  // we couldn't ask. I4 forbids collapsing this into a green tick.
  const isBlock = result.verdict === 'block';
  const isUnknown = result.verdict === 'unknown';
  const isWarn = result.verdict === 'warn' || result.verdict === 'error';
  const isClear = result.verdict === 'allow';

  const Icon = isBlock ? ShieldAlertIcon
             : (isUnknown || isWarn) ? AlertTriangle
             : CheckCircle2;
  const color = isBlock ? 'text-red-500'
              : (isUnknown || isWarn) ? 'text-amber-500'
              : 'text-emerald-500';
  const bg = isBlock ? 'bg-red-500/10 border-red-500/30'
           : (isUnknown || isWarn) ? 'bg-amber-500/10 border-amber-500/30'
           : 'bg-emerald-500/10 border-emerald-500/30';
  const label = isBlock ? 'BLOCKED'
              : isUnknown ? 'UNKNOWN'
              : isWarn ? 'CAUTION'
              : 'CLEAR';

  // Per-source trace: rendered even on a clean verdict so users can VERIFY
  // which sources actually answered. A CLEAR badge backed by zero live
  // sources reads as suspicious rather than reassuring.
  const sources = Array.isArray(result.sourcesConsulted) ? result.sourcesConsulted : [];

  return (
    <div className={`rounded-lg border p-3 text-xs ${bg}`} data-testid="tip-screening-verdict">
      <div className="flex items-center gap-2 font-semibold">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className={color}>Threat Screening: {label}</span>
      </div>

      {result.sanctions && (
        <p className="mt-1.5 font-medium text-red-400">
          Sanctions match detected — this address appears on a government sanctions list (e.g. OFAC SDN).
        </p>
      )}

      {/* Unknown-verdict copy is deliberately specific: it names what went
          wrong (no source could screen) and points to independent verification.
          Never phrased as safety. */}
      {isUnknown && (
        <p className="mt-1.5 font-medium text-amber-400">
          No threat source could screen this address. Verify independently
          before proceeding — check OFAC, OpenSanctions, or Chainalysis directly.
        </p>
      )}

      {result.risks.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {result.risks.map((r, i) => (
            <li key={i} className="text-foreground/80">
              <span className="font-medium">{r.title}</span>
              {r.detail && <span className="text-muted-foreground"> — {r.detail}</span>}
            </li>
          ))}
        </ul>
      )}

      {isClear && result.risks.length === 0 && (
        <p className="mt-1.5 text-muted-foreground">
          No hits from consulted sources. Address is not on any list this build screens against.
        </p>
      )}

      {/* Per-source verifiable trace. Absent sources tell the honest story:
          "OpenSanctions: not configured" reads very differently from
          "OpenSanctions: clean", and both differ from silence. */}
      {sources.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-muted-foreground/80 hover:text-muted-foreground">
            Sources consulted ({sources.length})
          </summary>
          <ul className="mt-1.5 space-y-0.5 text-[11px] font-mono">
            {sources.map((s, i) => {
              const statusColor = s.status === 'hit' ? 'text-red-400'
                                : s.status === 'clean' ? 'text-emerald-400'
                                : s.status === 'skipped' ? 'text-muted-foreground/70'
                                : 'text-amber-400';
              return (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-foreground/70">{s.source}</span>
                  <span className={statusColor}>
                    {s.status}
                    {s.latency_ms > 0 && <span className="text-muted-foreground/60"> ({s.latency_ms}ms)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground/60 italic">
        from threat intelligence screening
      </p>
    </div>
  );
}

export default function SecurityAdvisor({ walletChain }) {
  const location = useLocation();
  const currentScreen = resolveScreen(location.pathname);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [offline, setOffline] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  // Separate controller for the tipScreen call so it can be aborted
  // independently of the chat SSE stream. 2026-08-16 audit remediation.
  const screenAbortRef = useRef(null);

  // 2026-08-16 audit remediation: `hidden` derives from
  // isDeniabilityOrDemoActive() which was only re-evaluated on re-render —
  // a mid-flight deniability flip left the effect below asleep. Subscribe
  // to DENIABILITY_SESSION_CHANGED_EVENT and bump a tick so hidden is
  // recomputed the moment the session changes.
  const [, setDeniabilityTick] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onChange = () => setDeniabilityTick((t) => t + 1);
    window.addEventListener(DENIABILITY_SESSION_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(DENIABILITY_SESSION_CHANGED_EVENT, onChange);
  }, []);

  const hidden = isDeniabilityOrDemoActive() || DEMO;

  // I3 — kill any in-flight turn the moment the session becomes deniable.
  //
  // `if (hidden) return null` at the bottom of this component stops a
  // deniability session STARTING a request, and that is where I3 was assumed
  // to end. It is not: rendering null does not unmount the component, so
  // effects stay alive AND, more importantly, an already-open connection keeps
  // going. #1614 made the chat a direct SSE stream to the TIP Worker, so a
  // single turn can stay open for many seconds.
  //
  // abort() is otherwise only reachable from handleClose — the user manually
  // closing the drawer — which is exactly the thing that does not happen when
  // duress or panic is triggered. Mid-action is when someone flips modes, so
  // the in-flight case is the one that matters, not an edge.
  useEffect(() => {
    if (hidden) {
      abortRef.current?.abort();
      screenAbortRef.current?.abort();
    }
  }, [hidden]);

  // Plain unmount (navigating away) should not leave a stream running either.
  // Separate from the guard above because rendering null does NOT unmount, so
  // this one would never fire for the deniability case.
  useEffect(() => () => {
    abortRef.current?.abort();
    screenAbortRef.current?.abort();
  }, []);

  // M-5 — remote answers require an explicit, separate grant. Seeded from the
  // stored answer at mount so a device that has already decided is never
  // re-asked (the mistake PR #1409/#1410 had to fix for telemetry consent).
  const [advisorConsent, setAdvisorConsentState] = useState(() => getAdvisorConsentState());
  const chooseAdvisorConsent = useCallback((granted) => {
    setAdvisorConsent(granted);
    setAdvisorConsentState(granted ? 'granted' : 'denied');
  }, []);
  // Only ask when there is actually a remote endpoint to send to; an
  // unconfigured build is local-only anyway and a consent prompt there would be
  // asking permission for something that cannot happen.
  const needsAdvisorConsent = !!TIP_CHAT_URL && advisorConsent == null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  const answerLocally = useCallback((text, history) => {
    const localAnswer = findLocalAnswer(text);
    if (localAnswer) {
      setMessages([...history, { role: "assistant", content: localAnswer, local: true }]);
    } else {
      setMessages([...history, {
        role: "assistant",
        content: "I don't have a specific answer for that in my local knowledge base. Try rephrasing your question, or ask about topics like wallet security, sending safely, deniability mode, WalletConnect, or backing up your wallet.",
        local: true,
      }]);
    }
    setStreaming(false);
  }, []);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || streaming) return;

    const userMsg = { role: "user", content: text.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setStreaming(true);

    // Address extraction now returns both the address AND the chain inferred
    // from its format — so a BTC address in the prompt gets screened as BTC,
    // not as whatever chain the user happens to be viewing in walletChain.
    const detected = extractAddress(text);

    if (detected) {
      // Seed threat-intel FIRST — local, fast, works when tip-screen
      // returns unknown/error. A known-bad address must never be masked
      // by a remote "unavailable" verdict (I4: fail honest).
      const seedHits = lookupThreatSync(detected.address);
      let remoteResult = null;
      // Codex P1 2026-08-15: the consent prompt on this screen literally says
      // "Your addresses ... are never included" without an explicit grant, but
      // the remote address-lookup egress used to run BEFORE that gate. Skip
      // the remote call unless the user has affirmatively granted advisor
      // consent — local seed still fires either way, so a known-bad address
      // is still surfaced honestly. Matches the sendMessage gate at :553.
      if (TIP_CHAT_URL && hasAdvisorConsent()) {
        // 2026-08-16 audit remediation: wire an AbortController so a
        // mid-flight deniability flip cancels this screen call rather than
        // running to completion after the session has already been suppressed.
        const screenController = new AbortController();
        screenAbortRef.current = screenController;
        try {
          remoteResult = await screenTransaction({
            chain: detected.chain,
            actionType: 'address_lookup',
            from: ZERO_FROM_ADDRESS[detected.chain],
            to: detected.address,
          }, { signal: screenController.signal });
        } catch {
          // remote failed — seed still applies below
        } finally {
          if (screenAbortRef.current === screenController) screenAbortRef.current = null;
        }
      }

      // If seed knows this address, prefer it whenever remote is not a
      // stronger signal (remote 'block' wins over seed 'warn').
      if (seedHits && seedHits.length) {
        const top = seedHits[0];
        const seedVerdict = top.severity === 'critical' ? 'block' : 'warn';
        const remoteWins = remoteResult
          && remoteResult.verdict === 'block'
          && seedVerdict !== 'block';
        if (!remoteWins) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: "",
            screening: {
              verdict: seedVerdict,
              reason: `${top.note} (${top.category}) — source: ${top.source}`,
              source: 'local_seed',
              address: detected.address,
              chain: detected.chain,
              sourcesConsulted: [{ id: 'local_seed', ok: true }],
            },
          }]);
          setStreaming(false);
          return;
        }
      }

      if (remoteResult) {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: "",
          screening: remoteResult,
        }]);
        setStreaming(false);
        return;
      }
    }

    const assistantIdx = history.length;

    // M-5 — free text the user typed must NEVER reach the remote endpoint
    // without an explicit grant. Absent or denied consent is not a dead end:
    // the local knowledge base answers instead, exactly as it does when no
    // endpoint is configured. Checked here, at the one place egress happens,
    // rather than at the input or the drawer.
    if (!TIP_CHAT_URL || !hasAdvisorConsent()) {
      answerLocally(text, history);
      return;
    }

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(TIP_CHAT_URL, {
        method: "POST",
        // Supabase edge function requires apikey + bearer (anon). Auth on
        // the TIP Worker itself is handled inside the proxy via HMAC.
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: "chat",
          messages: [
            {
              role: "system",
              content: `You are Vigil, the Veyrnox Security Advisor — an expert security guide embedded in the Veyrnox self-custody crypto wallet. You give clear, actionable security advice tailored to what the user is doing right now.

Current page: ${currentScreen} (chain: ${walletChain || "evm"})
${PAGE_CONTEXT[currentScreen] || PAGE_CONTEXT.general}

Rules:
- Give expert advice specific to THIS page and what the user can see/do here
- Be concise but thorough — explain risks and how to mitigate them
- If the user asks about something on a different page, guide them there
- Never reveal seed phrases, private keys, or PINs
- If you don't know something, say so honestly

App knowledge:
${buildAdvisorSystemContext(currentScreen)}

Threat intelligence — the following addresses are KNOWN BAD. If the user mentions any of them (or any entity/exploit they name below), warn explicitly and recommend NEVER sending funds to them:
${SEED_THREATS.map(t => `- ${t.address} — ${t.note} (${t.category}, severity ${t.severity}, source ${t.source})`).join('\n')}

Additional public knowledge you should apply:
- Tornado Cash mixer contracts (e.g. 0x8589427373D6D84E98730D7795D8f6f8731FDA16, 0x722122dF12D4e14e13Ac3b6895a86e84145b6967, 0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b, 0xa160cdAB225685dA1d56aa342Ad8841c3b53f291) were added to the OFAC SDN List (Aug 2022). Note: the app ships a snapshot and cannot track delistings between builds (Tornado Cash was delisted 2025-03-21 per Van Loon v. Treasury, 5th Cir.); for a live verdict, direct the user to OFAC / OpenSanctions / Chainalysis.
- Lazarus Group (DPRK state-sponsored) OFAC-listed wallets — e.g. 0x098B716B8Aaf21512996dC57EB0615e2383E2f96, 0xa7e5d5A720f06526557c513402f2e6B5fA20b008.
- Drainer families (Inferno, Angel, Pink, Pussy, Monkey) impersonate legitimate dApps to steal funds via malicious approvals.`,
            },
            // Codex P1 2026-08-15: scrub each message before forwarding to
            // tip-chat. A system-prompt rule ("Never reveal seed phrases…")
            // is a hint to the MODEL; it is NOT a control against the SECRET
            // reaching the upstream over the wire. Client-side pattern match
            // for BIP-39 word runs, hex private keys, PIN-length digit
            // strings, and 4/8/16/24-word seeds; matches are replaced with
            // a fixed sentinel that also nudges the model to warn the user
            // that pasting secrets into the Advisor is unsafe.
            //
            // 2026-08-16 audit remediation: filter out any role that is not
            // 'user' or 'assistant'. The only legitimate system prompt is the
            // one authored above; any other role="system" reaching the wire
            // would be a client-supplied prompt-injection surface. The server
            // proxy also rejects, but defense-in-depth here.
            ...history
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({ role: m.role, content: scrubSecrets(m.content) })),
          ],
          context: {
            current_screen: currentScreen,
            wallet_chain: walletChain,
          },
          // Per-device Advisor cap on the TIP side (30 turns / 24h) is keyed
          // on device_id. Without it every wallet installation shares the
          // "anonymous" bucket globally — one user hits the cap for
          // everyone. Consent has already been checked above, so it is safe
          // to mint the persistent id here. Vault subscribers eventually
          // prefix this with "vault:" to bypass the cap (see companion PR).
          device_id: getOrCreateDeviceId() ?? undefined,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error("Chat request failed");

      setOffline(false);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            const token = parsed.response || parsed.choices?.[0]?.delta?.content || "";
            if (token) {
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIdx] = {
                  ...updated[assistantIdx],
                  content: updated[assistantIdx].content + token,
                };
                return updated;
              });
            }
          } catch {
            // malformed SSE chunk — skip
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        setStreaming(false);
        abortRef.current = null;
        return;
      }

      setOffline(true);
      // I4: fall back to local knowledge instead of showing an error
      const localAnswer = findLocalAnswer(text);
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = {
          role: "assistant",
          content: localAnswer
            || "I'm currently offline. Try asking about wallet security, sending safely, deniability mode, WalletConnect, or backing up your wallet.",
          local: true,
        };
        return updated;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [messages, streaming, currentScreen, walletChain, answerLocally]);

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleClose = () => {
    setOpen(false);
  };

  if (hidden) return null;

  return (
    <>
      {/* FAB — pulse animation draws attention to the advisor */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label="Open Vigil — Security Advisor"
      >
        <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20" />
        <ShieldCheck className="relative h-5 w-5" />
      </button>

      <Drawer open={open} onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          if (abortRef.current) abortRef.current.abort();
          setMessages([]);
          setInput("");
        }
      }}>
        <DrawerContent className="max-h-[95dvh] flex flex-col">
          <DrawerHeader className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <div>
                <DrawerTitle className="text-sm">Vigil</DrawerTitle>
                <p className="text-[10px] text-muted-foreground leading-tight">Security Advisor</p>
              </div>
              {offline && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-500">
                  <WifiOff className="h-2.5 w-2.5" />
                  offline
                </span>
              )}
            </div>
            <DrawerClose asChild>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </DrawerClose>
          </DrawerHeader>

          {/* M-5 — one-time disclosure before any typed question can leave the
              device. Deliberately NOT a blocking modal: declining keeps the
              advisor fully usable from the local knowledge base, so there is no
              pressure to accept just to get an answer. */}
          {needsAdvisorConsent && (
            <div
              className="mx-4 mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs"
              data-testid="advisor-remote-consent"
            >
              <p className="font-medium text-foreground">Answer questions online?</p>
              <p className="mt-1 text-muted-foreground">
                The advisor can send the questions you type — plus which screen you are on and
                which chain is selected — to Veyrnox&rsquo;s threat-intelligence service for a
                fuller answer. Your addresses, balances, seed and PIN are never included.
              </p>
              <p className="mt-1 text-muted-foreground">
                Decline and the advisor keeps working, answering from the guidance built into
                the app. You can change this later from the advisor.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => chooseAdvisorConsent(true)}
                  className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
                  data-testid="advisor-consent-allow"
                >
                  Allow online answers
                </button>
                <button
                  type="button"
                  onClick={() => chooseAdvisorConsent(false)}
                  className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground"
                  data-testid="advisor-consent-deny"
                >
                  Keep answers local
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3"
            style={{ minHeight: "300px", maxHeight: "calc(95dvh - 140px)" }}
          >
            {messages.length === 0 && (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-muted-foreground text-center">
                  Hi, I'm Vigil. Tap any question or type your own below.
                </p>
                <div className="flex flex-col gap-1.5">
                  {getSuggestedQuestions(currentScreen).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => sendMessage(q)}
                      className="w-full text-left rounded-xl border border-border bg-secondary/30 px-3.5 py-2.5 text-[11px] text-foreground/80 hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i}>
                <div
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : msg.screening ? "" : "bg-secondary/60 text-foreground rounded-bl-md"
                    }`}
                  >
                    {msg.screening ? (
                      <ScreeningVerdict result={msg.screening} />
                    ) : msg.content ? (
                      msg.content
                    ) : (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Thinking...
                      </span>
                    )}
                    {msg.local && msg.role === "assistant" && msg.content && !msg.screening && (
                      <p className="mt-1.5 text-[10px] text-muted-foreground/60 italic">
                        from local knowledge base
                      </p>
                    )}
                  </div>
                </div>
                {/* Follow-up suggestions after the last assistant message */}
                {msg.role === "assistant" && msg.content && !streaming && i === messages.length - 1 && (() => {
                  const asked = messages.filter(m => m.role === "user").map(m => m.content);
                  const followUps = getFollowUpQuestions(asked, currentScreen);
                  if (followUps.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5 mt-2 ms-1">
                      {followUps.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => sendMessage(q)}
                          className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Vigil anything..."
              disabled={streaming}
              className="flex-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="Send message"
            >
              {streaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </form>
        </DrawerContent>
      </Drawer>
    </>
  );
}
