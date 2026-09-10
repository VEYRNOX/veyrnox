// Top-of-tree boundary. Deliberately renders only plain HTML — no imports from
// components/ui, no i18n, no routing — so it survives even when the whole
// design-system chunk fails to hydrate. Motivation: Apple 1.0.1 rejection
// #3 (2026-09-10, iPad Air 11-inch M3 iPadOS 26.6.1) said "blank page upon
// launch". Whatever throws, the user must never see a blank white screen.
import { Component } from "react";

export default class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err) {
    // Keep this dumb — reportError may itself be inside the chunk that failed.
    try { console.error("[RootErrorBoundary]", err); } catch {}
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", padding: "24px",
        background: "#050608", color: "#F5F7FA",
        fontFamily: "-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, margin: "0 auto 16px",
            borderRadius: 14, background: "#0F141C",
            border: "1px solid #4ADAC2",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#4ADAC2", fontSize: 24, fontWeight: 700,
          }}>V</div>
          <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 700 }}>
            Veyrnox couldn’t start
          </h1>
          <p style={{ margin: "0 0 20px", color: "#8B95A7", fontSize: 15, lineHeight: 1.5 }}>
            Something failed while loading the app. Your wallet data on this
            device is not affected. Reload to try again.
          </p>
          <button
            onClick={() => { try { window.location.reload(); } catch {} }}
            style={{
              width: "100%", padding: "12px 16px", borderRadius: 12,
              background: "#4ADAC2", color: "#050608",
              fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer",
            }}
          >
            Reload Veyrnox
          </button>
        </div>
      </div>
    );
  }
}
