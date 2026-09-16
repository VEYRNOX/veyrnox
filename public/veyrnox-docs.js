// Extracted from public/veyrnox-docs.html on 2026-09-16.
//
// These three blocks were INLINE <script> tags and therefore dead in every
// deployed build: public/_headers applies `script-src 'self' 'wasm-unsafe-eval'`
// to /*, with no 'unsafe-inline' and no hash, so the browser blocked all three.
// Verified on the preview deployment — clicking a tab changed nothing and only
// 1 of the 11 documentation sections was reachable.
//
// Loading the same code from a same-origin file satisfies 'self', so NO CSP
// change was needed. Keep it that way: if you add behaviour to this page, add
// it here, not back in a <script> tag in the HTML.
//
// Ordering note: the blocks previously ran at parse time, mid-document. They
// now run together under `defer`, i.e. after the document is parsed and before
// DOMContentLoaded — so every element they query exists, which is strictly
// safer than before. Block 3 keeps its own DOMContentLoaded listener; defer
// scripts execute before that event fires, so it still runs.

// ── Block 1 (was line ~3549): audit-tracker severity/status filters ──────────
(function(){
const SCOPE=document.getElementById('at');
(function() {
  const state = { severity: 'all', status: 'all' };

  SCOPE.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const filterType = btn.dataset.filter;
      const value = btn.dataset.value;

      state[filterType] = value;

      SCOPE.querySelectorAll(`.filter-btn[data-filter="${filterType}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      applyFilters();
    });
  });

  function applyFilters() {
    const rows = SCOPE.querySelectorAll('#findingsTable tbody tr');
    rows.forEach(row => {
      const sevMatch = state.severity === 'all' || row.dataset.severity === state.severity;
      const stMatch = state.status === 'all' || row.dataset.status === state.status;
      row.classList.toggle('row-hidden', !(sevMatch && stMatch));
    });
  }
})();
})();

// ── Block 2 (was line ~5043): release-readiness rings ───────────────────────
(function(){
const SCOPE=document.getElementById('rd');
(function() {
  function drawRing(canvasId, pct, color) {
    var c = SCOPE.querySelector('#'+canvasId);
    if (!c) return;
    var dpr = window.devicePixelRatio || 1;
    var size = 72;
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    var ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);

    var cx = size / 2, cy = size / 2, r = 28, lw = 5;
    var startAngle = -Math.PI / 2;

    // Track
    var styles = getComputedStyle(document.documentElement);
    var trackColor = styles.getPropertyValue('--g3').trim() || '#1D222B';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Fill
    if (pct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + (Math.PI * 2 * pct));
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Text
    var textColor = styles.getPropertyValue('--text-1').trim() || '#E8ECF1';
    ctx.fillStyle = textColor;
    ctx.font = '600 15px -apple-system, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(pct * 100) + '%', cx, cy);
  }

  function render() {
    // Play: 9 done, 2 warn, 1 todo = 12 total. Done weight=1, warn=0.5, todo=0
    drawRing('ringPlay', (9 + 2*0.5) / 12, '#4ADAC2');
    // iOS: 5 done, 2 blocked, 2 todo = 9 total
    drawRing('ringIos', (5) / 9, '#E05252');
    // IAP: 7 done, 1 warn = 8 total
    drawRing('ringIap', (7 + 0.5) / 8, '#4ADAC2');
  }

  // Re-render on theme change
  var observer = new MutationObserver(function() { render(); });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

  render();
})();
})();

// ── Block 3 (was line ~5114): top-level tab switching ───────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  const ts=document.querySelectorAll('.tabs button'),ps=document.querySelectorAll('.pnl');
  ts.forEach(t=>t.addEventListener('click',()=>{
    ts.forEach(b=>b.classList.remove('on'));ps.forEach(p=>p.classList.remove('on'));
    t.classList.add('on');document.getElementById(t.dataset.t).classList.add('on');
  }));
});
