# VEYRNOX Security Recommendations

> **PROVENANCE — INTERNAL AUDIT, NOT INDEPENDENT.** This document was produced by a
> Claude Code (AI) security-audit agent operated by the Veyrnox project itself. Per
> project rule I4, an internal audit must never be presented as "independent"; earlier
> revisions of this document set were mislabeled "Independent" and have been relabeled.
> The only independent audit of Veyrnox to date is the third-party ECC audit
> (2026-06-23). Context note: this audit's "conditional mainnet readiness" framing
> predates awareness that mainnet was already unlocked on 2026-06-17 via the internal
> audit gate (`docs/audit-triage/internal-audit-2026-06-17.md`); read its deployment
> recommendations in that light. Its three "critical blockers" were subsequently
> addressed in PR #598.

**Date**: 2026-07-05  
**Audience**: Leadership, Security Team, Engineering  
**Priority**: CRITICAL PATH TO MAINNET

---

## Executive Recommendations

### 🎯 Primary Recommendation: **DO NOT LAUNCH MAINNET UNTIL CRITICAL PATH COMPLETE**

**Rationale**: Three critical blockers prevent safe mainnet deployment. All are fixable within 3-4 weeks. Skipping any creates unacceptable risk.

**Approved Timeline**: 3-4 weeks (Week 1-4 as detailed below)

---

## Critical Path Recommendations (Week 1-4)

### WEEK 1: Fix Critical Blockers (MUST COMPLETE)

#### Recommendation 1.1: Implement CI Ring-Import Enforcement ⚡ URGENT
**Status**: CRITICAL BLOCKER  
**Current State**: ESLint rule never written; crypto boundaries not protected at build-time  
**Risk**: Accidental crypto-core exposure to UI/backend code

**Actions**:
1. **Day 1-2**: Fix ESLint config spread-overwrite bug
   - Root cause: `rules: {...recommended, ...custom}` overwrites recommended config
   - Solution: Use proper config merging (see CRITICAL-FINDINGS-DEEP-DIVE.md for code)
   - Test: Run `npx eslint --print-config` to verify rule is active

2. **Day 2-3**: Implement R0/R1 ring-import lint rule
   - Create custom ESLint rule blocking vault/signing imports in UI/backend
   - Files affected: R0 (hardware-keystore), R1 (crypto-core)
   - Test: Verify forbidden imports are caught

3. **Day 3-4**: Add CI gate validation
   - Verify rule is active in CI verify gate
   - Block PRs on ring boundary violations
   - Build fails on violation (non-negotiable)

4. **Day 5**: Verification & documentation
   - Run against entire codebase
   - Fix any existing violations
   - Document the rule for team

**Effort**: 4-5 developer days  
**Owner**: Security engineering lead  
**Deliverable**: CI gate enforcing ring boundaries  
**Critical Success Factor**: Rule must block PRs (not just warn)

---

#### Recommendation 1.2: Automate Mainnet Deployment Gate ⚡ URGENT
**Status**: CRITICAL BLOCKER  
**Current State**: Manual chain-key flip with no approval gates or audit trail  
**Risk**: Accidental/unauthorized mainnet activation before audit complete

**Actions**:
1. **Day 1**: Implement mainnet key validation script
   - Block mainnet keys in main branch
   - Require explicit audit approval to enable
   - Add to CI verify gate

2. **Day 2**: Create multi-step approval process
   - Step 1: Verify real on-chain testnet transaction
   - Step 2: Build with MAINNET_MODE=1 flag only
   - Step 3: Require 2+ security team approvals
   - Step 4: Create signed release tag

3. **Day 3**: Wire GitHub branch protection
   - Restrict main branch pushes to security team only
   - Require CODEOWNERS approval for assets.js changes
   - Enforce 2 approvals before merge

4. **Day 4-5**: Test end-to-end activation flow
   - Simulate mainnet activation on testnet
   - Verify all gates work correctly
   - Document activation procedure

**Effort**: 5 developer days  
**Owner**: DevOps + Security lead  
**Deliverable**: Automated mainnet deployment gates  
**Critical Success Factor**: Manual flip must be impossible without audit approval

