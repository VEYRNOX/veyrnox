# Post-Audit QA Testing Guide
**Veyrnox Wallet — Security Audit Remediation Validation**

This guide documents comprehensive QA testing for all security fixes from audit rounds 3–4 (2026-08-16).

---

## Overview

Veyrnox Wallet underwent a third-party security audit (ECC, June 2026) covering core wallet functionality. Following that audit and subsequent independent hardware-KEK validation, the team implemented fixes for identified vulnerabilities. This test suite validates that:

1. **All CRITICAL findings are remediated** and function correctly under stress
2. **No regressions** were introduced by fixes
3. **Attack surface** remains contained (boundary tests)
4. **Cryptographic guarantees** hold (unit + integration tests)

### Audit Findings Covered

| Finding | Severity | Status | Tests |
|---------|----------|--------|-------|
| VULN-19: Nonce unpinned in ERC-20 path | CRITICAL | Fixed | 5 |
| Rate-limit missing on monitoring endpoint | HIGH | Fixed | 2 |
| Query params uncanonical/unsigned | MEDIUM | Fixed | 1 |
| RestoreFromShares test theater | HIGH | Fixed | 2 |
| KEK enrollment gate missing | HIGH | Fixed | 2 |
| Network config K-2 gate | MEDIUM | Fixed | 2 |
| x-api-key header exposure | MEDIUM | Fixed | 2 |
| Session unlock race conditions | MEDIUM | Fixed | 2 |

---

## Test Infrastructure

### Test Suites

**E2E Tests** (Playwright, browser-based)
- `e2e/post-audit-validation.spec.js` — Happy path + audit fix validation
- `e2e/post-audit-security-boundaries.spec.js` — Attack surface, input validation, XSS, fail-closed behavior

**Unit Tests** (Vitest, wallet-core modules)
- `tests/wallet-core/post-audit-unit-tests.test.js` — Nonce pinning, shard hardening, KEK enforcement, rate-limiting

**Supporting Infrastructure**
- `scripts/run-post-audit-qa.mjs` — Test orchestration, report generation
- This guide

### Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Browser testing | Playwright | End-to-end flows, user journeys, attack payloads |
| Unit testing | Vitest | Cryptographic functions, state machines, boundary conditions |
| Orchestration | Node.js | Multi-phase test execution, report generation |
| CI/CD | GitHub Actions | Automated runs on each commit (optional) |

---

## Quick Start

### Prerequisites

```bash
# Verify Node.js
node --version  # >=18

# Install dependencies (if not already done)
npm install

# Install Playwright browsers
npx playwright install

# Build wallet
npm run build
```

### Run All Post-Audit QA

**One-command execution:**

```bash
npm run post-audit-qa
```

Or manually:

```bash
# Start dev server (if not running)
npm run dev &

# Run full suite (takes ~15–30 minutes)
node scripts/run-post-audit-qa.mjs
```

### Individual Test Suites

```bash
# E2E validation only
npm run test:e2e -- e2e/post-audit-validation.spec.js

# E2E security boundaries only
npm run test:e2e -- e2e/post-audit-security-boundaries.spec.js

# Unit tests only
npm test tests/wallet-core/post-audit-unit-tests.test.js

# Debug mode (interactive)
npm run test:e2e:ui -- e2e/post-audit-validation.spec.js
```

---

## Test Descriptions

### E2E: Post-Audit Validation

**VULN-19: Nonce Pinning**

- ✓ Nonce locks to first ERC-20 send attempt
- ✓ Nonce persists across app restart for pending transfer
- ✓ Nonce override rejected at signature time
- ✓ Re-attempts use pinned nonce (no increment on retry)

**Rate Limiting**

- ✓ `monitoring/refresh` endpoint rejects after quota exceeded (429)
- ✓ Rate limit counters reset after window expiry
- ✓ Different endpoints have independent quotas

**Query Canonicalization**

- ✓ Query params sorted alphabetically before HMAC generation
- ✓ HMAC validation fails if params reordered
- ✓ URL params in request match canonical order

**Shard Hardening**

- ✓ `RestoreFromShares` cleanup clears state after success
- ✓ PIN entropy floor enforced (≥12 digits)
- ✓ Shard encryption/decryption roundtrip succeeds

**KEK & Biometric**

