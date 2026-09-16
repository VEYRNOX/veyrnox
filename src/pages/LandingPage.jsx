// @ts-nocheck
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Shield, Smartphone, Lock, Zap, Eye, ArrowRight,
  CheckCircle2, Bell, BarChart3, Key, Menu, X,
  Sparkles, Bot, WifiOff, FileSearch, ArrowUp
} from "lucide-react";

// The public docs are a STATIC file in public/ — not the in-app /docs route.
// /landing only renders on a no-vault device (LandingGuard), so every in-app
// route is behind WalletGate and would bounce a marketing visitor to the
// create/import front door. Link the ungated artefact instead.
const PUBLIC_DOCS_URL = "/veyrnox-docs.html";
// veyrnox.com is a separate site (not this repo). These MUST be absolute: a
// relative "/terms" resolves inside the SPA, which has no such route, so it
// rendered the 404 page. Verified live 2026-09-16: both resolve 200
// (/terms-of-service returns 404, so those 200s are real pages, not a catch-all).
//
// NO TRAILING SLASH, deliberately, even though the bare path 307s to the slashed
// form. These exact strings are what is submitted on the App Store / Play store
// listings, and TermsLegal.privacy-url.test.jsx pins the privacy one for that
// reason — a reviewer's click must land on the page they read from the store
// form. Saving one redirect hop is not worth breaking store parity.
const TERMS_URL = "https://veyrnox.com/terms";
const PRIVACY_URL = "https://veyrnox.com/privacy";
const CONTACT_EMAIL = "legal@veyrnox.com";
const FOOTER_LINK =
  "hover:text-primary transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm";