---

#### Recommendation 1.3: Engage External Cryptographer ⚡ URGENT (Parallel with Above)
**Status**: CRITICAL BLOCKER  
**Current State**: Crypto implementation diverges from design (AES-256-GCM vs XChaCha20)  
**Risk**: Timing attack vulnerability, unverified key derivation

**Actions**:
1. **Day 1**: Select and engage cryptographer
   - Qualifications: NIST/IETF background, WebCrypto experience
   - Estimated cost: $15K-25K for 1-week review
   - Timeline: 1 week parallel with CI/mainnet fixes

2. **Scope of Review**:
   - WebCrypto AES-256-GCM side-channel analysis
   - Argon2id parameter validation (m=192/t=3)
   - KDF pipeline security (direct Argon2id → cipher, no HKDF)
   - Salt generation and storage verification
   - IV/nonce randomness validation
   - Authentication tag strength (should be 128 bits)

3. **Deliverables Expected**:
   - Go/No-go decision on AES-256-GCM
   - If go: recommendation to accept (defensible choice)
   - If no-go: path to revert to XChaCha20-Poly1305 (+1 week effort)

**Effort**: 1 week (external)  
**Owner**: Security team (coordinate review)  
**Deliverable**: Crypto audit report + recommendation  
**Critical Success Factor**: Audit must be complete before Week 2 code review

---

### WEEK 2: Code Review + Crypto Results

#### Recommendation 2.1: Comprehensive Code Review
**Status**: HIGH PRIORITY  
**Scope**: Security-critical features only (not entire codebase)

**Code Review Targets**:

1. **Duress PIN Implementation** (2 days)
   - PIN matching logic (constant-time comparison)
   - Session routing to decoy (atomic operation)
   - Egress hard-cut verification (zero backend calls)
   - Key isolation (decoy ≠ real wallet derivation)
   - Rate limiting on wrong PIN attempts
   - Failure modes (what if interrupt during session switch?)

2. **Audit Log Implementation** (1 day)
   - AES-256-GCM encryption/decryption correctness
   - Key derivation for log encryption
   - Entry sanitization (no mode/IP/device ID leakage)
   - Selective wipe atomicity
   - Round-trip test (encrypt → store → decrypt)

3. **Panic Wipe Implementation** (1 day)
   - **CRITICAL**: Key destruction order verification
     - Keys destroyed FIRST (before backup)
     - All keys destroyed (real, decoy, hidden)
     - Memory cleared (not just reassigned)
   - Irreversibility test (recovery must fail)
   - Interrupt safety (app killed during wipe = keys still destroyed)

**Effort**: 4 developer days (parallel with crypto audit)  
**Owner**: Senior security engineer  
**Deliverable**: Code review findings with remediations  
**Critical Success Factor**: Panic wipe key destruction order MUST be verified

---

#### Recommendation 2.2: Resolve Code Review Findings
**Status**: HIGH PRIORITY  
**Timeline**: Week 2 (after code review complete)

**Process**:
1. Triage findings by severity (Critical → Medium)
2. Critical findings: Fix immediately
3. High findings: Fix before Week 3
4. Medium findings: Fix before Week 4
5. Low findings: Post-mainnet acceptable

**Effort**: Variable (depends on findings)  
**Owner**: Engineering team  
**Deliverable**: All Critical/High findings resolved

---

#### Recommendation 2.3: Crypto Audit Integration
**Status**: HIGH PRIORITY  
**Timeline**: Week 2 (results from crypto review)

**Actions**:
1. **Receive crypto audit results**
   - If Go: Accept AES-256-GCM, document rationale
   - If No-Go: Plan reversion to XChaCha20-Poly1305 (+1 week)

2. **If accepting AES-256-GCM**:
   - Update design documentation
   - Add cryptographer sign-off to audit trail
   - Update threat model (timing attack mitigation)

3. **If reverting to XChaCha20**:
   - Plan implementation (add @noble or libsodium.js)
   - Update key derivation pipeline
   - Test end-to-end encryption/decryption
   - Extend timeline to Week 3-4

