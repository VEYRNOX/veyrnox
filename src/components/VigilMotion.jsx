// components/VigilMotion.jsx
//
// Motion wrapper for Vigil on paywall surfaces. Vigil itself stays static
// (Vigil.test.jsx pins that); all movement lives here, transform-only CSS.
//
// Owner request 2026-10-21: the mascot moves around the paywalls and opens
// its wings to show its feathers. Every animation is ONE-SHOT, so this does
// not become the battery-burning idle loop Vigil.jsx warns about:
//   1. wings open on mount, hold, fold (vigil-wings.css `open`)
//   2. tap flaps the wings and hops once (`flap`, user-caused)
//
// Vigil stays `asleep` on paywalls (I4): the wings are decoration, never a
// pleading gesture. Reduced motion renders the static owl, no wings.
// No persistence, no network, nothing disclosed across sessions (I3).

import { useId, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import Vigil from '@/components/Vigil';
import './vigil-wings.css';

const FEATHERS = 6;
// Shoulder pivot of the left wing in Vigil's 200x208 viewBox; the right wing
// mirrors about x=100.
const PIVOT_X = 34;
const PIVOT_Y = 118;
// Wing canvas is wider than the owl: x from -110 to 310.
const VB_X = -110;
const VB_Y = -6;
const VB_W = 420;
const VB_H = 220;

const PALETTE = {
  teal: { aLo: '#137A6C', aHi: '#4ADAC2', bLo: '#1B9482', bHi: '#B6F8EA' },
  off: { aLo: '#33423F', aHi: '#5E736D', bLo: '#3D4E4A', bHi: '#6C817B' },
};

const FEATHER_SPECS = Array.from({ length: FEATHERS }, (_, i) => ({
  length: 80 + i * 9,
  from: -78 - i * 2.5,
  to: 42 - i * 18,
  delay: i * 45,
  bulge: 10 + i,
}));

function featherPath({ length, bulge }) {
  const k = length * 0.75;
  return `M0 0C-12 -${bulge} -${k} -${bulge + 1} -${length} 0C-${k} ${bulge + 1} -12 ${bulge} 0 0Z`;
}

function Wing({ mirrored, ids }) {
  const transform = mirrored
    ? `translate(${200 - PIVOT_X} ${PIVOT_Y}) scale(-1 1)`
    : `translate(${PIVOT_X} ${PIVOT_Y})`;
  // Outer feathers first so the inner ones overlap them.
  const order = [...FEATHER_SPECS.keys()].reverse();
  return (
    <g transform={transform}>
      {order.map((i) => {
        const f = FEATHER_SPECS[i];
        return (
          <g
            key={i}
            className="vw-feather"
            style={/** @type {import('react').CSSProperties} */ ({ '--from': `${f.from}deg`, '--to': `${f.to}deg`, '--d': `${f.delay}ms` })}
          >
            <path d={featherPath(f)} fill={`url(#${i % 2 ? ids.b : ids.a})`} />
            <path d={`M-8 0H-${f.length - 6}`} stroke="#04100E" strokeWidth="1.6" opacity="0.35" strokeLinecap="round" />
          </g>
        );
      })}
    </g>
  );
}

/**
 * @param {{ state?: 'clean'|'alert'|'block'|'asleep', size?: number }} props
 */
export default function VigilMotion({ state = 'asleep', size = 84 }) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, '');
  const [play, setPlay] = useState('open');
  const [run, setRun] = useState(0);

  if (reduce) return <Vigil state={state} size={size} />;

  const p = PALETTE[state === 'asleep' ? 'off' : 'teal'];
  const ids = { a: `vw-a-${uid}`, b: `vw-b-${uid}` };
  const scale = size / 200;

  const react = () => {
    setPlay('flap');
    setRun((n) => n + 1);
  };

  return (
    <div
      key={run}
      data-vigil-motion
      data-play={play}
      className="vw-root relative inline-block"
      style={{ width: VB_W * scale, height: VB_H * scale }}
      onPointerDown={react}
    >
      <svg
        viewBox={`${VB_X} ${VB_Y} ${VB_W} ${VB_H}`}
        width={VB_W * scale}
        height={VB_H * scale}
        className="absolute inset-0"
        aria-hidden
        focusable="false"
      >
        <defs>
          <linearGradient id={ids.a} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={p.aLo} />
            <stop offset="1" stopColor={p.aHi} />
          </linearGradient>
          <linearGradient id={ids.b} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={p.bLo} />
            <stop offset="1" stopColor={p.bHi} />
          </linearGradient>
        </defs>
        <Wing mirrored={false} ids={ids} />
        <Wing mirrored ids={ids} />
      </svg>
      <div
        className="vw-body absolute"
        style={{ left: -VB_X * scale, top: -VB_Y * scale }}
      >
        <Vigil state={state} size={size} />
      </div>
    </div>
  );
}
