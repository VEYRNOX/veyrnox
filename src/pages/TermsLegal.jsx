// pages/TermsLegal.jsx
//
// TERMS / LEGAL — a static reference screen reachable from Settings. It
// consolidates the app's legal surface (terms of use, disclaimers, and the
// honest limits of the coercion features) in one place, mirroring the public
// website at https://veyrnox.com/terms.
//
// DELIBERATELY NOT an acceptance gate. Nothing here is written to disk: no
// acceptance flag, no per-set state, no onboarding prompt. Because nothing is
// stored, the screen renders identically in real and decoy sessions (I3 — no
// deniability surface, no flag a forensic dump or coercer could read). It is a
// content page, not a storage feature. If a future version ever needs to persist
// "user has seen terms", that is a SEPARATE, counsel-gated decision — not this
// screen.

import { useState } from "react";
import { Scale, FileText, AlertTriangle, EyeOff, ShieldCheck, ExternalLink, ChevronDown } from "lucide-react";
import BackButton from "@/components/BackButton";

const PRIVACY_POLICY_URL = "https://veyrnox.com/privacy";
const TERMS_URL = "https://veyrnox.com/terms";
const CONTACT_EMAIL = "legal@veyrnox.com";

function Section({ icon: Icon, title, children }) {
  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

function TermsSection({ number, title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        className="w-full flex items-center justify-between py-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-xs font-medium">
          <span className="text-muted-foreground mr-1.5">{number}.</span>
          {title}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="text-xs text-muted-foreground leading-relaxed space-y-2 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default function TermsLegal() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <BackButton />

      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Scale className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Terms &amp; legal</h1>
          <p className="text-sm text-muted-foreground">
            Terms, disclosures, and the honest limits — in one place, for reference.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* §0 — Privacy policy */}
        <Section icon={ShieldCheck} title="Privacy policy">
          <p>
            The <b>privacy policy</b> for <strong>VEYRNOX</strong> is published at
            {" "}
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm inline-flex items-center gap-1"
            >
              {PRIVACY_POLICY_URL}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            . It is the same URL published on the Google Play and App Store listings — a single
            authoritative source, updated in one place.
          </p>
        </Section>

        {/* §A — Terms of Service (live, from veyrnox.com/terms) */}
        <Section icon={FileText} title="Terms of Service">
          <p className="font-medium">
            Last updated: 28 June 2026.{" "}
            <a
              href={TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm inline-flex items-center gap-1"
            >
              View on veyrnox.com
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </p>
          <p className="font-semibold text-foreground">
            Veyrnox is a non-custodial wallet. We never hold your keys or assets. You are solely
            responsible for the security of your Seed Phrase and private keys. Loss of these
            credentials means permanent, irrecoverable loss of your digital assets — Veyrnox
            cannot help you recover them.
          </p>

          <div className="mt-2 rounded-lg border border-border bg-secondary/30 px-4 py-1">
            <TermsSection number={1} title="Agreement to Terms">
              <p>
                By downloading, installing, accessing, or using Veyrnox (&ldquo;App&rdquo;, &ldquo;Services&rdquo;, or
                &ldquo;Veyrnox&rdquo;), you confirm that (i) you have read and understood these Terms of Service
                (&ldquo;Terms&rdquo;), (ii) you agree to be legally bound by these Terms, and (iii) you are legally
                permitted to enter into this agreement in your jurisdiction.
              </p>
              <p>
                If you do not agree to these Terms, or any future amendments we make to them, you must
                immediately discontinue your use of the Services.
              </p>
              <p className="font-semibold text-foreground uppercase">
                Veyrnox does not provide financial, investment, tax, or legal advice. Veyrnox is a
                technology tool only. Any decision to acquire, hold, transfer, or manage digital assets
                is made solely by you. You assume full responsibility for all such decisions and their
                outcomes.
              </p>
            </TermsSection>

            <TermsSection number={2} title="Nature of the Service — Non-Custodial Wallet">
              <p>
                Veyrnox is a non-custodial, self-custody digital asset wallet application. This means:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>You, and only you, generate and hold your private keys and Secret Recovery Phrase (&ldquo;Seed Phrase&rdquo;) on your own device.</li>
                <li>Veyrnox never has access to, stores, transmits, or retains your private keys, Seed Phrase, wallet password, or unencrypted key material at any time.</li>
                <li>Veyrnox never holds, controls, or has custody of your digital assets. Your assets exist solely on the relevant blockchain network.</li>
                <li>All transactions are broadcast directly to the applicable blockchain network. Veyrnox acts only as a local interface to help you construct and sign transactions — it does not process, clear, or settle any transaction on your behalf.</li>
              </ul>
              <p>
                Because Veyrnox is a non-custodial wallet, Veyrnox bears absolutely no responsibility or
                liability for any digital assets held in, sent from, or received into any wallet created
                or managed using the App. If you lose access to your private key or Seed Phrase, your
                assets are permanently and irreversibly inaccessible. Veyrnox has no technical means to
                recover them for you.
              </p>
            </TermsSection>

            <TermsSection number={3} title="Your Responsibility for Keys & Seed Phrases">
              <p>
                Your private key and Seed Phrase are the sole proof of ownership of your digital assets.
                You bear exclusive, non-delegable responsibility for:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Generating, storing, and protecting your Seed Phrase securely and offline.</li>
                <li>Maintaining encrypted backups of your private key material.</li>
                <li>Ensuring no unauthorised person gains access to your device, Seed Phrase, or PIN.</li>
                <li>Verifying the accuracy of every recipient address before signing and broadcasting any transaction. Blockchain transactions are final and irreversible — Veyrnox cannot cancel, reverse, or modify any transaction once it has been signed and broadcast.</li>
              </ul>
              <p>Veyrnox expressly disclaims all liability for any loss of digital assets resulting from:</p>
              <ul className="list-[lower-alpha] pl-4 space-y-1">
                <li>your failure to preserve your Seed Phrase or private key,</li>
                <li>sharing your credentials with any third party,</li>
                <li>malware, phishing, or social-engineering attacks on your device,</li>
                <li>errors in recipient addresses entered by you,</li>
                <li>loss, theft, or damage to your device,</li>
                <li>any force majeure event, or</li>
                <li>any other circumstance outside Veyrnox&apos;s direct control.</li>
              </ul>
            </TermsSection>

            <TermsSection number={4} title="Eligibility">
              <p>To use Veyrnox you must:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Be at least 18 years of age (or the age of legal majority in your jurisdiction, whichever is higher) and have the legal capacity to enter into binding agreements.</li>
                <li>Not be located in, a resident of, or an entity established in any jurisdiction subject to comprehensive sanctions by the United Kingdom, the United States, the European Union, or the United Nations, including but not limited to Cuba, Iran, North Korea, Syria, and the Donetsk, Luhansk, and Crimea regions of Ukraine.</li>
                <li>Not appear on any government-maintained sanctions or prohibited-persons list, including OFAC&apos;s SDN list, the UK HM Treasury Consolidated List, or equivalent EU or UN lists.</li>
                <li>Only use the Services in accordance with the laws and regulations applicable in your jurisdiction. It is your responsibility to determine whether your use of Veyrnox is lawful where you reside.</li>
                <li>Only use legally obtained funds and digital assets that rightfully belong to you.</li>
              </ul>
              <p>
                Veyrnox reserves the right to restrict or terminate access to the Services for any user
                at any time, without prior notice, if we reasonably believe eligibility requirements are
                not met or applicable law requires it.
              </p>
            </TermsSection>

            <TermsSection number={5} title="Permitted Use & Prohibited Conduct">
              <p>You may use Veyrnox solely for lawful purposes. You agree not to:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Use the Services to launder money, finance terrorism, evade sanctions, or engage in any other illegal financial activity.</li>
                <li>Attempt to reverse-engineer, decompile, disassemble, or otherwise derive the source code of the App.</li>
                <li>Use automated tools, bots, scrapers, or scripts to interact with the App in any unauthorised manner.</li>
                <li>Introduce malware, viruses, or other harmful code into the App or associated systems.</li>
                <li>Impersonate Veyrnox, its team, or any other person in connection with the Services.</li>
                <li>Use the App in any way that could damage, disable, overburden, or impair the App or interfere with any other party&apos;s use of the Services.</li>
                <li>Circumvent or attempt to circumvent any security feature of the App.</li>
              </ul>
              <p>
                Any breach of these prohibitions may result in immediate termination of your access to the
                Services and may be reported to relevant law-enforcement authorities.
              </p>
            </TermsSection>

            <TermsSection number={6} title="Blockchain & Digital Asset Risks">
              <p>You acknowledge and accept that:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Digital assets are highly volatile. Their value can fall to zero rapidly and without warning. Veyrnox makes no representation regarding the value, suitability, or future performance of any digital asset.</li>
                <li>Blockchain networks operate on a decentralised, peer-to-peer basis. Veyrnox has no ability to reverse, cancel, or modify any transaction that has been broadcast to a blockchain network.</li>
                <li>Network congestion, protocol upgrades (&ldquo;hard forks&rdquo;), or validator/miner failures can delay, fail, or permanently lose transactions. Veyrnox is not responsible for any such outcomes.</li>
                <li>Smart contracts and third-party protocols that you interact with may contain bugs or vulnerabilities. Veyrnox does not audit, endorse, or guarantee any external protocol.</li>
                <li>Regulatory changes by any government may adversely affect the legality, value, or usability of digital assets. You are solely responsible for monitoring and complying with any such changes in your jurisdiction.</li>
                <li>Cybersecurity threats — including phishing, SIM-swapping, malware, and supply-chain attacks — are inherent risks of operating in the digital asset space. Veyrnox implements industry-standard security measures but cannot guarantee that the App or your device will be free from such threats.</li>
              </ul>
            </TermsSection>

            <TermsSection number={7} title="Privacy">
              <p>
                The manner in which Veyrnox collects, processes, and protects your personal data is
                described in our Privacy Policy, which is incorporated into these Terms by reference. By
                using the Services, you acknowledge that you have read and agree to our Privacy Policy.
              </p>
              <p>
                Because Veyrnox is a non-custodial wallet, we do not store your private keys, Seed
                Phrase, transaction history, or wallet balances on our servers. On-chain data
                (transactions, addresses, balances) is publicly visible on the relevant blockchain and is
                not within Veyrnox&apos;s control.
              </p>
            </TermsSection>

            <TermsSection number={8} title="Intellectual Property">
              <p>
                All intellectual property rights in and to the Veyrnox App, its design, branding, source
                code, documentation, and related materials are owned by or licensed to Veyrnox. Nothing
                in these Terms transfers any intellectual property rights to you.
              </p>
              <p>
                Subject to your compliance with these Terms, Veyrnox grants you a limited, non-exclusive,
                non-transferable, revocable licence to use the App on your personal device solely for the
                purposes described herein. This licence does not permit you to copy, modify, distribute,
                sublicence, or sell any portion of the App.
              </p>
            </TermsSection>

            <TermsSection number={9} title="Updates to the App & Terms">
              <p>
                Veyrnox reserves the right to update, modify, suspend, or discontinue any part of the
                Services at any time and without prior notice. We may also update these Terms at any
                time. When we do, we will update the &ldquo;Last Updated&rdquo; date at the top of this page and,
                where appropriate, notify you via the App or by other reasonable means.
              </p>
              <p>
                Your continued use of the Services after any change to these Terms constitutes your
                acceptance of the revised Terms. If you do not agree to the updated Terms, you must stop
                using the Services immediately.
              </p>
            </TermsSection>

            <TermsSection number={10} title="Disclaimer of Warranties">
              <p className="uppercase font-semibold text-foreground">
                To the fullest extent permitted by applicable law, Veyrnox and its officers, directors,
                employees, and affiliates provide the Services on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis
                without any warranties of any kind, whether express, implied, or statutory.
              </p>
              <p className="uppercase font-semibold text-foreground">
                Veyrnox specifically disclaims all implied warranties of merchantability, fitness for a
                particular purpose, title, and non-infringement. Veyrnox does not warrant that the App
                will be uninterrupted, error-free, secure, or free from viruses or other harmful
                components. Veyrnox does not warrant that any information displayed in the App is
                accurate, complete, or up to date.
              </p>
              <p className="uppercase font-semibold text-foreground">
                No advice or information, whether oral or written, obtained from Veyrnox or through the
                Services shall create any warranty not expressly made herein.
              </p>
            </TermsSection>

            <TermsSection number={11} title="Limitation of Liability">
              <p className="uppercase font-semibold text-foreground">
                To the maximum extent permitted by applicable law, in no event shall Veyrnox, its
                affiliates, officers, directors, employees, agents, or licensors be liable for any:
              </p>
              <ul className="list-[lower-alpha] pl-4 space-y-1 uppercase font-semibold text-foreground">
                <li>indirect, incidental, special, consequential, punitive, or exemplary damages;</li>
                <li>loss of profits, revenue, business, or goodwill;</li>
                <li>loss of data or digital assets;</li>
                <li>cost of substitute goods or services;</li>
                <li>any claim arising from unauthorised access to your wallet or private key,</li>
              </ul>
              <p className="uppercase font-semibold text-foreground">
                arising out of or in connection with these Terms or your use of or inability to use the
                Services, regardless of whether Veyrnox has been advised of the possibility of such
                damages and regardless of the theory of liability (tort, contract, or otherwise).
              </p>
              <p className="uppercase font-semibold text-foreground">
                Where liability cannot be excluded by law, Veyrnox&apos;s total aggregate liability to you
                shall not exceed the greater of (i) the amount you have paid to Veyrnox in the twelve
                (12) months immediately preceding the event giving rise to the claim, or (ii) one
                hundred pounds sterling (&pound;100).
              </p>
              <p className="uppercase font-semibold text-foreground">
                Because Veyrnox is a non-custodial wallet and never holds or controls your digital
                assets or private keys, Veyrnox cannot and does not accept any liability for the loss,
                theft, or destruction of your digital assets for any reason whatsoever.
              </p>
            </TermsSection>

            <TermsSection number={12} title="Indemnification">
              <p>
                You agree to defend, indemnify, and hold harmless Veyrnox and its affiliates, officers,
                directors, employees, and agents from and against any claims, liabilities, damages,
                losses, costs, and expenses (including reasonable legal fees) arising out of or in
                connection with:
              </p>
              <ul className="list-[lower-alpha] pl-4 space-y-1">
                <li>your use or misuse of the Services;</li>
                <li>your breach of these Terms or any applicable law or regulation;</li>
                <li>your infringement of any third-party rights; or</li>
                <li>any transaction you initiate, sign, or broadcast using the App.</li>
              </ul>
            </TermsSection>

            <TermsSection number={13} title="Termination">
              <p>
                These Terms remain in effect for as long as you use the Services. You may stop using the
                Services at any time by uninstalling the App from your device.
              </p>
              <p>
                Veyrnox may restrict, suspend, or terminate your access to the Services at any time,
                with or without cause and with or without notice, including if we reasonably believe you
                have breached these Terms or applicable law.
              </p>
              <p>
                Upon termination for any reason, the following sections shall survive: Section 3 (Key
                Responsibility), Section 8 (Intellectual Property), Section 10 (Disclaimer of
                Warranties), Section 11 (Limitation of Liability), Section 12 (Indemnification), and
                Section 14 (Governing Law &amp; Dispute Resolution).
              </p>
              <p>
                Because Veyrnox does not hold your private keys, termination of your account does not
                affect your ability to access your digital assets directly via the blockchain, provided
                you have retained your private key and Seed Phrase.
              </p>
            </TermsSection>

            <TermsSection number={14} title="Governing Law & Dispute Resolution">
              <p>
                These Terms shall be governed by and construed in accordance with the laws of England
                and Wales, without regard to its conflict-of-law provisions.
              </p>
              <p>
                Any dispute, controversy, or claim arising out of or in connection with these Terms or
                your use of the Services shall be subject to the exclusive jurisdiction of the courts of
                England and Wales.
              </p>
              <p>
                Nothing in this section shall prevent Veyrnox from seeking injunctive or other equitable
                relief in any court of competent jurisdiction to protect its intellectual property or
                confidential information.
              </p>
            </TermsSection>

            <TermsSection number={15} title="General Provisions">
              <p>
                <b>Entire Agreement.</b> These Terms, together with the Privacy Policy, constitute the
                entire agreement between you and Veyrnox with respect to the Services and supersede all
                prior agreements, representations, and understandings.
              </p>
              <p>
                <b>Severability.</b> If any provision of these Terms is found to be unenforceable or
                invalid, that provision shall be limited or eliminated to the minimum extent necessary so
                that the remaining provisions remain in full force and effect.
              </p>
              <p>
                <b>No Waiver.</b> Veyrnox&apos;s failure to enforce any right or provision of these Terms
                shall not be deemed a waiver of such right or provision.
              </p>
              <p>
                <b>Assignment.</b> You may not assign or transfer these Terms or any rights hereunder
                without Veyrnox&apos;s prior written consent. Veyrnox may assign these Terms freely.
              </p>
              <p>
                <b>Force Majeure.</b> Veyrnox shall not be liable for any failure or delay in
                performance of its obligations caused by circumstances beyond its reasonable control,
                including but not limited to blockchain network failures, internet outages, natural
                disasters, government action, or cyberattacks.
              </p>
              <p>
                <b>Contact.</b> If you have any questions about these Terms, please contact us at{" "}
                {CONTACT_EMAIL}.
              </p>
            </TermsSection>
          </div>
        </Section>

        {/* §B — Not financial advice (now live content from the website terms §1 + §6) */}
        <Section icon={AlertTriangle} title="Not financial advice / use at your own risk">
          <p>
            Veyrnox does not provide financial, investment, tax, or legal advice. Veyrnox is a
            technology tool only. Any decision to acquire, hold, transfer, or manage digital assets
            is made solely by you. You assume full responsibility for all such decisions and their
            outcomes.
          </p>
          <p>
            Digital assets are highly volatile. Their value can fall to zero rapidly and without
            warning. Veyrnox makes no representation regarding the value, suitability, or future
            performance of any digital asset. Blockchain transactions are final and irreversible.
          </p>
        </Section>

        {/* §D — Honest limits of the coercion features (condensed reference copy) */}
        <Section icon={EyeOff} title="Honest limits of the coercion features">
          <p>
            The duress, stealth, and panic-wipe features are real but bounded. The same honest
            limits are shown inline where you set each one up; this is a <b>reference copy</b> in
            one place, not a replacement.
          </p>
          <ul className="list-disc pl-4 space-y-1.5">
            <li>
              <b>Duress / decoy</b> is runtime deniability, <b>not hidden-volume storage</b>: a
              forensic inspection of device storage can reveal a <b>second vault</b> exists.
            </li>
            <li>
              <b>Stealth / hidden wallets</b> hide a wallet in the app, <b>not on-chain</b>: every
              address stays public — anyone who knows one can see its balance and history on a{" "}
              <b>block explorer</b>.
            </li>
            <li>
              <b>Panic wipe</b> destroys the local device copy only. It <b>protects the device,
              not the seed</b> — a seed backup held elsewhere still recovers the wallet, and
              on-chain history stays public regardless.
            </li>
          </ul>
        </Section>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        This is a reference screen. Nothing on it is saved to your device, and it reads the same
        on every device — there is no record of whether you have viewed it.
      </p>
    </div>
  );
}
