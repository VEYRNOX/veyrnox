// Typed re-export shim for recharts.
//
// recharts@2.x ships `XAxis`, `YAxis`, and `ReferenceLine` with a component type
// that lacks a usable `props` property under @types/react 18.3, so tsc rejects
// them as JSX components (TS2786 "cannot be used as a JSX component" + TS2607).
// They render perfectly at runtime — this is purely a library typings bug.
//
// This shim re-exports the entire recharts surface unchanged, then overrides just
// those three names with permissive component types so call sites type-check. The
// explicit named exports shadow the matching `export *` names, so every other
// recharts export passes through with its real types intact.
//
// Usage: import chart pieces from "@/lib/recharts" instead of "recharts" in any
// module that uses XAxis / YAxis / ReferenceLine.
export * from "recharts";

import {
  XAxis as _XAxis,
  YAxis as _YAxis,
  ReferenceLine as _ReferenceLine,
} from "recharts";

/** @type {any} */
export const XAxis = _XAxis;
/** @type {any} */
export const YAxis = _YAxis;
/** @type {any} */
export const ReferenceLine = _ReferenceLine;
