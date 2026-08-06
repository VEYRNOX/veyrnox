# SecurityAdvisor Interactions & Correlations

This document maps the interactions between the **AI Security Advisor** (TIP remote chat) and the **TIP Security Advisor** (threat intelligence screening).

## Component Architecture

```
SecurityAdvisor (React component)
├── FAB Button (I3: hidden in deniability mode)
├── Drawer Panel
│   ├── Consent Gate (M-5: explicit grant required)
│   ├── Messages Panel
│   │   ├── User Messages
│   │   ├── Assistant Responses (chat)
│   │   ├── Screening Verdicts (threat intelligence)
│   │   └── Follow-up Questions
│   └── Input Form
└── Network Paths
    ├── TIP Chat Endpoint (requires consent)
    └── TIP Screening API (address threat intelligence)
```

## Key Interactions

### 1. Address Extraction & Screening Correlation

**Interaction Flow:**
1. User types a message containing an EVM address (0x...)
2. `extractAddress()` parses the message via regex
3. If address found → `screenTransaction()` is called automatically
4. Screening result appears **before** any chat response
5. Chat follows only if user wants additional context

**Test Coverage:**
```
- Detects addresses and screens them before chat
- Shows BLOCKED verdict when sanctions match
- Shows CLEAR verdict with no risks
- Shows WARN verdict with risk signals
```

**Correlations Tested:**
- Address format (0x[40 hex chars]) → screening trigger
- Screening verdict → UI color/icon (red/amber/green)
- Multiple risks → all displayed in verdict

### 2. Consent Gate Correlation (M-5)

**Security Invariant:** No typed question (chat) may reach the remote endpoint without explicit grant.

**Note:** Address screening is INDEPENDENT of consent. Screening happens for all addresses regardless of consent state (M-5 gates chat, not screening).

**Interaction Flow:**
1. **First mount** → Consent panel appears (if TIP_CHAT_URL configured)
2. **User grants consent** → localStorage: "granted"
3. **User denies consent** → localStorage: "denied"
4. **Consent gates remote CHAT only** (not screening)
5. **Denial is not a dead end** → Falls back to local knowledge base for chat

**Test Coverage:**
```
- Shows disclosure when no decision stored
- Does NOT re-show after decision is stored
- Sends NOTHING (chat) while consent is unanswered
- Sends NOTHING (chat) after denial
- Still answers from local KB when declined
- Records consent so it survives remount
- Screening still runs regardless of chat consent
```

**Correlations Tested:**
- localStorage state → chat consent behavior
- Consent → chat network egress (gated at fetch call)
- Denial → chat local KB fallback (not an error)
- Screening independent of consent state

### 3. Local Fallback Correlation

**Redundancy Path:** When remote is unavailable, local knowledge base answers.

**Fallback Triggers:**
1. **No consent** → Local only
2. **TIP_CHAT_URL unconfigured** → Local only (no consent panel shown)
3. **Network error** → Local fallback + "offline" badge
4. **SSE stream breaks** → Partial answer from local KB
5. **Malformed response** → Local fallback

**Test Coverage:**
```
- Falls back when TIP chat is offline
- Shows "offline" badge but still answers
- Answers from local KB when consent denied
- Continues using local KB when TIP unconfigured
```

**Correlations Tested:**
- Network state → badge display
- Error type → fallback choice
- Offline → no error shown (graceful)

### 4. Screening Error Handling Correlation

**Error Handling Principle:** Screening errors don't block chat.

**Interaction Flow:**
1. Address extraction happens
2. `screenTransaction()` called
3. If screening fails → Skip verdict, proceed to chat anyway
4. Chat still uses remote endpoint (if consent granted)
5. User gets answer (with or without screening info)

**Test Coverage:**
```
- Catches screening errors gracefully
- Falls back to chat when screening fails
- Does not show verdict for non-address questions
- Maintains separation: screening ≠ chat
```

**Correlations Tested:**
- Screening error → Chat proceeds anyway
- No address detected → No screening verdict
- Chat available even if screening breaks

### 5. Page Context Correlation

**Context-Aware Advice:** Advisor adapts questions to current page.

**Page Mappings:**
```
/                → dashboard (portfolio overview)
/send            → send (address+amount input) — screening-critical
/receive         → receive (address sharing)
/settings        → settings (PIN, KEK, backup)
/walletconnect   → dApp connections
/deniability     → duress/stealth/panic setup
/plans           → subscription features
/security-dashboard → RASP/KEK/vault status
```

**Interaction Flow:**
1. Component reads `useLocation().pathname`
2. Resolves to screen key via `SCREEN_MAP`
3. Loads `SUGGESTED_QUESTIONS_BY_SCREEN[screen]`
4. Loads `PAGE_CONTEXT[screen]` for system prompt
5. Chat response is screen-aware
6. Follow-up questions match current context

**Test Coverage:**
```
- Provides send-screen-specific advice
- Correlates deniability advice with deniability page
- Questions match current screen
- System prompt includes page context
```

**Correlations Tested:**
- Route → suggested questions
- Page → context in system prompt
- Context → follow-up question selection

### 6. Multiple Risk Signals Correlation

**Screening Verdict Structure:**
```json
{
  "verdict": "block" | "warn" | "allow",
  "sanctions": true | false,
  "risks": [
    { "title": "Risk Type", "detail": "Explanation" },
    { "title": "Another Risk", "detail": "..." }
  ]
}
```

