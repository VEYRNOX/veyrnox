// @ts-nocheck
// pages/dev/PrfSpike.jsx — DEV-ONLY screen for the PRF-in-WebView spike.
//
// THROWAWAY. Reachable only via the /dev/prf-spike route, which App.jsx gates on
// import.meta.env.DEV (statically false in any production build → dead-code-
// eliminated, never ships). This screen makes NO security claim: it runs the
// probe in src/dev/prfSpike.js and shows whether the WebAuthn `prf` extension is
// reachable + STABLE inside this WebView, then maps that to the spec's A/B/C
// outcome (docs/kek-architecture-spec.md §8; docs/prf-webview-spike-brief.md).
//
// Run it on the AVD Pixel_7 emulator AND a physical Android device (brief §3),
// then re-run after a full app restart to confirm cross-restart stability, and
// record the verdict in spec §8.

import { useState } from 'react';
import { FlaskConical, Play, RotateCcw, ShieldQuestion } from 'lucide-react';
import { runPrfProbe, resetSpike, readSpikeRecord } from '@/dev/prfSpike';

const OUTCOME_STYLE = {
  A:            { ring: 'border-success/40 bg-success/10',      text: 'text-success' },
  A_PENDING:    { ring: 'border-primary/40 bg-primary/10',      text: 'text-primary' },
  WEBVIEW_FAIL: { ring: 'border-caution/40 bg-caution/10',      text: 'text-caution' },
  C:            { ring: 'border-destructive/40 bg-destructive/10', text: 'text-destructive' },
  INCONCLUSIVE: { ring: 'border-border bg-secondary/30',         text: 'text-muted-foreground' },
};

export default function PrfSpike() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(/** @type {any} */ (null));
  const [hasPrior, setHasPrior] = useState(() => !!readSpikeRecord());

  const run = async () => {
    setRunning(true);
    try {
      const r = await runPrfProbe();
      setResult(r);
      setHasPrior(!!readSpikeRecord());
    } catch (e) {
      setResult({ log: [`Fatal: ${e?.message || String(e)}`], outcome: null });
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    resetSpike();
    setResult(null);
    setHasPrior(false);
  };

  const style = result?.outcome ? (OUTCOME_STYLE[result.outcome.code] || OUTCOME_STYLE.INCONCLUSIVE) : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-1">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <FlaskConical className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">PRF-in-WebView spike <span className="text-xs font-normal text-muted-foreground">(dev only)</span></h1>
          <p className="text-sm text-muted-foreground">Does WebAuthn <code>prf</code> work — and stay stable — in this WebView? Gates the KEK build.</p>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-caution/20 bg-caution/10 text-caution text-xs flex items-start gap-2">
        <ShieldQuestion className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <b>Throwaway investigation, not a feature.</b> This screen ships nowhere
          (DEV-gated, dead-code-eliminated from release builds) and stores no
          decryption material. It only measures whether <code>prf</code> yields the
          same bytes for a fixed salt across calls and across an app restart — the
          property the hardware-bound KEK depends on.
        </span>
      </div>

      <div className="p-5 rounded-xl border border-border bg-card space-y-4">
        <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
          <li>Run the probe on the <b>AVD Pixel_7 emulator</b> and on a <b>physical Android device</b> (the emulator is not authoritative for real hardware).</li>
          <li>Then fully <b>kill and relaunch</b> the app and run it again — same value = stable across restart.</li>
          <li>Record the verdict in <code>kek-architecture-spec.md §8</code>.</li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-2 py-2 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Play className="h-4 w-4" /> {running ? 'Running…' : (hasPrior ? 'Run probe (re-test stored credential)' : 'Run probe')}
          </button>
          <button
            onClick={reset}
            disabled={running}
            className="inline-flex items-center gap-2 py-2 px-4 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RotateCcw className="h-4 w-4" /> Reset (forget credential)
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {hasPrior
            ? 'A credential from a prior run is stored — “Run probe” re-evaluates it to test cross-restart stability.'
            : 'No stored credential yet — the first run creates one (you’ll get a passkey/biometric prompt).'}
        </p>
      </div>

      {result?.outcome && style && (
        <div className={`p-5 rounded-xl border ${style.ring} space-y-2`}>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${style.text}`}>OUTCOME {result.outcome.code}</span>
            <span className="text-sm font-semibold">{result.outcome.title}</span>
          </div>
          <p className="text-xs text-muted-foreground">{result.outcome.detail}</p>
          <p className="text-xs"><b>Next:</b> {result.outcome.next}</p>
        </div>
      )}

      {result && (
        <div className="p-5 rounded-xl border border-border bg-card space-y-3">
          <p className="text-sm font-semibold">Probe log</p>
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground">
            {(result.log || []).join('\n')}
          </pre>
          {(result.hexA || result.priorHex) && (
            <div className="text-[11px] font-mono space-y-1 border-t border-border pt-2">
              {result.hexA   && <div><span className="text-muted-foreground">get #1 :</span> {result.hexA}</div>}
              {result.hexB   && <div><span className="text-muted-foreground">get #2 :</span> {result.hexB}</div>}
              {result.priorHex && <div><span className="text-muted-foreground">prior  :</span> {result.priorHex}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
