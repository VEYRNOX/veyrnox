import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Shield, Smartphone, Lock, Zap, TrendingUp, Eye, ArrowRight,
  CheckCircle2, ArrowDownUp, Bell, BarChart3, Key, Menu, X
} from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = () => {
    setScrolled(window.scrollY > 50);
  };

  if (typeof window !== "undefined") {
    window.addEventListener("scroll", handleScroll, { passive: true });
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white overflow-x-hidden">
      {/* Navigation */}
      <nav className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/50" : "bg-transparent"
      }`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="text-xl font-bold">Veyrnox</span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex gap-8 items-center">
            <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })} className="text-slate-400 hover:text-white transition">Features</button>
            <button onClick={() => document.getElementById("security")?.scrollIntoView({ behavior: "smooth" })} className="text-slate-400 hover:text-white transition">Security</button>
            <Button variant="outline" onClick={() => navigate("/login")} className="border-primary text-primary hover:bg-primary/10">
              Login
            </Button>
            <Button onClick={() => navigate("/register")} className="bg-primary hover:bg-primary/90">
              Get Started
            </Button>
          </div>

          {/* Mobile Menu */}
          <button className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900/98 border-b border-slate-700/50 px-6 py-4 space-y-4">
            <button onClick={() => navigate("/login")} className="block w-full text-left py-2 text-slate-400 hover:text-white">Login</button>
            <Button onClick={() => navigate("/register")} className="w-full bg-primary hover:bg-primary/90">Get Started</Button>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        {/* Background gradient orbs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl -z-10"></div>
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl -z-10"></div>

        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <span className="text-sm font-semibold text-primary">🔐 Enterprise-Grade Security</span>
              </div>
              <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight">
                Your Crypto,<br />
                <span className="text-primary">Fully Secured</span>
              </h1>
              <p className="text-xl text-slate-400 max-w-lg">
                The most secure self-custody wallet for managing, trading, and growing your digital assets with industry-leading security features.
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Button size="lg" onClick={() => navigate("/register")} className="bg-primary hover:bg-primary/90 text-lg px-8">
                Launch App
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/docs")} className="border-slate-600 hover:bg-slate-800 text-lg px-8">
                Learn More
              </Button>
            </div>

            {/* Trust Indicators */}
            <div className="pt-8 grid grid-cols-3 gap-4 border-t border-slate-700/50">
              <div>
                <p className="text-2xl font-bold text-primary">100K+</p>
                <p className="text-sm text-slate-400">Active Users</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">$50B+</p>
                <p className="text-sm text-slate-400">Assets Secured</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">0</p>
                <p className="text-sm text-slate-400">Breaches Ever</p>
              </div>
            </div>
          </div>

          {/* Right: Hero Visualization */}
          <div className="hidden md:flex items-center justify-center">
            <div className="relative w-full max-w-md">
              {/* Central Shield with glow */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-64 h-64">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-blue-500/30 rounded-full blur-3xl animate-pulse"></div>
                  <div className="relative w-full h-full rounded-full border border-primary/30 flex items-center justify-center">
                    <Shield className="w-32 h-32 text-primary" />
                  </div>
                </div>
              </div>

              {/* Crypto icons orbiting */}
              <div className="absolute top-4 left-0 w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold animate-bounce" style={{animationDelay: '0s'}}>₿</div>
              <div className="absolute top-8 right-8 w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold animate-bounce" style={{animationDelay: '0.2s'}}>Ξ</div>
              <div className="absolute bottom-20 left-4 w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold animate-bounce" style={{animationDelay: '0.4s'}}>◎</div>
              <div className="absolute bottom-4 right-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold animate-bounce" style={{animationDelay: '0.6s'}}>∞</div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Highlights */}
      <section className="py-20 bg-gradient-to-b from-transparent via-slate-800/50 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Security at the Core</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Bank-grade encryption and multi-layered protection to keep your assets safe
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: Lock, title: "Passkey Auth", desc: "WebAuthn/FIDO2 biometric login" },
              { icon: Shield, title: "Duress PIN", desc: "Decoy wallet under coercion" },
              { icon: Eye, title: "Whitelist", desc: "Restrict withdrawals to approved addresses" },
              { icon: Zap, title: "2FA", desc: "Email OTP for high-risk actions" },
            ].map((item, idx) => (
              <div key={idx} className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-primary/50 transition">
                <item.icon className="w-8 h-8 text-primary mb-4" />
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Powerful Features</h2>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Everything you need to manage, trade, and grow your crypto portfolio
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Smartphone, title: "Multi-Chain", desc: "Support for Bitcoin, Ethereum, Solana, Polygon, and more" },
              { icon: ArrowDownUp, title: "Instant Swaps", desc: "Aggregate DEX swaps across multiple chains" },
              { icon: TrendingUp, title: "Staking", desc: "Earn yield on your crypto assets" },
              { icon: BarChart3, title: "Analytics", desc: "Advanced portfolio tracking and P&L reports" },
              { icon: Bell, title: "Smart Alerts", desc: "Real-time price and security notifications" },
              { icon: Key, title: "Hardware Wallet", desc: "Ledger, Trezor, and Coldcard integration" },
            ].map((item, idx) => (
              <div key={idx} className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:border-primary/50 transition group cursor-pointer">
                <item.icon className="w-8 h-8 text-primary mb-4 group-hover:scale-110 transition" />
                <h3 className="font-bold text-lg mb-2">{item.title}</h3>
                <p className="text-slate-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Deep Dive */}
      <section id="security" className="py-20 bg-gradient-to-b from-transparent via-slate-800/50 to-transparent">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-block px-4 py-2 rounded-full bg-primary/10 border border-primary/20 w-fit">
                <span className="text-sm font-semibold text-primary">🛡️ Security First</span>
              </div>
              <h2 className="text-4xl font-bold">
                Military-Grade Protection
              </h2>
              <p className="text-lg text-slate-400">
                Your private keys never leave your device. We have zero access to your funds, ever.
              </p>

              <div className="space-y-4">
                {[
                  "256-bit AES-GCM encryption",
                  "WebAuthn/FIDO2 biometrics",
                  "Secure enclave key storage",
                  "Hardware wallet support",
                  "Real-time transaction simulation",
                  "Phishing domain detection",
                  "Duress PIN protection",
                ].map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span className="text-slate-300">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 rounded-lg border border-slate-700/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50">
              <Shield className="w-12 h-12 text-primary mb-6" />
              <h3 className="text-2xl font-bold mb-4">Zero Compromise Security</h3>
              <p className="text-slate-400 mb-6">
                Your private keys are generated and stored exclusively on your device using secure enclave technology. We never have access to your funds.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-900/50">
                  <p className="text-sm text-slate-400">Encryption</p>
                  <p className="font-bold text-lg">256-bit AES</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-900/50">
                  <p className="text-sm text-slate-400">Authentication</p>
                  <p className="font-bold text-lg">WebAuthn/FIDO2</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-900/50">
                  <p className="text-sm text-slate-400">Storage</p>
                  <p className="font-bold text-lg">Secure Enclave</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-900/50">
                  <p className="text-sm text-slate-400">Audits</p>
                  <p className="font-bold text-lg">Third-Party</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary/10 via-blue-500/10 to-primary/10 border-y border-slate-700/50">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-8">
          <h2 className="text-4xl font-bold">Ready to Secure Your Assets?</h2>
          <p className="text-xl text-slate-400">Join thousands of users who trust Veyrnox with their crypto</p>
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
      <footer className="border-t border-slate-700/50 py-12 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <p className="font-bold text-lg mb-4">Veyrnox</p>
              <p className="text-sm text-slate-400">The most secure self-custody wallet for your digital assets</p>
            </div>
            <div>
              <p className="font-semibold mb-4">Product</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><button onClick={() => navigate("/features")} className="hover:text-primary transition">Features</button></li>
                <li><button onClick={() => navigate("/docs")} className="hover:text-primary transition">Documentation</button></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-4">Security</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><button onClick={() => navigate("/security")} className="hover:text-primary transition">Security Center</button></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-4">Legal</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#" className="hover:text-primary transition">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-primary transition">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700/50 pt-8 text-center text-sm text-slate-400">
            <p>&copy; 2026 Veyrnox. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}