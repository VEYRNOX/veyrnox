import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Shield, Smartphone, Lock, Zap, Eye, ArrowRight,
  CheckCircle2, Bell, BarChart3, Key, Menu, X
} from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Scroll listener registered once via useEffect with a matching
  // removeEventListener cleanup so it isn't re-added on every render and is torn
  // down on unmount (the previous render-time addEventListener leaked a new
  // handler each render with no removal).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navigation */}
      <nav
        aria-label="Site navigation"
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled ? "bg-background/95 backdrop-blur-xl border-b border-border" : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">VEYRNOX</span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex gap-8 items-center">
            <button
              type="button"
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="text-muted-foreground hover:text-foreground transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            >
              Features
            </button>
            <button
              type="button"
              onClick={() => document.getElementById("security")?.scrollIntoView({ behavior: "smooth" })}
              className="text-muted-foreground hover:text-foreground transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
            >
              Security
            </button>
            <Button variant="outline" onClick={() => navigate("/login")} className="border-primary text-primary hover:bg-primary/10">
              Login
            </Button>
            <Button onClick={() => navigate("/register")} className="bg-primary hover:bg-primary/90">
              Get Started
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
          <div id="mobile-nav-menu" className="md:hidden bg-background/95 border-b border-border px-6 py-4 space-y-4">
            <button type="button" onClick={() => navigate("/login")} className="block w-full text-left py-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">Login</button>
            <Button onClick={() => navigate("/register")} className="w-full bg-primary hover:bg-primary/90">Get Started</Button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section aria-labelledby="hero-heading" className="relative overflow-hidden py-20 md:py-32">
        {/* Background gradient orbs — decorative, hidden from assistive tech */}
        <div aria-hidden="true" className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl -z-10"></div>
        <div aria-hidden="true" className="absolute top-1/3 right-1/4 w-96 h-96 rounded-full blur-3xl -z-10" style={{ backgroundColor: "hsl(var(--info)/0.15)" }}></div>

        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <span className="text-sm font-semibold text-primary">🧪 Testnet Beta · Self-Custody</span>
              </div>
              <h1 id="hero-heading" className="text-5xl md:text-6xl font-bold text-foreground leading-tight">
                Your keys,<br />
                <span className="text-primary">on your device</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg">
                A self-custody, coercion-resistant crypto wallet.
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Button size="lg" onClick={() => navigate("/register")} className="bg-primary hover:bg-primary/90 text-lg px-8">
                Launch App
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/docs")} className="border-border hover:bg-secondary text-lg px-8">
                Learn More
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
                  <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-primary/30 to-primary/10 rounded-full blur-3xl animate-pulse"></div>
                  <div className="relative w-full h-full rounded-full border border-primary/30 flex items-center justify-center">
                    <Shield className="w-32 h-32 text-primary" />
                  </div>
                </div>
              </div>

              {/* Coin artwork — decorative illustrative currency tokens, not UI chrome */}
              <div aria-hidden="true" className="absolute top-4 left-0 w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold animate-pulse" style={{animationDelay: '0s'}}>₿</div>
              <div aria-hidden="true" className="absolute top-8 right-8 w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold animate-pulse" style={{animationDelay: '0.2s'}}>Ξ</div>
              <div aria-hidden="true" className="absolute bottom-20 left-4 w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold animate-pulse" style={{animationDelay: '0.4s'}}>◎</div>
              <div aria-hidden="true" className="absolute bottom-4 right-0 w-12 h-12 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold animate-pulse" style={{animationDelay: '0.6s'}}>∞</div>
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
              { icon: Smartphone, title: "Multi-Chain", desc: "Receive & balances on 10 assets; send on Ethereum (testnet verified)" },
              { icon: Shield, title: "Coercion resistance", desc: "Duress PIN, decoy & panic wipe" },
              { icon: Eye, title: "Pre-sign screening", desc: "Local tx simulation + address-poisoning / look-alike checks" },
              { icon: BarChart3, title: "Analytics", desc: "Portfolio tracking and P&L reports" },
              { icon: Bell, title: "Smart Alerts", desc: "Price and local security notifications" },
              { icon: Key, title: "Self-custody", desc: "Keys are generated and stay on your device — we hold none" },
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
                  <p className="text-sm text-muted-foreground">Audits</p>
                  <p className="font-bold text-lg">Internal + independent</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section aria-labelledby="cta-heading" className="py-20 bg-gradient-to-r from-primary/10 via-info/10 to-primary/10 border-y border-border">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-8">
          <h2 id="cta-heading" className="text-4xl font-bold">Try the testnet beta</h2>
          <p className="text-xl text-muted-foreground">Testnet funds only — nothing real at stake. Help us find out what works.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={() => navigate("/register")} className="bg-primary hover:bg-primary/90 text-lg px-8">
              Start Now
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/features")} className="border-primary text-primary hover:bg-primary/10 text-lg px-8">
              View All Features
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 bg-background/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <p className="font-bold text-lg mb-4">VEYRNOX</p>
              <p className="text-sm text-muted-foreground">A self-custody, coercion-resistant wallet — testnet beta</p>
            </div>
            <div>
              <p className="font-semibold mb-4">Product</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button type="button" onClick={() => navigate("/features")} className="hover:text-primary transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">Features</button></li>
                <li><button type="button" onClick={() => navigate("/docs")} className="hover:text-primary transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">Documentation</button></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-4">Security</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><button type="button" onClick={() => navigate("/security")} className="hover:text-primary transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">Security Center</button></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-4">Legal</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-primary transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2026 <strong>VEYRNOX</strong>. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
