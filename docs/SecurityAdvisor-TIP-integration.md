# Veyrnox AI Security Advisor ↔ TIP Security Advisor Integration

<!-- Signing-secret rotation record. Update on every rotation. See docs/tip-signing-secret-rotation.md -->
TIP_SIGNING_SECRET last rotated: NEVER (leaked commit d8125e85 2026-08-06, scrubbed 30919d6b 2026-08-11 without rotation — STRIX retest 2026-08-29 confirmed still present)

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│   Veyrnox Wallet (Client)                   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  Veyrnox AI Security Advisor         │   │
│  │  (React Component)                   │   │
│  │                                      │   │
│  │  • FAB button                        │   │
│  │  • Drawer panel                      │   │
│  │  • Message history                   │   │
│  │  • Local knowledge base              │   │
│  │  • Address extraction (regex)        │   │
│  └──────────────────────────────────────┘   │
│              ↓                               │
│  ┌──────────────────────────────────────┐   │
│  │  Supabase Edge Function              │   │
│  │  (tip-screen)                        │   │
│  │                                      │   │
│  │  • Request signing                   │   │
│  │  • Rate limiting                     │   │
│  │  • Error handling                    │   │
│  └──────────────────────────────────────┘   │
└──────────────────────┬──────────────────────┘
                       │
                       │ HTTPS + signed request
                       │
┌──────────────────────▼──────────────────────┐
│   TIP (Threat Intelligence Platform)        │
│   https://tip.veyrnox.com                   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │  TIP Security Advisor Agent          │   │
│  │                                      │   │
│  │  • LLM-powered chat                  │   │
│  │  • Threat intelligence screening     │   │
│  │  • Sanctions list checking (OFAC)    │   │
│  │  • Scam address detection            │   │
│  │  • Risk scoring                      │   │
│  │  • Multi-model threat analysis       │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  Response: Verdict + Risks + Follow-ups     │
└─────────────────────────────────────────────┘
```

---

## Request Flow

### 1. Address Screening Request

```
User types address in chat
         ↓
SecurityAdvisor.jsx detects 0x... pattern (EVM_ADDRESS_RE)
         ↓
screenTransaction({
  chain: 'ethereum',
  actionType: 'address_lookup',
  from: '0x0000...',
  to: '0xdead...'
})
         ↓
tipScreen.js (src/api/tipScreen.js)
         ├─ Validates request
         └─ POST to Supabase Edge Function
         ↓
Supabase Edge Function (supabase/functions/tip-screen/index.ts)
         ├─ Signs request to TIP
         ├─ Extracts TIP_API_KEY from secrets
         ├─ Validates input (length, type, range)
         └─ Forwards to TIP backend
         ↓
TIP Security Advisor
         ├─ Checks sanctions lists (OFAC SDN)
         ├─ Analyzes address risk signals
         ├─ Queries threat intelligence database
         └─ Scores verdict: BLOCK | WARN | ALLOW
         ↓
Response: {
  verdict: 'warn' | 'block' | 'allow',
  sanctions: true | false,
  risks: [
    { title: 'Risk Type', detail: 'Explanation' },
    ...
  ]
}
```

### 2. Chat Request (M-5: Consent-gated)

```
User asks question + context
         ↓
M-5 Consent Check
         ├─ localStorage.getItem('veyrnox-advisor-remote-consent')
         ├─ If null → show consent panel (user grants/denies)
         ├─ If denied → use local KB only, STOP
         └─ If granted → proceed
         ↓
buildSystemPrompt(currentScreen)
  ├─ Page context (dashboard, send, deniability, etc.)
  ├─ Veyrnox app knowledge
  └─ Security context
         ↓
POST to Supabase Edge Function (tip-screen with action: 'chat')
{
  action: 'chat',
  messages: [
    { role: 'system', content: '...' },
    { role: 'user', content: 'What is deniability?' },
    { role: 'assistant', content: '...' },
    { role: 'user', content: 'How do I set it up?' }
  ],
  context: {
    current_screen: 'deniability',
    wallet_chain: 'ethereum'
  }
}
         ↓
Supabase Edge Function
         ├─ Signs request to TIP
         ├─ Rate limiting check
         ├─ Input validation
         └─ Forwards to TIP
         ↓
TIP Security Advisor (LLM)
         ├─ System prompt includes app context
         ├─ History-aware response
         ├─ Generates follow-up suggestions
         └─ Returns via SSE (Server-Sent Events)
         ↓
SecurityAdvisor streams response
  ├─ Parses SSE chunks
  ├─ Updates message state
  ├─ Shows loader while streaming
  └─ Displays full response + follow-ups