export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Read-progress bar + back-to-top share the ONE scroll listener below rather
  // than registering two more — this page is long and the listener already exists.
  const [progress, setProgress] = useState(0);

  // Scroll listener registered once via useEffect with a matching
  // removeEventListener cleanup so it isn't re-added on every render and is torn
  // down on unmount (the previous render-time addEventListener leaked a new
  // handler each render with no removal).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 50);
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(100, (y / scrollable) * 100) : 0);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const goToSection = (id) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const SECTIONS = [
    { id: "features", label: "Features" },
    { id: "ai-security", label: "AI Security" },
    { id: "security", label: "Security" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Skip link. The in-app shell gets this from AccessibilityWrapper, but
          /landing renders outside Layout, so it had no keyboard bypass at all. */}
      <a
        href="#landing-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-lg focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Navigation */}
      <nav
        aria-label="Site navigation"
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-background/95 backdrop-blur-xl border-b border-border" : "bg-transparent"
        }`}
      >
        {/* Read-progress bar. aria-hidden: it duplicates the scrollbar, which
            assistive tech already conveys. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-transparent">
          <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${progress}%` }} />
        </div>

        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo is the conventional "home" affordance — it was inert markup. */}
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Veyrnox — back to top"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
          >
            <span className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="text-xl font-bold">VEYRNOX</span>
          </button>

          {/* Desktop Nav.
              Login / Get Started are GONE, not restyled: there is no hosted
              account (the seed is the identity), so /login and /register are
              pure redirects to "/" (App.jsx). Two buttons that differed only in
              label while doing the same thing read as a broken sign-in. One CTA
              to the on-device front door is what actually happens. */}
          <div className="hidden md:flex gap-8 items-center">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => goToSection(sec.id)}
                className="text-muted-foreground hover:text-foreground transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
              >
                {sec.label}
              </button>
            ))}
            <a
              href={PUBLIC_DOCS_URL}
              className="text-muted-foreground hover:text-foreground transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            >
              Docs
            </a>
            <Button onClick={() => navigate("/")} className="bg-primary hover:bg-primary/90">
              Open Veyrnox
            </Button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            type="button"
            className="md:hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div id="mobile-nav-menu" className="md:hidden bg-background/95 border-b border-border px-6 py-4 space-y-2">
            {/* Parity with the desktop nav. The section links were desktop-only,
                so on a phone the in-page nav simply did not exist. */}
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => goToSection(sec.id)}
                className="block w-full text-start py-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
              >
                {sec.label}
              </button>
            ))}
            <a
              href={PUBLIC_DOCS_URL}
              className="block w-full text-start py-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            >
              Docs
            </a>
            <Button onClick={() => navigate("/")} className="w-full bg-primary hover:bg-primary/90 mt-2">Open Veyrnox</Button>
          </div>
        )}
      </nav>

      <main id="landing-main" tabIndex={-1}>
      {/* Hero Section */}
      <section aria-labelledby="hero-heading" className="relative overflow-hidden py-20 md:py-32">
        {/* Background gradient orbs — decorative, hidden from assistive tech */}
        <div aria-hidden="true" className="absolute top-0 start-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl -z-10"></div>
        <div aria-hidden="true" className="absolute top-1/3 end-1/4 w-96 h-96 rounded-full blur-3xl -z-10" style={{ backgroundColor: "hsl(var(--info)/0.15)" }}></div>

        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <span className="text-sm font-semibold text-primary">Self-Custody · Multi-Chain</span>
              </div>
              <h1 id="hero-heading" className="text-5xl md:text-6xl font-bold text-foreground leading-tight">
                Your keys,<br />
                <span className="text-primary">on your device</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg">
                A self-custody, coercion-resistant crypto wallet.
              </p>
            </div>

            {/* flex-wrap: two size="lg" px-8 buttons side by side exceed a
                375px viewport and pushed the hero horizontally. */}
            <div className="flex flex-wrap gap-4 pt-4">
              <Button size="lg" onClick={() => navigate("/")} className="bg-primary hover:bg-primary/90 text-lg px-8">
                Launch App
                {/* Icon mirrors under dir="rtl" — forward-flow CTA arrow. */}
                <ArrowRight className="ms-2 h-5 w-5 rtl:-scale-x-100" />
              </Button>
              <Button asChild size="lg" variant="outline" className="border-border hover:bg-secondary text-lg px-8">
                <a href={PUBLIC_DOCS_URL}>Learn More</a>
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="pt-8 grid grid-cols-3 gap-4 border-t border-border">
              <div>
                <p className="text-2xl font-bold text-primary">0</p>
                <p className="text-sm text-muted-foreground">Keys we hold</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">On-device</p>
                <p className="text-sm text-muted-foreground">Encrypted key vault</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">10</p>
                <p className="text-sm text-muted-foreground">Supported assets</p>
              </div>
            </div>
          </div>

          {/* Right: Hero Visualization */}
          <div className="hidden md:flex items-center justify-center">
            <div className="relative w-full max-w-md">
              {/* Central Shield with glow */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-64 h-64">
                  <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary/30 to-primary/10 rounded-full blur-3xl motion-safe:animate-pulse"></div>
                  <div className="relative w-full h-full rounded-full border border-primary/30 flex items-center justify-center">
                    <Shield className="w-32 h-32 text-primary" />
                  </div>
                </div>
              </div>

              {/* Coin artwork — decorative illustrative currency tokens, not UI chrome */}
              <div aria-hidden="true" className="absolute top-4 start-0 w-12 h-12 bg-secondary border border-border rounded-full flex items-center justify-center text-muted-foreground font-bold">₿</div>
              <div aria-hidden="true" className="absolute top-8 end-8 w-12 h-12 bg-secondary border border-border rounded-full flex items-center justify-center text-muted-foreground font-bold">Ξ</div>
              <div aria-hidden="true" className="absolute bottom-20 start-4 w-12 h-12 bg-secondary border border-border rounded-full flex items-center justify-center text-muted-foreground font-bold">◎</div>
              <div aria-hidden="true" className="absolute bottom-4 end-0 w-12 h-12 bg-primary/10 border border-primary/30 rounded-full flex items-center justify-center text-primary font-bold">∞</div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Highlights */}
      <section aria-labelledby="security-highlights-heading" className="py-20 bg-gradient-to-b from-transparent via-secondary/50 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 id="security-highlights-heading" className="text-4xl font-bold mb-4">Security at the Core</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Strong on-device encryption and layered protections
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: Lock, title: "Passkey / biometric unlock", desc: "WebAuthn/FIDO2 or device biometric to unlock — your password always works too" },
              { icon: Shield, title: "Duress PIN", desc: "Decoy wallet under coercion" },
              { icon: Eye, title: "Whitelist", desc: "Restrict withdrawals to approved addresses" },
              { icon: Zap, title: "Step-up re-auth", desc: "Re-enter your PIN to authorise a send" },
            ].map((item, idx) => (
              <div key={idx} className="p-6 rounded-lg border border-border bg-card/50 hover:border-primary/50 transition">
                <item.icon className="w-8 h-8 text-primary mb-4" />
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" aria-labelledby="features-heading" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 id="features-heading" className="text-4xl font-bold mb-4">Powerful Features</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage, trade, and grow your crypto portfolio
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Smartphone, title: "Multi-Chain", desc: "Send & receive across 10 assets on EVM, Bitcoin & Solana" },
              { icon: Shield, title: "Coercion resistance", desc: "Duress PIN, decoy & panic wipe" },
              { icon: Eye, title: "Pre-sign screening", desc: "Local tx simulation + address-poisoning / look-alike checks" },
              { icon: BarChart3, title: "Analytics", desc: "Portfolio tracking and P&L reports" },
              { icon: Bell, title: "Smart Alerts", desc: "Price and local security notifications" },
              { icon: Key, title: "Self-custody", desc: "Keys are generated and stay on your device — we hold none" },
              { icon: Sparkles, title: "AI Security Protection", desc: "Vigil advisor with live online answers backed by the TIP threat-intelligence platform" },
            ].map((item, idx) => (
              <div key={idx} className="p-6 rounded-lg border border-border bg-card/50 hover:border-primary/50 transition group cursor-pointer">
                <item.icon className="w-8 h-8 text-primary mb-4 group-hover:scale-110 transition" />
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Security Protection */}
      <section id="ai-security" aria-labelledby="ai-security-heading" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <span className="text-sm font-semibold text-primary inline-flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> AI Security Protection
              </span>
            </div>
            <h2 id="ai-security-heading" className="text-4xl font-bold mb-4">Vigil, your on-device security advisor</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Local guidance is always on and offline. AI Security Protection unlocks live online answers backed by the TIP threat-intelligence platform.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: Bot, title: "Context-aware advisor", desc: "Vigil sees which surface you're on — send, approvals, seed reveal — and tailors guidance to that page" },
              { icon: FileSearch, title: "Pre-sign review", desc: "Ask about a transaction, address, or approval before you sign; get plain-language risk explanations" },
              { icon: Sparkles, title: "Live TIP-backed answers", desc: "Live online responses through the TIP threat-intelligence platform for fresh threat context" },
              { icon: WifiOff, title: "Offline fallback", desc: "If online chat is unavailable or you're in deniability mode, the local knowledge base still answers" },
            ].map((item, idx) => (
              <div key={idx} className="p-6 rounded-lg border border-border bg-card/50 hover:border-primary/50 transition">
                <item.icon className="w-8 h-8 text-primary mb-4" />
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12">
            <h3 className="text-2xl font-bold mb-6 text-center">What Vigil covers</h3>
            {/* 18 undifferentiated bullets in one two-column list was a wall of
                text. Same 18 items, same copy — grouped under three headings so
                the list can be skimmed by what the reader cares about. */}
            <div className="max-w-5xl mx-auto space-y-8">
              {[
                { group: "Before you sign", items: [
                { title: "Per-page context awareness", desc: "Detects surface (send, approvals, seed reveal, dApps, deniability, backup, and more) and tailors guidance" },
                { title: "Pre-sign risk explanation", desc: "Address poisoning, wrong chain, excessive fees, scam addresses; recipient and amount checks; gas fee context" },
                { title: "Token approval guidance", desc: "Unlimited approvals, revocation, stale-approval abuse by malicious dApps" },
                { title: "Address screening interpretation", desc: "Explains BLOCKED / CAUTION / CLEAR / UNKNOWN honestly; reminds local verification still matters" },
                { title: "Spam and suspicious asset triage", desc: "Unsolicited tokens as phishing lures; separates local heuristics from contract fields from unknowns" },
                ] },
                { group: "Keys, backup & deniability", items: [
                { title: "Seed and key hygiene", desc: "Discourages screenshots, cloud sync, digital copying; whoever sees the seed controls the funds" },
                { title: "Deniability explainer", desc: "Decoy vs stealth wallets, panic wipe consequences, I3 (zero network calls in deniability mode)" },
                { title: "Duress PIN guidance", desc: "Decoy session must look ordinary and leave zero distinctive network traces" },
                { title: "Hardware and KEK distinction", desc: "External hardware wallets vs Veyrnox's own hardware-bound KEK protections" },
                { title: "Personal Backup coaching", desc: "Plaintext keys never leave device; test recovery before relying on it; 2-of-3 shard export needs Hardware Protection ON" },
                { title: "Biometric framing", desc: "Biometrics are a convenience gate over hardware-bound crypto — not a seed replacement" },
                { title: "dApp / WalletConnect guidance", desc: "dApp legitimacy checks, permission risks, approval hazards, when to disconnect sessions" },
                ] },
                { group: "How the advisor itself behaves", items: [
                { title: "Panic wipe consequences", desc: "Device wiped; chain funds recoverable only from the seed phrase" },
                { title: "Tax and analytics honesty", desc: "Records vs legal determination; informational vs on-chain-verified" },
                { title: "Secret scrubbing", desc: "Seed phrases, private keys, and PINs stripped from prompts before egress" },
                { title: "Prompt-injection resistance", desc: "Hardened against instructions embedded in on-chain data or dApp metadata" },
                { title: "Fail-closed offline fallback", desc: "If TIP cap hit or offline, local knowledge base still answers" },
                { title: "Deniability suppression", desc: "Zero network calls whenever a decoy or duress session is active (I3 invariant)" },
                ] },
              ].map((section) => (
                <div key={section.group}>
                  <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{section.group}</h4>
                  <div className="grid md:grid-cols-2 gap-x-8 gap-y-3">
                    {section.items.map((item) => (
                      <div key={item.title} className="flex gap-3">
                        <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                        <div>
                          <p className="font-semibold text-foreground">{item.title}</p>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 max-w-3xl mx-auto p-6 rounded-lg border border-border bg-card/50">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-semibold">Privacy:</span> secrets, seed phrases, and private keys are scrubbed before any prompt leaves the device. Vigil makes zero network calls in deniability mode (I3). Free and Safety Plus tiers keep Vigil local and offline; live online answers require AI Security Protection.
            </p>
          </div>
        </div>
      </section>

      {/* Security Deep Dive */}
      <section id="security" aria-labelledby="security-deep-heading" className="py-20 bg-gradient-to-b from-transparent via-secondary/50 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20 w-fit">
                <span className="text-sm font-semibold text-primary">🛡️ Security First</span>
              </div>
              <h2 id="security-deep-heading" className="text-4xl font-bold">
                Coercion-resistant by design
              </h2>
              <p className="text-lg text-muted-foreground">
                Your private keys never leave your device, and we have zero access to your funds. See the limits below.
              </p>

              <div className="space-y-4">
                {[
                  "Strong on-device encryption",
                  "WebAuthn/FIDO2 biometrics",
                  "Encrypted on-device key vault",
                  "Local pre-sign transaction screening",
                  "Local known-bad domain list",
                  "Duress PIN protection",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-foreground">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 rounded-lg border border-border bg-gradient-to-br from-secondary/50 to-background/50">
              <Shield className="w-12 h-12 text-primary mb-6" />
              <h3 className="text-2xl font-bold mb-4">Self-custody, on your device</h3>
              <p className="text-muted-foreground mb-6">
                Your private keys are generated on your device and stored only there, in a strongly encrypted on-device vault. We never have access to your funds. <span className="text-foreground">Known limit:</span> an 8-digit PIN is offline-brute-forceable on a seized device — hardware-backed key binding is a planned fast-follow, not yet active.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-background/50">
                  <p className="text-sm text-muted-foreground">Encryption</p>
                  <p className="font-bold text-lg">On-device</p>
                </div>
                <div className="p-4 rounded-lg bg-background/50">
                  <p className="text-sm text-muted-foreground">Authentication</p>
                  <p className="font-bold text-lg">WebAuthn/FIDO2</p>
                </div>
                <div className="p-4 rounded-lg bg-background/50">
                  <p className="text-sm text-muted-foreground">Storage</p>
                  <p className="font-bold text-lg">Encrypted Vault</p>
                </div>
                <div className="p-4 rounded-lg bg-background/50">
                  <p className="text-sm text-muted-foreground">Key custody</p>
                  <p className="font-bold text-lg">Non-custodial</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section aria-labelledby="cta-heading" className="py-20 bg-gradient-to-r from-primary/10 via-info/10 to-primary/10 border-y border-border">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-8">
          <h2 id="cta-heading" className="text-4xl font-bold">Take control of your crypto</h2>
          <p className="text-xl text-muted-foreground">Self-custody across 10 assets — your keys, your device, your rules.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/")} className="bg-primary hover:bg-primary/90 text-lg px-8">
              Start Now
            </Button>
            <Button asChild size="lg" variant="outline" className="border-primary text-primary hover:bg-primary/10 text-lg px-8">
              <a href={PUBLIC_DOCS_URL}>View All Features</a>
            </Button>
          </div>
        </div>
      </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-border py-12 bg-background/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <p className="font-bold text-lg mb-4">VEYRNOX</p>
              <p className="text-sm text-muted-foreground">A self-custody, coercion-resistant wallet</p>
            </div>
            <div>
              <p className="font-semibold mb-4">Product</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {/* Was navigate("/docs") / navigate("/security"). Both sit behind
                    WalletGate, and /landing only renders when NO vault exists, so
                    every click landed on the create/import front door instead of
                    the page named on the link. */}
                <li><a href={PUBLIC_DOCS_URL} className={FOOTER_LINK}>Documentation</a></li>
                <li><button type="button" onClick={() => goToSection("features")} className={FOOTER_LINK}>Features</button></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-4">Security</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button type="button" onClick={() => goToSection("security")} className={FOOTER_LINK}>Security model</button></li>
                <li><button type="button" onClick={() => goToSection("ai-security")} className={FOOTER_LINK}>AI Security Protection</button></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-4">Legal</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={FOOTER_LINK}>Privacy Policy</a></li>
                <li><a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={FOOTER_LINK}>Terms of Service</a></li>
                {/* The address was published as plain text in TermsLegal and
                    nowhere on the landing page. A contact you cannot tap is not
                    a contact route on a phone. */}
                <li><a href={`mailto:${CONTACT_EMAIL}`} className={FOOTER_LINK}>{CONTACT_EMAIL}</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            {/* Derived, not literal: the hardcoded "2026" was correct for exactly
                one year and silently wrong afterwards. */}
            <p>&copy; {new Date().getFullYear()} <strong>VEYRNOX</strong>. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Back to top. Appears only once the page has actually scrolled, so it
          never covers content on a short viewport at rest. */}
      {scrolled && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="fixed bottom-6 end-6 z-50 h-11 w-11 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