- ✓ Send blocked until KEK enrolled
- ✓ Biometric unlock enforces `kekEnrolled` assertion
- ✓ UI shows KEK enrollment prompt when required

**Network Gating**

- ✓ K-2 gate blocks unauthenticated config access
- ✓ Rejected env overrides surface with reason
- ✓ URL fragments stripped before network requests

**Session & Header Security**

- ✓ Unlock race guard prevents concurrent unlocks
- ✓ Prompt rejection on lock aborts pending operations
- ✓ `x-api-key` header stripped before upstream proxy
- ✓ Content-Type header binding prevents spoofing

**Critical Path Regression**

- ✓ Send flow completes without security errors
- ✓ Receive address validates before clipboard render
- ✓ No address/memo leakage in downloads/storage

### E2E: Security Boundaries

**Input Validation**

- ✓ Oversized amounts rejected (>max uint256)
- ✓ Recipient addresses sanitized (no HTML, SQL, null bytes)
- ✓ Invalid Ethereum addresses rejected
- ✓ Memo field escapes or strips dangerous input

**Nonce & Double-Spend**

- ✓ Double-broadcast latch prevents on-chain duplication
- ✓ Nonce shape assertion rejects malformed nonces
- ✓ Replay protection via nonce + gas price binding

**Session & Authentication**

- ✓ Session expires after inactivity (default 30 min)
- ✓ PIN validation rejects weak patterns (000000, 123456, etc.)
- ✓ Concurrent unlock attempts fail gracefully

**Key & Secret Exposure**

- ✓ Private keys never appear in logs or localStorage dumps
- ✓ API keys not sent to upstream third-party services
- ✓ Seed phrases not logged in console

**CSP & XSS**

- ✓ Content-Security-Policy headers present and strict
- ✓ Common XSS payloads fail to execute
- ✓ Eval/inline scripts blocked

### Unit: Wallet Core

**Nonce Pinning (token-send.js)**

- ✓ Nonce pins to first send (same recipient, amount, token)
- ✓ Nonce increments for different recipient or amount
- ✓ Nonce override attempts are ignored
- ✓ Nonce shape validation (must be uint256)
- ✓ Double-broadcast detection via nonce exhaustion

**Shard Hardening (shard-recovery.js)**

- ✓ Shard format validation (rejects empty, wrong length, invalid)
- ✓ PIN entropy validation (≥12 digits, not all same)
- ✓ Shards encrypted with KEK before storage
- ✓ Sensitive state cleared after successful recovery
- ✓ State cleanup on error (abort recovery)

**KEK Enrollment (kek-manager.js)**

- ✓ Send blocked before KEK enrollment
- ✓ Send allowed after enrollment
- ✓ Biometric unlock enforces `kekEnrolled` assertion
- ✓ Enrollment status returned for UI gating

**Rate Limiting (rate-limit.js)**

- ✓ Per-endpoint request tracking
- ✓ Counter reset after window expiry
- ✓ Independent limits for different endpoints
- ✓ Retry-After header included on rate-limit response

**Header Security**

- ✓ Query params canonicalized alphabetically
- ✓ Content-Type header validation
- ✓ HMAC regenerated from canonical query

**Session Security**

- ✓ Concurrent unlock attempts serialized (only one succeeds)
- ✓ Pending operations rejected on lock event

---

## Running Tests in CI/CD

### GitHub Actions

Add to `.github/workflows/post-audit-qa.yml`:

```yaml
name: Post-Audit QA
on: [push, pull_request]

jobs:
  qa:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      
      - run: node scripts/run-post-audit-qa.mjs
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: qa-results
          path: test-results/
```

### Local CI Simulation

```bash
# Clean run (mimics CI environment)
rm -rf node_modules dist test-results
npm ci
npm run build
node scripts/run-post-audit-qa.mjs
```

---

## Interpreting Results

### Test Report Structure

After running tests, reports appear in `test-results/post-audit-qa-{timestamp}/`:

```
test-results/post-audit-qa-2026-08-16T15-30-45/
├── POST-AUDIT-QA-REPORT.md          # Executive summary (human-readable)
├── post-audit-qa-report.json        # Structured data
├── html/                            # Playwright HTML reports
│   ├── index.html
│   ├── post-audit-validation.html
│   └── post-audit-security-boundaries.html
└── logs/
    ├── unit-tests.log
    ├── e2e-validation.log
    └── e2e-boundaries.log
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed ✓ |
| 1 | Test failures or setup errors ✗ |
| 2 | Skipped (missing dependencies) |

### Common Failures

**"Playwright not installed"**
```bash
npx playwright install
```

**"Browser not found"**
```bash
npx playwright install --with-deps  # Installs system dependencies too
```

**"Port 5173 already in use"**
```bash
# Kill dev server and retry
lsof -ti:5173 | xargs kill -9
npm run dev &
```

**E2E timeout on unlock**
- Ensure wallet has valid setup (PIN 111111 by default)
- Check that selectors match current UI

---

## Extending Tests

### Adding a New Audit Finding Test

1. **Create test in appropriate suite**
   ```javascript
   // e2e/post-audit-validation.spec.js
   test('my-new-fix validates correctly', async ({ page }) => {
     // Your test here
   });
   ```

2. **Update audit findings mapping** in `scripts/run-post-audit-qa.mjs`
   ```javascript
   'MY-FIX': {
     severity: 'HIGH',
     description: 'What was fixed',
     tests: ['my-new-fix validates correctly'],
   }
   ```

3. **Run and verify**
   ```bash
   npm run test:e2e -- e2e/post-audit-validation.spec.js -g "my-new-fix"
   ```

### Adding a Unit Test

1. **Create test in `tests/wallet-core/post-audit-unit-tests.test.js`**
   ```javascript
   describe('My Fix: module-name.js', () => {
     it('should do X', () => {
       // Test assertion
     });
   });
   ```

2. **Run**
   ```bash
   npm test tests/wallet-core/post-audit-unit-tests.test.js
   ```

---

## Security Considerations

### Test Data Privacy

- Tests use **testnet addresses** (Sepolia) — no real funds at risk
- PIN used in tests is **test-only** (111111) — never real wallet PIN
- No seed phrases or private keys stored in test files
- All test data cleared after suite execution

### Attack Surface Testing

Security boundary tests are **defensive**:
- XSS payloads: verified blocked, not executed
- Input injection: rejected at validation boundary
- Rate limits: tested at protocol level, not user-facing
- No destructive operations against real services

---

## Troubleshooting

### Tests Hang on Unlock

**Problem:** E2E tests hang when entering PIN
**Solution:**
1. Verify PIN selector exists: `[data-testid="pin-input"]`
2. Check that unlock button fires: `[data-testid="unlock-btn"]`
3. Debug with: `npm run test:e2e:debug`

### Nonce Tests Flaky

**Problem:** Nonce pinning tests sometimes pass, sometimes fail
**Solution:**
- Ensure wallet is fully unlocked before send
- Check that previous test teardown cleared state
- Use isolated test runs: `npm run test:e2e -- -g "nonce pinning"`

### Rate Limit Tests Timeout

**Problem:** Rate limit tests wait for quota reset
**Solution:**
- Tests use short windows (ms-level) by design
- If CI timeouts, increase test timeout: `--timeout 60000`

### Headers Not Captured

**Problem:** Network request validation sees no x-api-key header
**Solution:**
- Use `page.on('request')` only for XHR/Fetch, not images
- Filter by URL: `.includes('/api/')`

---

## CI/CD Integration

### Automated Runs

```bash
# On every commit
git add e2e/post-audit-*.spec.js tests/wallet-core/post-audit-*.test.js
git commit -m "chore: add post-audit QA tests"
git push  # Triggers CI workflow
```

### Pre-Deployment Gate

Add to release checklist:
- [ ] All post-audit QA tests pass
- [ ] No new security findings in HTML report
- [ ] Rate limiting verified on production endpoints
- [ ] Nonce pinning confirmed in real send flow
- [ ] KEK enrollment gates enforced

---

## Support

For issues or questions:

1. **Check test logs** → `test-results/post-audit-qa-{timestamp}/`
2. **Review test comments** → Inline docstrings explain complex assertions
3. **Consult audit report** → CLAUDE.md, audit-triage/ for context
4. **Run in debug mode** → `npm run test:e2e:debug`

---

**Last updated:** 2026-08-16  
**Audit reference:** ECC June 2026 (core), Aug 2026 (KEK hardening)