```

---

## Data Flow: Address → Screening → Verdict

```
1. USER INPUT
   User types: "Is 0xdead000000000000000000000000000000000000 safe?"
   
2. ADDRESS EXTRACTION
   extractAddress(text) → matches EVM_ADDRESS_RE
   Extracted: 0xdead000000000000000000000000000000000000
   
3. SCREENING REQUEST
   screenTransaction({
     chain: 'ethereum',
     actionType: 'address_lookup',
     from: '0x0000000000000000000000000000000000000000',
     to: '0xdead000000000000000000000000000000000000'
   })
   
4. SUPABASE EDGE FUNCTION
   src/api/tipScreen.js →
   supabase/functions/tip-screen/index.ts
   
   Validates:
   ✓ Address format (0x[40 hex])
   ✓ Action type (address_lookup)
   
5. TIP BACKEND CALL
   POST https://tip.veyrnox.com/api/v1/agents/security-advisor/screen
   {
     api_key: <TIP_API_KEY>,
     signing_secret: <TIP_SIGNING_SECRET>,
     address: 0xdead000000000000000000000000000000000000,
     chain: ethereum
   }
   
6. TIP ANALYSIS
   ┌─ Sanctions Database (OFAC SDN) → No match
   ├─ Scam Address Detector → Known scam (47 reports)
   ├─ Mixer/Tumbler Detector → Detected
   ├─ Wash Trading Analyzer → Detected
   └─ Risk Score: MEDIUM → Verdict: WARN
   
7. RESPONSE
   {
     verdict: 'warn',
     sanctions: false,
     risks: [
       {
         title: 'Known Scam Address',
         detail: 'Reported in 47 incidents'
       },
       {
         title: 'Mixer Activity',
         detail: 'Associated with privacy mixing service'
       },
       {
         title: 'Wash Trading',
         detail: 'Circular transfer pattern detected'
       }
     ]
   }
   
8. VEYRNOX DISPLAY
   ScreeningVerdict component renders:
   ┌──────────────────────────────────────┐
   │ 🟠 Threat Screening: CAUTION           │
   │                                       │
   │ ⚠️  Known Scam Address                 │
   │    Reported in 47 incidents            │
   │                                       │
   │ ⚠️  Mixer Activity                     │
   │    Associated with privacy mixing      │
   │                                       │
   │ ⚠️  Wash Trading                       │
   │    Circular transfer pattern detected   │
   │                                       │
   │ from threat intelligence screening     │
   └──────────────────────────────────────┘
```

---

## Integration Points

### Veyrnox Side

**Component:** `src/components/SecurityAdvisor.jsx`
- Line 12: `import { screenTransaction } from "@/api/tipScreen.js"`
- Line 254: `const EVM_ADDRESS_RE = /\b(0x[a-fA-F0-9]{40})\b/`
- Line 368-390: Address extraction & screening
- Line 399-402: M-5 consent gate
- Line 410-445: TIP chat request

**API Client:** `src/api/tipScreen.js`
- Constructs request payload
- POSTs to Supabase Edge Function (client never signs)
- Handles SSE streaming
- Error recovery to local KB

**Edge Function:** `supabase/functions/tip-screen/index.ts`
- Signs request to TIP (server-side)
- Validates inputs
- Forwards to TIP backend
- Returns responses

### TIP Side

**Security Advisor Agent** @ https://tip.veyrnox.com/agents
- Screens addresses (sanctions, scams, risks)
- Answers questions (LLM-powered)
- Provides threat intelligence
- Generates follow-ups

**API Endpoints:**
- `POST /api/v1/agents/security-advisor/screen` (threat screening)
- `POST /api/v1/agents/security-advisor/chat` (LLM chat)

---

## Security & Gating

### M-5: Explicit Consent for Chat
- **Gate location:** Line 399 in SecurityAdvisor.jsx
- **Check:** `if (!TIP_CHAT_URL || !hasAdvisorConsent())`
- **If denied:** Use local KB instead
- **Screening:** NOT gated by consent (independent)

### Address Screening (Independent)
- Always active if address detected
- Does NOT require chat consent
- Returns verdict inline with messages
- Falls back gracefully on network error

### I3: Deniability Mode
- FAB hidden entirely
- Zero network calls
- Zero UI rendering
- Component returns `null`

### I4: Fail-Closed
- Screening errors → Chat proceeds anyway
- Chat errors → Local KB fallback
- Invalid responses → Graceful handling
- Never silent failure

---

## Testing the Integration

### Unit Tests (All Passing: 29 tests)
✅ Mocked TIP calls, verified flow logic
- `SecurityAdvisor.test.jsx` (4 tests: rendering, I3)
- `SecurityAdvisor.consent.test.jsx` (8 tests: M-5)
- `SecurityAdvisor.interactions.test.jsx` (18 tests: correlations)

### Integration Tests (To Verify)
```
Next steps:
[ ] Set TIP credentials in Supabase Edge Function Secrets
    - TIP_API_KEY = <retrieve from ops password store; rotate via wrangler d1 UPDATE on prod key id>
    - TIP_SIGNING_SECRET = <env-wide master; retrieve from ops password store, never commit>
    