**Display Correlation:**
```
verdict: "block" + sanctions: true
  → Red UI + "BLOCKED" label
  → Sanctions match detected (large text)
  → All risks listed below

verdict: "warn" + risks: [...]
  → Amber UI + "CAUTION" label
  → Each risk item shown
  → Risks may include: mixer, scam, wash trading, etc.

verdict: "allow" + risks: []
  → Green UI + "CLEAR" label
  → "No threats detected" message
```

**Test Coverage:**
```
- Correlates multiple risk signals
- Shows all risks in verdict panel
- Each risk displays title + detail
- Color/icon matches verdict type
```

**Correlations Tested:**
- Multiple risks → all rendered
- Risk type → specific wording
- Verdict + sanctions → UI styling

### 7. Deniability Mode Correlation (I3)

**Security Invariant:** Deniability mode makes zero backend calls and exposes zero UI.

**Interaction Flow:**
1. `isDeniabilityOrDemoActive()` returns true
2. Component returns null (renders nothing)
3. FAB is hidden entirely
4. No drawer, no messages, no consent panel
5. No fetch calls possible
6. No screening calls possible

**Test Coverage:**
```
- Hides FAB entirely in deniability mode
- Renders no content (empty container)
- No network calls attempted
- No screening calls attempted
```

**Correlations Tested:**
- Deniability active → render null
- Hidden → zero egress
- I3 invariant → no leakage

### 8. Message History Correlation

**Conversation Context:** Each message includes prior history.

**Interaction Flow:**
1. User sends Q1
2. Message added to state: `[{role: "user", content: Q1}]`
3. Chat request includes full history
4. Assistant response appended: `[..., {role: "assistant", content: A1}]`
5. User sends Q2
6. Chat request includes [Q1, A1, Q2]
7. Assistant context includes prior exchange

**Chat Payload Structure:**
```javascript
{
  action: "chat",
  messages: [
    { role: "system", content: "You are the Veyrnox Security Advisor..." },
    { role: "user", content: "What is deniability?" },
    { role: "assistant", content: "Deniability mode..." },
    { role: "user", content: "Can it be detected?" }
  ],
  context: {
    current_screen: "deniability",
    wallet_chain: "ethereum"
  }
}
```

**Test Coverage:**
```
- Maintains conversation history
- Follow-up questions have prior context
- System prompt includes current state
- Context object updated per message
```

**Correlations Tested:**
- Message count → history length
- Follow-up Q → includes prior A
- Context → stateful responses

## Correlation Matrix

**Key insight:** Address screening is INDEPENDENT of chat consent (M-5). Screening happens for all address queries regardless of consent state.

| Trigger | Chat Gated? | Screening Gated? | Fallback | Notes |
|---------|------------|-----------------|----------|-------|
| Consent = null | Yes | No | Chat: Local KB | Screening always runs |
| Consent = granted | No | No | Network | Both enabled |
| Consent = denied | Yes | No | Chat: Local KB | Screening still runs |
| TIP_CHAT_URL = "" | Yes | No | Chat: Local KB | Screening independent |
| Network offline | Yes (soft) | Soft | Both: Local KB | "Offline" badge |
| Screening fails | No | N/A | Chat anyway | Errors don't block |
| Address detected | No | No | Screening → Chat | Screening runs first |
| No address | No | N/A | Chat only | No screening |
| Deniability = true | N/A | N/A | Render null | I3: zero egress |

## Testing Strategy

### Unit Tests (`SecurityAdvisor.test.jsx`)
- Basic rendering
- I3 deniability hiding
- FAB visibility

### Consent Tests (`SecurityAdvisor.consent.test.jsx`)
- M-5: No egress without consent
- Denial persistence
- Local fallback on denial

### Interaction Tests (`SecurityAdvisor.interactions.test.jsx`) ← **NEW**
- Address extraction → screening
- Screening verdict correlation
- Consent blocking both paths
- Graceful offline fallback
- Context-aware advice
- Multiple risk signals
- Deniability integration
- Conversation history

## Running the Tests

```bash
# All advisor tests
npm test SecurityAdvisor

# Specific suite
npm test SecurityAdvisor.interactions

# Watch mode
npm test -- --watch SecurityAdvisor.interactions

# Coverage
npm test -- --coverage SecurityAdvisor
```

## Key Design Properties

1. **Fail-closed (I4):** Errors in screening or chat don't expose incomplete information
2. **Graceful degradation:** Offline = local KB, not error
3. **Explicit consent (M-5):** No hidden network calls
4. **Deniability-safe (I3):** Zero network in deniability mode
5. **Context-aware:** Page state influences suggestions
6. **Screen-correlated:** Threat intel appears inline with chat
7. **History-preserving:** Follow-ups maintain context
8. **Redundant:** Local KB works when remote fails

## Future Enhancements

- [ ] Screening verdict caching (same address, same verdict)
- [ ] Context-aware screening (different advice for different pages)
- [ ] Threat correlation scoring (multiple risks = higher threat level)
- [ ] Address allowlist (remember "verified safe" addresses)
- [ ] Follow-up auto-generation based on verdict type
- [ ] Analytics (correlate user questions with screening hits)
