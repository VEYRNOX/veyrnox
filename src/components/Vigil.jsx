// @ts-nocheck
// components/Vigil.jsx
//
// Vigil — the Veyrnox mascot. A soft-shaded night owl used on paywall and
// popup surfaces to show, at a glance, whether protection is RUNNING.
//
// Four states, each mapped to an app state that already exists. There are
// deliberately no others: a mascot with emotional range the UI cannot trigger
// is decoration, and decoration next to a coercion warning reads as unserious.
//
//   clean   eyes wide, pupils full          verified / subscribed
//   alert   pupils shrink, brows lift       caution popups
//   block   eyes narrow, brows drop in      pre-sign BLOCK
//   asleep  eyes shut, saturation drains    paywall / locked feature
//
// `asleep` is the paywall state and it carries the honesty argument (I4):
// Vigil is OFF DUTY, not disappointed in you. It never implies protection that
// isn't running, and it never guilt-trips over money. Do not add a sad or
// crying variant — that is the exact turn this style takes against a product
// that handles someone's savings.
//
// DENIABILITY (I3) — Vigil renders IDENTICALLY in a decoy/hidden session and a
// primary one, and that is the invariant, not an oversight.
//
// An earlier version of this file gated the render on
// isDeniabilityOrDemoActive() and returned null in a decoy session. That was
// backwards. Read deniabilitySession.js: it is an EGRESS marker, and its whole
// docstring is about making "ZERO backend/device calls" from a coerced session.
// Vigil makes no calls — it draws an SVG from a prop. Gating the render bought
// nothing against egress and cost the thing that actually matters: a decoy
// session whose UI is missing a mascot the primary session shows is
// distinguishable from the primary session, which is the exact tell a decoy
// exists to deny. It also made Vigil unusable at a signing chokepoint, where a
// risk indicator vanishing is the worst possible failure.
//
// The convention in this codebase is narrower than "gate everything": suppress
// a render when the thing either egresses (SecurityAdvisor) or when its mere
// PRESENCE discloses cross-session state (PaywallNudge discloses tier). Vigil
// does neither — its state arrives as a prop, derived from the current
// session's own data, so it cannot leak the other session.
//
// The real I3 property here is NO PERSISTENCE, below. That one is pinned.
//
// NO PERSISTENCE. Vigil writes no localStorage key, ever. Anything persisted
// becomes panic-wipe residue and would have to join ALL_RESIDUE_KEYS; the
// cheap path is to store nothing, and a purely derived component has nothing
// to store.
//
// NO IDLE MOTION. The component is static. An infinite decorative loop burns
// battery and trains people to ignore the mascot, which kills it at the moment
// it matters. Animate on a state change the user caused, at the call site.
//
// The dimensional look is four cheap tricks, no dependency and no runtime 3D
// (Vigil ships at 24-120px inside a Capacitor webview, where a 3D runtime is
// all cost and no pixels):
//   1. radial body gradient, key light upper-left
//   2. a rim-light copy of the silhouette offset down-right (bounce light)
//   3. ambient occlusion where the belly and facial disc meet the body
//   4. a blurred contact shadow, so it sits on a surface instead of floating
// Render the actual model in Blender for store screenshots and marketing.

import { memo, useId } from 'react';

// Materials. `off` is desaturated but deliberately NOT dim: at the first
// near-black mid-tone it measured 1.8:1 against the card surface and the
// sleeping owl effectively vanished. This ramp sits at 3.7:1, clear of the
// 3:1 WCAG floor for a graphical object.
const MATERIAL = {
  teal: {
    hi: '#B6F8EA', mid: '#4ADAC2', lo: '#137A6C', rim: '#A6F5E6',
    bellyHi: '#E4FDF7', bellyLo: '#79E3D2',
    beakHi: '#FFC85F', beakLo: '#C97D08',
    dark: '#04100E',
  },
  off: {
    hi: '#8CA39D', mid: '#5E736D', lo: '#33423F', rim: '#93AAA4',
    bellyHi: '#A2B7B1', bellyLo: '#6C817B',
    beakHi: '#9A8A63', beakLo: '#6B5B36',
    dark: '#141B1A',
  },
};

const STATE_MATERIAL = { clean: 'teal', alert: 'teal', block: 'teal', asleep: 'off' };

// The ear-tuft angle carries most of the expression, which is why the
// silhouette still reads once the shading collapses at toast size.
const TUFT_ANGLE = { clean: 0, alert: 34, block: -26, asleep: -48 };

const EYE_L = 71;
const EYE_R = 129;
const EYE_Y = 86;
const EYE_RADIUS = 27;