[ ] Set .env.local flags
    - VITE_TIP_BASE_URL = https://tip.veyrnox.com (or your deployment)
    - VITE_SUPABASE_URL = (your Supabase project)
    - VITE_SUPABASE_ANON_KEY = (your anon key)
    
[ ] Run the app: npm run dev
    
[ ] Test manually:
    1. Open Security Advisor (FAB button)
    2. Ask a question with an address: "Is 0xdead... safe?"
    3. Watch screening verdict appear
    4. Then see chat response
    
[ ] Check TIP agent counts:
    - Visit https://tip.veyrnox.com/agents
    - Security Advisor should show > 0 requests
```

---

## Current Status (2026-08-09)

| Component | Status | Evidence |
|-----------|--------|----------|
| Veyrnox AI Security Advisor | ✅ BUILT | 29 tests passing |
| Local knowledge base | ✅ BUILT | Fallback tested |
| Address extraction | ✅ BUILT | Regex tested |
| Screening verdict display | ✅ BUILT | UI tested |
| M-5 consent gate | ✅ BUILT | Gate tested |
| Supabase Edge Function `tip-screen` | ✅ LIVE | Credentials set on `veyrnox-tip-production`; curl-verified |
| TIP backend integration (Advisor path) | ✅ LIVE | Sim: Tornado router → BLOCKED, Vitalik → CLEAR (2026-08-09) |
| TIP backend integration (Send Preview) | ✅ LIVE | Fixed chain-slug mapping (`resolveTipChain`, wallet PR #1646) |
| Sanctioned-namespace lane (Tornado/Lazarus/Blender.io/Sinbad/Ronin/Garantex/Hydra/Suex/Chatex + `blocked,ofac-sanctions-lists`) | ✅ LIVE | Every EVM chain (tip PRs #39, #40, #41, #42) |
| Tx-simulation — Alchemy lane | ✅ LIVE | ETH / POLY / ARB / OP / BASE. **Whole API family deprecated 30 Sept 2026** — schedule a replacement |
| Tx-simulation — public-RPC lane (`rpc-sim`) | ✅ LIVE | AVAX + BSC via `eth_estimateGas` on `bsc-rpc.publicnode.com` / `avalanche-c-chain-rpc.publicnode.com`. Deliberately scoped to alchemy-uncovered chains (tip PRs #45 + #46 hotfix) |

Cross-chain regression matrix (deployed prod Worker, curl-verified 2026-08-09):

| From chain | To Tornado router `0x8589…FDA16` | Verdict |
|---|---|---|
| ethereum | `sanctioned-address hit + etherscan-labels clean [Labelled: Tornado.Cash: Donate]` | 🔴 BLOCK |
| polygon | `etherscan-labels skipped [chain] + sanctioned-address hit` | 🔴 BLOCK |
| arbitrum | `etherscan-labels skipped [chain] + sanctioned-address hit` | 🔴 BLOCK |
| bsc (BNB) | `etherscan-labels skipped [chain] + sanctioned-address hit` | 🔴 BLOCK |
| polygon → Vitalik (clean) | `sanctioned-address clean` | 🟢 ALLOW |

**Source-key decisions (locked 2026-08-09):**

| Source | Status | Reason |
|---|---|---|
| `ALCHEMY_API_KEY` | ✅ **LIVE on production + staging** | Free tier (30M CU/mo). Verified via `wrangler secret list --env {production,staging}` and functional curl → `alchemy-sim clean — Simulation succeeded, N asset change(s), no drain detected`. |
| `CHAINALYSIS_API_KEY` | ⏭ **Permanent skip** | Free Sanctions Screening API tier discontinued; only paid enterprise contract (5-figure/yr minimum, quote-only). Redundant with OFAC-GitHub + our `sanctioned-address` lane for the entities the wallet targets (Tornado / Lazarus / Blender.io / Sinbad / Ronin). |
| `OPENSANCTIONS_API_KEY` | ⏭ **Permanent skip (API)** | 30-day trial only, then paid. Bulk dataset is CC-BY 4.0 downloadable — self-hosting on the Worker is a future call if PEP screening becomes in-scope. |

Not independently audited. Not on-chain-txid verified in the strict sense (this
is screening, not signing).
