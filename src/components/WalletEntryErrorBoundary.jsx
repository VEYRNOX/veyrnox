// components/WalletEntryErrorBoundary.jsx
//
// React Error Boundary wrapping WalletEntry. If WalletEntry (or anything it
// renders) throws — e.g. after Vite HMR corrupts React + localStorage state
// mid-transaction — the user would otherwise see a permanent white screen with
// no recovery path. This boundary catches the error and renders a minimal
// recovery screen.
//
// "Clear local data" destroys the encrypted vault on THIS device only. The
// user's seed phrase is never held server-side, so funds are NOT at risk —
// they can be recovered by re-importing the seed on any device. The button copy
// makes this explicit so users do not mistake it for a normal action.
//
// Error Boundaries must be class components (React constraint); no hooks here.

import { Component } from "react";

export default class WalletEntryErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this._handleClear  = this._handleClear.bind(this);
    this._handleCopy   = this._handleCopy.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface to console so dev-mode stack traces are still visible.
    console.error("[WalletEntryErrorBoundary] caught:", error, info?.componentStack);
  }

  _handleClear() {
    try { localStorage.clear(); } catch { /* storage unavailable */ }
    window.location.reload();
  }

  _handleCopy() {
    const { error } = this.state;
    const text = [
      error?.name,
      error?.message,
      error?.stack,
    ].filter(Boolean).join("\n\n");
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  render() {
    if (!this.state.error) return this.props.children;

    const msg = this.state.error?.message || String(this.state.error);

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6 text-center">

          {/* ── Icon ── */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 border border-destructive/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                 className="h-6 w-6 text-destructive" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>

          {/* ── Heading + body ── */}
          <div className="space-y-2">
            <h1 className="text-lg font-semibold text-foreground">
              Something went wrong on this device
            </h1>
            <p className="text-sm text-muted-foreground">
              The wallet screen encountered an unexpected error and cannot continue.
              Your seed phrase is safe — it is never held by Veyrnox.
            </p>
          </div>

          {/* ── Error detail (collapsed, monospaced) ── */}
          <details className="text-left">
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
              Error details
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all">
              {msg}
            </pre>
          </details>

          {/* ── Actions ── */}
          <div className="space-y-3">
            {/* Destructive primary: clear vault + reload */}
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive space-y-2">
              <p>
                <strong>This will erase your local encrypted vault.</strong>{" "}
                Your funds are safe — re-import your seed phrase to restore access.
                Only do this if the app is stuck and you have your seed phrase backed up.
              </p>
            </div>
            <button
              onClick={this._handleClear}
              className="w-full rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive hover:bg-destructive/20 active:bg-destructive/30 transition-colors"
            >
              Clear local data and restart
            </button>

            {/* Secondary: copy error for reporting */}
            <button
              onClick={this._handleCopy}
              className="w-full rounded-xl border border-border bg-transparent px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Copy error details
            </button>
          </div>

        </div>
      </div>
    );
  }
}
