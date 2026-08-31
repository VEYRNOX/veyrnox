# Audit Funding Outreach Drafts

Date: 2026-08-21

This memo captures practical outreach guidance and send-ready draft text for:

- OSTIF
- Ethereum Foundation / ESP
- OpenSSF / Alpha-Omega

The goal is to present Veyrnox honestly as a high-risk open-source wallet project that would benefit from an independent security review, without overstating verification status or widening scope unnecessarily.

## Positioning Guidance

Lead with:

- local vault cryptography
- seed and key custody
- signing and transaction safety
- authentication and recovery boundaries

Mention carefully:

- Personal Backup / sharded recovery as a security-critical recovery design

Do not overclaim:

- Personal Backup is authorized to proceed ahead of the independent audit, but it is not to be presented as verified or fully de-risked
- internal reviews are not to be described as independent audits
- code-complete is not verification

Usually leave out of first outreach:

- AI features, unless the AI directly affects a security boundary under review

Recommended one-line feature framing:

> Key areas of interest include local vault cryptography, seed and key protection, signing and transaction safety, and recovery mechanisms including our sharded backup design.

## Recommended Contact Order

1. OSTIF
2. Ethereum Foundation / ESP
3. OpenSSF / Alpha-Omega

Rationale:

- OSTIF is the clearest direct fit for an open-source project seeking an audit
- Ethereum Foundation can be a fit if the scope is framed as Ethereum ecosystem security and public-good work
- OpenSSF / Alpha-Omega appears more selective and infrastructure-oriented, and may be more realistic through a partner route such as OSTIF

## Contacts

Current public contacts checked on 2026-08-21:

- OSTIF: `contactus@ostif.org`
- OSTIF project/sponsorship inquiry: `derek@ostif.org`
- OpenSSF general: `support@openssf.org`
- Ethereum Foundation / ESP: use the official application or office-hours forms rather than guessing an email

## Draft: OSTIF

To: `contactus@ostif.org`
CC: `derek@ostif.org`
Subject: Open-source wallet audit inquiry for Veyrnox

Hi OSTIF team,

I’m reaching out about a possible security audit engagement for **Veyrnox**, an open-source self-custody wallet focused on coercion resistance, local key custody, and fail-closed security behavior.

Veyrnox handles seed material, signing flows, local vault protection, wallet recovery boundaries, and security-sensitive authentication logic. We are also developing a sharded recovery design for Personal Backup, which makes the storage and recovery surfaces especially high consequence. Because failures in wallet software can directly and permanently harm users, we believe an independent audit would be valuable both for the project and for the broader open-source wallet ecosystem.

We would be interested in a scoped review of areas such as:

- wallet-core cryptographic and key-management logic
- local vault and secret-storage architecture
- signing and transaction safety
- authentication and recovery flows
- security boundaries around local custody and fail-closed behavior
- recovery mechanisms, including our sharded backup design

We’d appreciate a conversation about whether Veyrnox looks like a fit for OSTIF’s process. If direct funding is not available, we would also be interested in whether OSTIF could help identify sponsors or partner funding routes.

Happy to share the repository, architecture notes, threat-model context, and a proposed audit scope.

Best,
[Name]
[Role / Project]
[GitHub or repo link]
[Contact info]

## Draft: Ethereum Foundation / ESP

Use: `https://esp.ethereum.foundation/applicants/office-hours/apply`

Suggested subject:

Open-source Ethereum wallet security public-good inquiry

Hi ESP team,

I’m reaching out about **Veyrnox**, an open-source self-custody wallet with a strong focus on user safety, privacy, and fail-closed security design.

We believe there may be a public-good angle for Ethereum in supporting a targeted security review of Ethereum-related components and patterns within the project, such as signing safety, transaction authorization UX security, WalletConnect-facing security boundaries, and reusable open-source wallet-security practices.

Veyrnox also includes security-critical local vault and recovery architecture, including a sharded Personal Backup design. While the project is application-facing, we think the security lessons and hardening outputs from this work could be useful beyond one wallet implementation, especially for open-source Ethereum builders working on safe custody and signing flows.

We understand ESP prioritizes open-source public goods that strengthen Ethereum’s foundations, so we wanted to ask whether a narrowly scoped wallet-security effort of this kind could be in scope, or whether there is a better Ethereum Foundation-aligned path for audit support.

If helpful, we can share the repository, a proposed scope, and details on how the work could produce ecosystem-beneficial outputs beyond the app itself.

Best,
[Name]
[Role / Project]
[GitHub or repo link]
[Contact info]

## Draft: OpenSSF / Alpha-Omega

To: `support@openssf.org`
Subject: Open-source wallet security funding fit inquiry

Hi OpenSSF team,

I’m reaching out to ask whether **Veyrnox**, an open-source self-custody wallet, could be relevant to OpenSSF or Alpha-Omega security funding priorities, or whether there is a more appropriate partner route for a project like this.

Veyrnox focuses on local custody, vault protection, signing safety, privacy-sensitive flows, and fail-closed security behavior. It also includes high-risk recovery design work, including sharded backup logic for Personal Backup. Because wallet software directly protects user assets and secret material, we believe an independent security review could produce both project-specific risk reduction and broader ecosystem lessons for open-source wallet security.

We realize OpenSSF and Alpha-Omega often prioritize critical open-source infrastructure, so a quick fit check would be extremely helpful. If Veyrnox is not a direct fit, we’d appreciate guidance on whether this is better pursued through a partner such as OSTIF or another funding channel.

Happy to share the repository, architecture context, and a proposed audit scope.

Best,
[Name]
[Role / Project]
[GitHub or repo link]
[Contact info]

## Optional Shorter Founder-Style OSTIF Version

Subject: Audit inquiry for Veyrnox

Hi OSTIF team,

I’m reaching out about **Veyrnox**, an open-source self-custody wallet focused on local key custody, coercion resistance, and fail-closed security design.

We’d like to explore whether Veyrnox could be a fit for an OSTIF-coordinated security audit. Key areas of interest include local vault cryptography, seed and key protection, signing and transaction safety, authentication and recovery flows, and our sharded backup design for Personal Backup.

If Veyrnox is potentially in scope, I’d be glad to share the repo, architecture notes, and a proposed audit scope. If direct funding is not available, we’d also appreciate any guidance on sponsor or partner funding routes.

Best,
[Name]
[Contact info]