**Owner**: Security team + Engineering  
**Critical Success Factor**: Decision must be made by end of Week 2

---

### WEEK 3: Penetration Testing + Final Prep

#### Recommendation 3.1: Execute Full Penetration Test Suite
**Status**: HIGH PRIORITY  
**Timeline**: Week 3 (4-6 hours)

**Scope**: 6 coercion resistance scenarios, 74 atomic tests

**Test Scenarios**:
1. **Scenario 1**: Duress PIN Entry (14 tests)
   - Verify decoy indistinguishable from real
   - Confirm zero backend calls
   - Check no metadata leakage

2. **Scenario 2**: Decoy Fund Transfer (15 tests)
   - Transfer fails gracefully
   - Error message generic (no "decoy" indicator)
   - No blockchain footprint

3. **Scenario 3**: Panic Wipe (15 tests)
   - **CRITICAL**: Keys destroyed irreversibly
   - All PINs fail after wipe
   - Recovery impossible
   - Interrupt safety verified

4. **Scenario 4**: Stealth Wallet Reveal (12 tests)
   - Hidden wallet undetectable without PIN
   - Multi-chain atomic reveal
   - No address linkability

5. **Scenario 5**: Audit Log Deniability (17 tests)
   - Opt-in by default (OFF)
   - Encrypted entries (AES-256-GCM)
   - Non-fingerprinting (no mode indicators)

6. **Scenario 6**: Escape Paths (10 tests)
   - Panic accessible from any screen
   - Session timeout enforced
   - App-kill doesn't persist session

**Pass Criteria**:
- 🟢 **PASS**: All 6 scenarios pass (zero Critical findings)
- 🟡 **CONDITIONAL PASS**: 5/6 pass (1-2 High findings correctable)
- 🔴 **FAIL**: 3+ scenarios fail (fundamental deniability compromise)

**Effort**: 4-6 hours (1 tester)  
**Owner**: Security tester  
**Deliverable**: Penetration test report with PASS/CONDITIONAL PASS/FAIL verdict

---

#### Recommendation 3.2: Final Security Sign-Offs
**Status**: HIGH PRIORITY  
**Timeline**: End of Week 3

**Sign-Offs Required**:
1. **Security Team Lead**: All findings resolved, gates verified
2. **External Cryptographer**: AES-256-GCM approved (or path forward defined)
3. **Penetration Tester**: Test suite passed (74/74 tests)
4. **Code Reviewers**: All code review findings fixed

**Deliverable**: Audit completion certificate (signed off by all parties)

---

### WEEK 4: Mainnet Deployment Ready

#### Recommendation 4.1: Create Release Tag & Deployment Procedure
**Status**: MEDIUM PRIORITY  
**Timeline**: Week 4

**Actions**:
1. Create signed release tag
   - Format: `release-mainnet-ASSET-DATE`
   - Signed by security team lead
   - Include audit sign-off hash

2. Document mainnet activation procedure
   - Step-by-step instructions
   - Gate checks (all must pass)
   - Rollback plan (if needed)
   - Monitoring procedure (post-launch)

3. Train team on mainnet operations
   - How to activate mainnet for each asset
   - How to monitor post-launch
   - Incident response procedures
   - Rollback procedures

**Effort**: 2 days  
**Owner**: DevOps + Security  
**Deliverable**: Documented mainnet activation procedure

---

#### Recommendation 4.2: Pre-Mainnet Checklist
**Status**: MEDIUM PRIORITY  
**Timeline**: Week 4

**Must Pass Before Mainnet Flip**:
- [ ] CI ring-import enforcement: ACTIVE
- [ ] Mainnet deployment gate: IMPLEMENTED
- [ ] Crypto audit: APPROVED
- [ ] Code review: ALL findings fixed
- [ ] Penetration tests: ALL 6 scenarios PASS
- [ ] Security sign-offs: ALL obtained
- [ ] Release tag: CREATED
- [ ] Team trained: CONFIRMED

**Owner**: Project manager + Security lead  
**Deliverable**: Signed-off checklist (gate to mainnet)

---

