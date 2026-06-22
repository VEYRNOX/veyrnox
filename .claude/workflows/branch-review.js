export const meta = {
  name: 'branch-review',
  description: 'Review the current branch vs main across Veyrnox dimensions, adversarially verifying each finding before reporting',
  phases: [
    { title: 'Review', detail: 'one reviewer per dimension' },
    { title: 'Verify', detail: 'adversarially confirm each finding is real' },
  ],
}

// Each dimension is reviewed independently, then each of its findings is adversarially
// verified — a pipeline (no barrier), so a dimension's findings start verifying the moment
// that dimension's review returns.
const DIMENSIONS = [
  {
    key: 'correctness',
    prompt:
      'Review the current git branch against main. First run `git fetch origin` then ' +
      '`git diff origin/main...HEAD`. Judge CORRECTNESS only: bugs, scope creep, dead code, ' +
      'silently-swallowed failures, and tests that assert nothing real. Return concrete findings with file:line.',
  },
  {
    key: 'security-honesty',
    prompt:
      'Review the current branch diff (`git diff origin/main...HEAD`) against the Veyrnox HONESTY + SECURITY bar. ' +
      'Flag: anything claiming "verified" or asset `status: live` WITHOUT a real user-supplied on-chain testnet ' +
      'txid; mocked/stubbed security dressed up as real (it must be honest-disabled instead); an internal audit ' +
      'presented as independent; new network calls on a deniability path; rendering wallet count/list; keys or ' +
      'data leaving the device. Return findings with file:line.',
  },
  {
    key: 'design-system',
    prompt:
      'Review the current branch diff (`git diff origin/main...HEAD`) against the Veyrnox design system: ' +
      'hardcoded hex instead of tokens (`hsl(var(--token))` / Tailwind token classes), a second accent color ' +
      'besides teal #4ADAC2, prose not in Schibsted Grotesk, or verifiable values not in IBM Plex Mono. ' +
      'Return findings with file:line.',
  },
  {
    key: 'a11y',
    prompt:
      'Review the current branch diff (`git diff origin/main...HEAD`) for accessibility: inputs without labels, ' +
      'icon-only controls without accessible names, missing focus states, and controls that are not ' +
      'keyboard-operable. Return findings with file:line.',
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

const results = await pipeline(
  DIMENSIONS,
  (d) =>
    agent(d.prompt, {
      label: `review:${d.key}`,
      phase: 'Review',
      schema: FINDINGS_SCHEMA,
      agentType: 'veyrnox-honest-reviewer',
    }),
  (review, d) =>
    parallel(
      (review.findings || []).map((f) => () =>
        agent(
          `Adversarially verify this ${d.key} finding from a Veyrnox review. Try to REFUTE it; ` +
            `default to isReal=false if you cannot confirm it directly from the actual code.\n` +
            `Title: ${f.title}\nLocation: ${f.file}\nEvidence: ${f.evidence || '(none given)'}`,
          { label: `verify:${d.key}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        ).then((v) => ({ ...f, dimension: d.key, verdict: v }))
      )
    )
)

const confirmed = results.flat().filter(Boolean).filter((f) => f.verdict && f.verdict.isReal)
log(`${confirmed.length} confirmed finding(s) across ${DIMENSIONS.length} dimensions`)
return { confirmed }