const BODY_D =
  'M100 22C145 22 172 55 174 100 176 145 148 182 100 182 52 182 24 145 26 100 28 55 55 22 100 22Z';
const TUFT_L_D = 'M58 48C42 40 32 22 39 10 52 13 64 27 68 43Z';
const TUFT_R_D = 'M142 48C158 40 168 22 161 10 148 13 136 27 132 43Z';
const WING_L_D = 'M31 112C20 131 25 156 39 164 45 149 45 126 41 112Z';
const WING_R_D = 'M169 112C180 131 175 156 161 164 155 149 155 126 159 112Z';

// Spherical eye: base, pupil, then two speculars — a large one facing the key
// light and a small bounce opposite it. The speculars are what read as "3D"
// rather than "flat circle with a dot".
function OpenEye({ cx, ids, pupilR, grow = 0 }) {
  return (
    <>
      <circle cx={cx} cy={EYE_Y} r={EYE_RADIUS + grow} fill={`url(#${ids.eye})`} />
      <circle cx={cx} cy={EYE_Y} r={pupilR} fill={`url(#${ids.pupil})`} />
      <circle
        cx={cx - pupilR * 0.36}
        cy={EYE_Y - pupilR * 0.42}
        r={pupilR * 0.34}
        fill="#FFFFFF"
        opacity="0.95"
      />
      <circle
        cx={cx + pupilR * 0.4}
        cy={EYE_Y + pupilR * 0.44}
        r={pupilR * 0.16}
        fill="#FFFFFF"
        opacity="0.55"
      />
    </>
  );
}

// Narrowed lens — the BLOCK squint.
function LensEye({ cx, ids }) {
  const d =
    `M${cx - 27} ${EYE_Y + 4}` +
    `Q${cx} ${EYE_Y - 19} ${cx + 27} ${EYE_Y + 4}` +
    `Q${cx} ${EYE_Y + 21} ${cx - 27} ${EYE_Y + 4}Z`;
  return (
    <>
      <path d={d} fill={`url(#${ids.eye})`} />
      <circle cx={cx} cy={EYE_Y + 3} r={10} fill={`url(#${ids.pupil})`} />
      <circle cx={cx - 3.6} cy={EYE_Y - 1.2} r={3.4} fill="#FFFFFF" opacity="0.95" />
    </>
  );
}

function ShutEye({ cx, material }) {
  return (
    <path
      d={`M${cx - 23} ${EYE_Y - 3}Q${cx} ${EYE_Y + 16} ${cx + 23} ${EYE_Y - 3}`}
      fill="none"
      stroke={material.dark}
      strokeWidth={6}
      strokeLinecap="round"
      opacity="0.8"
    />
  );
}

function Eyes({ state, ids, material }) {
  if (state === 'asleep') {
    return (
      <>
        <ShutEye cx={EYE_L} material={material} />
        <ShutEye cx={EYE_R} material={material} />
      </>
    );
  }
  if (state === 'block') {
    return (
      <>
        <LensEye cx={EYE_L} ids={ids} />
        <LensEye cx={EYE_R} ids={ids} />
      </>
    );
  }
  if (state === 'alert') {
    return (
      <>
        <OpenEye cx={EYE_L} ids={ids} pupilR={6.5} grow={2} />
        <OpenEye cx={EYE_R} ids={ids} pupilR={6.5} grow={2} />
      </>
    );
  }
  return (
    <>
      <OpenEye cx={EYE_L} ids={ids} pupilR={14} />
      <OpenEye cx={EYE_R} ids={ids} pupilR={14} />
    </>
  );
}

// Brows are the half of the expression that survives at toast size, after the
// gradients and the pupil-size difference have both stopped being legible.
function Brows({ state, material }) {
  if (state === 'alert') {
    return (
      <>
        <path d="M44 52Q58 40 76 45" stroke={material.mid} strokeWidth={7} strokeLinecap="round" fill="none" />
        <path d="M156 52Q142 40 124 45" stroke={material.mid} strokeWidth={7} strokeLinecap="round" fill="none" />
      </>
    );
  }
  if (state === 'block') {
    return (
      <>
        <path d="M46 47 86 61" stroke={material.dark} strokeWidth={7} strokeLinecap="round" fill="none" opacity="0.85" />
        <path d="M154 47 114 61" stroke={material.dark} strokeWidth={7} strokeLinecap="round" fill="none" opacity="0.85" />
      </>
    );
  }
  return null;
}

/**
 * @param {object} props
 * @param {'clean'|'alert'|'block'|'asleep'} [props.state]
 * @param {number} [props.size] Rendered width in px. Height follows the viewBox.
 * @param {boolean} [props.shadow] Contact shadow. Defaults on above 48px; it
 *   only muddies the glyph at toast size.
 * @param {string} [props.className]
 */
