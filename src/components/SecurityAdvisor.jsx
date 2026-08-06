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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession.js";
import { DEMO } from "@/api/demoClient";
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
const TIP_CHAT_URL = (SUPABASE_URL && SUPABASE_ANON_KEY && TIP_CONFIGURED)
  ? `${String(SUPABASE_URL).replace(/\/$/, '')}/functions/v1/tip-screen`
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

const EVM_ADDRESS_RE = /\b(0x[a-fA-F0-9]{40})\b/;

function extractAddress(text) {
  const match = text.match(EVM_ADDRESS_RE);
  return match ? match[1] : null;
}

function ScreeningVerdict({ result }) {
  if (!result) return null;

  const isBlock = result.verdict === 'block';
  const isWarn = result.verdict === 'warn' || result.verdict === 'error';
  const isClear = result.verdict === 'allow';

  const Icon = isBlock ? ShieldAlertIcon : isWarn ? AlertTriangle : CheckCircle2;
  const color = isBlock ? 'text-red-500' : isWarn ? 'text-amber-500' : 'text-emerald-500';
  const bg = isBlock ? 'bg-red-500/10 border-red-500/30' : isWarn ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30';
  const label = isBlock ? 'BLOCKED' : isWarn ? 'CAUTION' : 'CLEAR';

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
          No threats, sanctions hits, or risk signals found for this address.
        </p>
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

  const hidden = isDeniabilityOrDemoActive() || DEMO;

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
    // Reset offline state and clear any stale local-fallback messages when
    // opening; a stale flag or stuck "I'm currently offline" message from a
    // previous session should not paint the badge on a fresh drawer view.
    if (open) {
      setOffline(false);
      setMessages((prev) => prev.filter(m => !m.local));
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

    const detectedAddress = extractAddress(text);

    if (detectedAddress) {
      try {
        const result = await screenTransaction({
          chain: walletChain || 'ethereum',
          actionType: 'address_lookup',
          from: '0x0000000000000000000000000000000000000000',
          to: detectedAddress,
        });
        if (result) {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: "",
            screening: result,
          }]);
          setStreaming(false);
          return;
        }
      } catch {
        // screening failed — fall through to normal chat/local
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
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: "chat",
          // The TIP backend (llm.ts ADVISOR_SYSTEM_PROMPT) already supplies the
          // full Security Advisor persona and rules. Sending a second, larger
          // system prompt from the client blew past Llama-3.3-70B's 24K token
          // context and produced a 400 from Workers AI. Send only the current
          // page as a short user-visible context line, and let the server-side
          // prompt do its job.
          messages: [
            {
              role: "system",
              content: `Current page: ${currentScreen} (chain: ${walletChain || "evm"}). ${PAGE_CONTEXT[currentScreen] || PAGE_CONTEXT.general}`.slice(0, 800),
            },
            // Skip screening-card messages (content:"") — the Edge Function
            // rejects empty content, which was returning 400 bad_request and
            // pushing the drawer to the "offline" fallback path.
            ...history
              .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
              .map((m) => ({ role: m.role, content: m.content })),
          ],
          context: {
            current_screen: currentScreen,
            wallet_chain: walletChain,
          },
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

      // I4: fall back to local knowledge instead of showing an error
      const localAnswer = findLocalAnswer(text);
      setOffline(!localAnswer); // Only offline if local knowledge also has nothing
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
    if (abortRef.current) abortRef.current.abort();
    setOpen(false);
  };

  if (hidden) return null;

  return (
    <>
      {/* FAB */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-label="Open Security Advisor"
      >
        <ShieldCheck className="h-5 w-5" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[70dvh]">
          <DrawerHeader className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <DrawerTitle className="text-sm">Security Advisor</DrawerTitle>
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
            style={{ minHeight: "150px", maxHeight: "calc(70dvh - 130px)" }}
          >
            {messages.length === 0 && (
              <div className="space-y-3 pt-1">
                <p className="text-xs text-muted-foreground text-center">
                  Your security guide for this page. Tap any question to learn more.
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
              placeholder="Ask about security..."
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