## Secondary Recommendations (Post-Mainnet Acceptable)

### Phase 2: OS-Level RASP (Week 4-5, Post-Mainnet)
**Status**: HIGH PRIORITY (post-mainnet)  
**Current**: Browser-layer detection only (works, but limited)  
**Target**: OS-level native RASP via Capacitor plugin

**Recommendation**: Complete and audit OS-level RASP detection after mainnet launch. Browser-layer is sufficient for launch (threat model honest about limitation).

---

### Phase 3: Hardware-Backed Biometric (Week 5-6, Post-Mainnet)
**Status**: HIGH PRIORITY (post-mainnet)  
**Current**: App-layer biometric unlock (works, not hardware-backed)  
**Target**: Hardware ACL enforcement via Secure Enclave/TEE

**Recommendation**: Implement hardware-backed biometric after mainnet. Current app-layer approach is acceptable with design honesty about limitation.

---

### Phase 4: Per-Set Biometric 2FA (Week 6+, Post-Mainnet)
**Status**: MEDIUM PRIORITY (future)  
**Current**: Blocked by container-schema changes  
**Target**: Per-set passkey/biometric 2FA

**Recommendation**: Defer to post-mainnet audit cycle. Current device-global factor suppression in decoy/hidden modes is acceptable mitigation.

---

## Strategic Recommendations

### Recommendation S1: Establish Security Governance
**Action**: Create security oversight structure

**What to Do**:
1. Form security review board (3-5 people):
   - Security team lead
   - Engineering lead
   - External security advisor (post-mainnet)
   - Compliance/legal (if applicable)

2. Establish decision gates:
   - Code review approval (2+ reviewers)
   - Crypto audit approval (external expert)
   - Penetration test approval (pass/fail metric)
   - Mainnet flip approval (unanimous security board)

3. Document security policies:
   - CI enforcement requirements
   - Code review standards
   - Crypto vetting process
   - Incident response procedures

**Timeline**: Establish by Week 1 (before blockers fixed)  
**Owner**: Security team lead  
**Benefit**: Prevents future security regressions

---

### Recommendation S2: Post-Mainnet Audit Schedule
**Action**: Plan regular security audits

**What to Do**:
1. **Quarterly audits** (every 3 months):
   - Code review (new features)
   - Penetration testing (same 74 tests)
   - Threat model update

2. **Annual comprehensive audit** (yearly):
   - Full architectural review
   - Cryptographic peer review
   - Threat modeling refresh
   - Compliance audit

3. **Critical finding review** (immediately):
   - Any finding raised by security team
   - Any user-reported concern
   - Any threat intelligence alert

**Timeline**: Begin Q4 2026 (after mainnet stable)  
**Owner**: Security team lead  
**Budget**: $50K-100K annually (crypto audits + external review)

---

### Recommendation S3: Security Hardening Roadmap
**Action**: Plan future security enhancements

**Phase 1 (Mainnet Launch)**: ✅ Current focus
- Fix critical blockers
- Deploy coercion-resistant features
- Establish CI enforcement

**Phase 2 (Month 2-3)**: Post-mainnet
- Complete OS-level RASP
- Hardware-backed biometric
- Threat intelligence integration

**Phase 3 (Month 4-6)**: Post-mainnet
- Per-set 2FA
- Advanced fraud detection
- Supply chain security hardening

**Phase 4 (Month 6+)**: Long-term
- Hardware wallet integration
- Multi-sig support
- Custody options (if applicable)

---

## Risk Mitigation Recommendations

### Risk R1: Mainnet Launch Delays
**Risk**: Critical blockers take longer than 3-4 weeks to fix

**Mitigation**:
1. Start critical blockers in parallel (Day 1)
2. Assign dedicated team leads (not part-time)
3. Allocate buffer week in schedule
4. Weekly status reviews (track progress)
5. Escalate blockers immediately if delayed

**Owner**: Project manager  
**Trigger**: Week 1 if any blocker 50% behind schedule

---

### Risk R2: Crypto Audit Failure
**Risk**: External cryptographer recommends reverting to XChaCha20