function VigilImpl({ state = 'clean', size = 96, shadow, className = '' }) {
  const uid = useId().replace(/:/g, '');

  const material = MATERIAL[STATE_MATERIAL[state]] || MATERIAL.teal;
  const angle = TUFT_ANGLE[state] ?? 0;
  const withShadow = shadow ?? size >= 48;
  const ids = {
    body: `vg-body-${uid}`,
    belly: `vg-belly-${uid}`,
    eye: `vg-eye-${uid}`,
    pupil: `vg-pupil-${uid}`,
    beak: `vg-beak-${uid}`,
    ao: `vg-ao-${uid}`,
    blur: `vg-blur-${uid}`,
  };

  return (
    <svg
      viewBox="0 0 200 208"
      width={size}
      height={size * (208 / 200)}
      className={`shrink-0 ${className}`}
      // Stable hook for tests and for anyone auditing where the mascot ended
      // up in the DOM. Carries no accessible meaning — see aria-hidden below.
      data-vigil={state}
      // The sentence next to Vigil is the accessible signal — the mascot
      // repeats it, it never carries it alone (color-not-only). It is
      // deliberately NOT labelled: a screen reader announcing "Vigil, asleep"
      // would make the mascot the message rather than the echo of it.
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id={ids.body} cx="32%" cy="24%" r="82%">
          <stop offset="0%" stopColor={material.hi} />
          <stop offset="48%" stopColor={material.mid} />
          <stop offset="100%" stopColor={material.lo} />
        </radialGradient>
        <radialGradient id={ids.belly} cx="40%" cy="28%" r="84%">
          <stop offset="0%" stopColor={material.bellyHi} />
          <stop offset="100%" stopColor={material.bellyLo} />
        </radialGradient>
        <radialGradient id={ids.eye} cx="36%" cy="30%" r="76%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C4D4D1" />
        </radialGradient>
        <radialGradient id={ids.pupil} cx="34%" cy="28%" r="86%">
          <stop offset="0%" stopColor="#31413E" />
          <stop offset="100%" stopColor={material.dark} />
        </radialGradient>
        <linearGradient id={ids.beak} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={material.beakHi} />
          <stop offset="100%" stopColor={material.beakLo} />
        </linearGradient>
        <radialGradient id={ids.ao} cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <filter id={ids.blur} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* 4. contact shadow — grounds the character instead of floating it */}
      {withShadow && (
        <ellipse cx="100" cy="191" rx="56" ry="10" fill="#000000" opacity="0.5" filter={`url(#${ids.blur})`} />
      )}

      {/* 2. rim light: the same silhouette, brighter, offset down-right, so a
          bright edge peeks out along the shadow side. One extra group. */}
      <g transform="translate(3,3.5)" fill={material.rim}>
        <path d={TUFT_L_D} transform={`rotate(${angle} 60 46)`} />
        <path d={TUFT_R_D} transform={`rotate(${-angle} 140 46)`} />
        <path d={WING_L_D} />
        <path d={WING_R_D} />
        <path d={BODY_D} />
      </g>

      {/* tufts and wings sit behind the body so the joins are seamless */}
      <path d={TUFT_L_D} fill={`url(#${ids.body})`} transform={`rotate(${angle} 60 46)`} />
      <path d={TUFT_R_D} fill={`url(#${ids.body})`} transform={`rotate(${-angle} 140 46)`} />
      <path d={WING_L_D} fill={material.lo} />
      <path d={WING_R_D} fill={material.lo} />

      {/* 1. body, key light upper-left */}
      <path d={BODY_D} fill={`url(#${ids.body})`} />

      {/* 3. ambient occlusion under the chest and around the facial disc */}
      <ellipse cx="100" cy="148" rx="58" ry="44" fill={`url(#${ids.ao})`} />
      <ellipse cx="100" cy="150" rx="43" ry="30" fill={`url(#${ids.belly})`} />
      <ellipse cx="100" cy="92" rx="68" ry="56" fill={`url(#${ids.ao})`} />
      <ellipse cx="100" cy="87" rx="63" ry="52" fill={`url(#${ids.belly})`} />

      <Eyes state={state} ids={ids} material={material} />
      <Brows state={state} material={material} />

      <path
        d="M100 103 111 115Q100 129 89 115Z"
        fill={`url(#${ids.beak})`}
        stroke={material.beakLo}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <path d="M97 106 101 110" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" opacity="0.5" fill="none" />
    </svg>
  );
}

const Vigil = memo(VigilImpl);
export default Vigil;
