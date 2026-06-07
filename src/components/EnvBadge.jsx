// Cosmetic build-label only. Reads VITE_ENV_LABEL and nothing else.
// Renders nothing when the label is absent (real PROD) or in DEMO.
// Does NOT touch BACKEND / DEMO / RELEASE — purely visual.
export default function EnvBadge() {
  const label = import.meta.env.VITE_ENV_LABEL;
  if (!label) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      textAlign: "center", padding: "2px 0",
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      fontSize: "11px", letterSpacing: "0.08em",
      color: "#050608", background: "#E7B14C", zIndex: 9999,
      pointerEvents: "none",
    }}>
      {String(label).toUpperCase()}
    </div>
  );
}
