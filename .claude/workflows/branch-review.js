export const meta = {
  name: 'branch-review',
  description: 'Review an explicitly-named branch vs main across Veyrnox dimensions, adversarially verifying each finding before reporting',
  phases: [
    { title: 'Review', detail: 'one reviewer per dimension' },
    { title: 'Verify', detail: 'adversarially confirm each finding is real' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// THE TARGET IS AN ARGUMENT. It is never "the current branch".
//
// Every prompt in this file used to say "review the current git branch" and
// `git diff origin/main...HEAD` with no directory, so each subagent inherited the
// session's cwd — the SHARED primary checkout, which typically has ~10 worktrees
// live and is usually parked on a detached HEAD or an unrelated feature branch.
// The workflow therefore reviewed whatever the last session happened to leave
// there. On 2026-08-07 that spent 29 agents and 2.4M tokens reviewing a stale
// branch nobody asked about, while the PR it was invoked for went unexamined —
// reproducing at scale the exact failure the scheduled task's own Step 0 exists
// to prevent, and silently, because a review of the wrong branch still returns
// confident, well-formed findings.
//
// `args` is now REQUIRED and the workflow throws without it. That is deliberate:
// a loud failure costs one run, a silent wrong-target review costs a full budget
// AND produces a report that reads exactly like a correct one. Fail closed (I4).
//
//   Workflow({ name: 'branch-review', args: {
//     worktree: 'C:/.../veyrnox-branch-review',  // REQUIRED — a snapshot worktree
//     targetRef: 'fix/some-branch',              // optional, for labelling only
//     baseRef:   'origin/main',                  // optional, defaults as shown
//   }})
//
// Pass a read-only snapshot worktree, never the primary checkout. Cut one with:
//   git worktree add "$TEMP/veyrnox-branch-review" --detach origin/<branch>
// ─────────────────────────────────────────────────────────────────────────────

const raw = typeof args === 'string' ? { worktree: args } : (args || {})
const WORKTREE = raw.worktree || raw.cwd
const BASE = raw.baseRef || 'origin/main'
const TARGET = raw.targetRef || 'HEAD'

if (!WORKTREE) {
  throw new Error(
    'branch-review: `args.worktree` is required — an absolute path to a snapshot worktree of the branch under review. ' +
    'Refusing to fall back to the session cwd: that is the shared primary checkout, whose HEAD belongs to whichever ' +
    'session touched it last, and reviewing it produces a confident report about the wrong branch. ' +
    'Create one with: git worktree add "$TEMP/veyrnox-branch-review" --detach origin/<branch>'
  )
}

// Prepended to EVERY prompt, reviewers and verifiers alike. The verifiers need it
// just as much: in the 2026-08-07 run they re-derived their own facts from the
// shared checkout and "confirmed" findings against a tree the reviewer never saw.
const SCOPE =
  `You are reviewing ONE specific branch. Do NOT use the session's working directory, and do NOT ` +
  `run bare git commands that resolve against it.\n\n` +
  `  Repository path : ${WORKTREE}\n` +
  `  Branch under review : ${TARGET}\n` +
  `  Base : ${BASE}\n\n` +
  `Run every git command with an explicit -C, e.g.:\n` +
  `  git -C "${WORKTREE}" diff ${BASE}...HEAD\n` +
  `  git -C "${WORKTREE}" diff ${BASE}...HEAD --stat\n` +
  `Read files from that path only. If a path you want to cite is not inside ${WORKTREE}, it is NOT ` +
  `part of this review — drop it rather than reporting it. Cite file:line as repo-relative paths.\n\n` +
  `Scope is the DIFF, not the repository: a pre-existing issue on ${BASE} is out of scope unless this ` +
  `branch's diff touches it. Say so explicitly when a dimension has no findings — an empty result is a ` +
  `valid and useful answer, and inventing findings to look thorough is worse than none.\n\n`

// Each dimension is reviewed independently, then each of its findings is adversarially
// verified — a pipeline (no barrier), so a dimension's findings start verifying the moment
// that dimension's review returns.
const DIMENSIONS = [
  {
    key: 'correctness',
    prompt:
      'Judge CORRECTNESS only: bugs, scope creep, dead code, silently-swallowed failures, ' +
      'and tests that assert nothing real (vacuous matchers, assertions on behaviour a disabled ' +
      'flag makes unreachable, tests edited to describe a defect rather than guard against it). ' +
      'Return concrete findings with file:line.',
  },
  {
    key: 'security-honesty',
    prompt:
      'Judge against the Veyrnox HONESTY + SECURITY bar. ' +
      'Flag: anything claiming "verified" or asset `status: live` WITHOUT a real user-supplied on-chain testnet ' +
      'txid; mocked/stubbed security dressed up as real (it must be honest-disabled instead); an internal audit ' +
      'presented as independent; new network calls on a deniability path; rendering wallet count/list; keys or ' +
      'data leaving the device; raw internal error text reaching user-facing copy. Return findings with file:line.',
  },
  {
    key: 'design-system',
    prompt:
      'Judge against the Veyrnox design system: ' +
      'hardcoded hex instead of tokens (`hsl(var(--token))` / Tailwind token classes), a second accent color ' +
      'besides teal #4ADAC2, prose not in Schibsted Grotesk, or verifiable values not in `.mono-value` ' +
      '(IBM Plex Mono — note `font-mono tabular-nums` is NOT equivalent; it misses the slashed zero and ' +
      'letter-spacing). If the diff adds no markup or styles, say so and return no findings. ' +
      'Return findings with file:line.',
  },
  {
    key: 'a11y',
    prompt:
      'Judge ACCESSIBILITY: inputs without labels, icon-only controls without accessible names, missing focus ' +
      'states, controls that are not keyboard-operable, and async state changes on safety-critical surfaces ' +
      'that land with no live region to announce them. Return findings with file:line.',
  },
]

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'file', 'severity'],
        properties: {
          title: { type: 'string' },
          file: { type: 'string', description: 'file:line' },
          severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
          evidence: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['isReal', 'reason'],
  properties: {
    isReal: { type: 'boolean' },
    reason: { type: 'string' },
  },
}

log(`branch-review: ${TARGET} vs ${BASE} in ${WORKTREE}`)

const results = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(SCOPE + d.prompt, {
      label: `review:${d.key}`,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
      agentType: 'veyrnox-honest-reviewer',
    }),
  (review, d) =>
    parallel(
      ((review && review.findings) || []).map((f) => () =>
        agent(
          SCOPE +
            `Adversarially verify this ${d.key} finding from a Veyrnox review. Try to REFUTE it; ` +
            `default to isReal=false if you cannot confirm it directly from the actual code at the path above.\n` +
            `A finding whose cited file is outside ${WORKTREE}, or which the diff does not touch, is NOT real ` +
            `regardless of whether the underlying observation is accurate.\n` +
            `Title: ${f.title}\nLocation: ${f.file}\nEvidence: ${f.evidence || '(none given)'}`,
          { label: `verify:${d.key}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        ).then((v) => ({ ...f, dimension: d.key, verdict: v }))
      )
    )
)

const confirmed = results.flat().filter(Boolean).filter((f) => f.verdict && f.verdict.isReal)
log(`${confirmed.length} confirmed finding(s) across ${DIMENSIONS.length} dimensions`)
return { target: TARGET, base: BASE, worktree: WORKTREE, confirmed }