**Mitigation**:
1. Plan reversion in parallel (contingency)
2. Have @noble/crypto library ready
3. Account for +1 week in timeline
4. Have fallback timeline (flip mainnet Week 5 instead of Week 4)

**Owner**: Engineering lead  
**Trigger**: If crypto audit says "no-go" on AES-256-GCM

---

### Risk R3: Penetration Test Failures
**Risk**: One or more test scenarios fail (deniability compromise found)

**Mitigation**:
1. Identify specific failure (which test, which scenario)
2. Determine root cause (code, design, or test issue)
3. Fix root cause (engineering fix)
4. Re-test (may extend timeline 1-2 weeks)
5. Escalate to mainnet delay if critical

**Owner**: Security team  
**Trigger**: If any test scenario FAILS (not conditional pass)

---

## Success Metrics & Gates

### Gate 1: Week 1 - Critical Blockers Complete ✅
**Pass Criteria**:
- [ ] CI ring-import rule implemented + verified
- [ ] Mainnet deployment gate implemented + tested
- [ ] Crypto audit underway (engagement confirmed)

**Owner**: Security + Engineering  
**Go/No-Go Decision**: Can proceed to Week 2 if all pass

---

### Gate 2: Week 2 - Code Review + Crypto Complete ✅
**Pass Criteria**:
- [ ] Code review findings documented
- [ ] All Critical/High findings fixed
- [ ] Crypto audit approved (or mitigation plan defined)

**Owner**: Security team  
**Go/No-Go Decision**: Can proceed to Week 3 if all pass

---

### Gate 3: Week 3 - Penetration Tests Pass ✅
**Pass Criteria**:
- [ ] 6/6 scenarios PASS (or 5/6 CONDITIONAL with plan)
- [ ] All findings documented
- [ ] Security sign-offs obtained

**Owner**: Security tester + Security lead  
**Go/No-Go Decision**: Can proceed to Week 4 if all pass

---

### Gate 4: Week 4 - Mainnet Deployment Ready ✅
**Pass Criteria**:
- [ ] All checklist items complete
- [ ] Release tag created + signed
- [ ] Team trained + ready
- [ ] Mainnet activation procedure documented

**Owner**: Project manager + Security lead  
**Go/No-Go Decision**: Approval to flip mainnet

---

## Summary: What to Do Now

### 📋 **Action Items for Today (2026-07-05)**

**By 5 PM**:
1. ✅ Leadership reviews STAKEHOLDER-PRESENTATION.md (20 min)
2. ✅ Leadership approves 3-4 week timeline (decision)
3. ✅ Security team lead reviews CRITICAL-FINDINGS-DEEP-DIVE.md (1 hour)
4. ✅ Security team assigns Week 1 leads:
   - CI enforcement lead (dedicated 4-5 days)
   - Mainnet gate lead (dedicated 5 days)
   - Crypto audit coordinator (1 week)

**By EOD Tomorrow (2026-07-06)**:
1. ✅ Engage external cryptographer (contract, timeline, scope)
2. ✅ Create security review board (schedule first meeting)
3. ✅ Create project plan (Gantt chart, resource allocation)
4. ✅ Announce timeline to team

**By End of Week (2026-07-07)**:
1. ✅ Week 1 critical blockers underway (50% complete by Friday)
2. ✅ Code review prep (identify reviewers, schedule)
3. ✅ Penetration test prep (identify tester, schedule Week 3)

---

## Final Recommendation

### 🎯 **PROCEED WITH CAUTION. DO NOT SKIP CRITICAL PATH.**

**Summary**:
- VEYRNOX has **strong architectural foundations** ✅
- **Three critical blockers** must be fixed before mainnet ⚠️
- **All blockers are fixable in 3-4 weeks** with dedicated effort 📅
- **Skip any blocker = unacceptable security risk** 🔴

**Recommendation**: Authorize 3-4 week critical path. Don't rush. The foundation is solid; verification just needs completion.

---

**Prepared by**: Claude Code Security Audit Team  
**Date**: 2026-07-05  
**Classification**: FOR STAKEHOLDER REVIEW

