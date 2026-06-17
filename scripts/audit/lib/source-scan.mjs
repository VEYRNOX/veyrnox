// scripts/audit/lib/source-scan.mjs
//
// Shared source scanner for the security tooling (check-crypto-rng.mjs and the
// audit:eth harness). ONE corrected implementation so the two cannot drift.
//
// stripCommentsAndStrings() blanks comment + string/regex LITERAL content so a
// pattern check matches real CODE, while fixing the fail-open bugs a naive
// stripper has:
//   1. line numbers are preserved EXACTLY (newlines kept in every state) — a
//      multiline string/template no longer shifts the lines reported after it.
//   2. a regex literal's quotes do NOT start a string state (the bug that
//      blanked all following code until a stray quote, hiding later violations).
//   3. code inside a template `${...}` interpolation IS scanned (a real
//      fetch()/secret/Math.random() inside an interpolation is no longer blanked).
//
// Regex-vs-division detection is the one unavoidable heuristic (it is undecidable
// without a full parser); it is biased toward NOT entering a string state, so the
// failure mode is a false POSITIVE (investigated + dismissed) rather than a
// false negative (missed violation) — the safe direction for a security gate.

import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);

/** Recursively collect source files under `dir` (skips dirs in `skip`). */
export function walk(dir, { skip = new Set(), acc = [] } = {}) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, { skip, acc });
    else if (EXTS.has(extname(p))) acc.push(p);
  }
  return acc;
}

// Blank a char while preserving newlines and tabs (keeps line/column numbers).
const blank = (c) => (c === '\n' ? '\n' : c === '\t' ? '\t' : ' ');

// A regex literal can begin where an EXPRESSION is expected. Treat `/` as
// division after a "value" (identifier/digit/`)`/`]`/`}` or a just-closed
// literal); otherwise as a regex start. Conservative on purpose (see header).
function regexAllowed(prevSig) {
  if (!prevSig) return true;
  return /[(,=:[!&|?{;}+\-*%<>^~]/.test(prevSig);
}

export function stripCommentsAndStrings(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  let mode = 'code'; // code | line | block | sq | dq | tpl
  let prevSig = '';   // last significant code char emitted (for regex detection)
  // Template-interpolation support: entering `${` pushes the enclosing 'tpl' and
  // a brace counter; the matching `}` (at counter 0) returns to that template.
  const tplStack = [];
  const braceDepth = [];

  const emit = (c) => { out += c; if (!/\s/.test(c)) prevSig = c; };

  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];

    if (mode === 'code') {
      if (c === '/' && c2 === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") { mode = 'sq'; out += ' '; i++; continue; }
      if (c === '"') { mode = 'dq'; out += ' '; i++; continue; }
      if (c === '`') { mode = 'tpl'; out += ' '; i++; continue; }
      if (c === '/' && regexAllowed(prevSig)) { i = skipRegex(text, i, (ch) => { out += blank(ch); }); prevSig = '/'; continue; }
      // Close of a `${...}` interpolation → back to the template literal.
      if (c === '}' && tplStack.length && braceDepth[braceDepth.length - 1] === 0) {
        braceDepth.pop(); mode = tplStack.pop(); out += blank(c); i++; continue;
      }
      if (c === '{' && braceDepth.length) braceDepth[braceDepth.length - 1]++;
      else if (c === '}' && braceDepth.length) braceDepth[braceDepth.length - 1]--;
      emit(c); i++; continue;
    }

    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += '\n'; } else out += blank(c); i++; continue; }
    if (mode === 'block') { if (c === '*' && c2 === '/') { mode = 'code'; out += '  '; i += 2; } else { out += blank(c); i++; } continue; }

    // String / template states.
    if (c === '\\') { out += blank(c); if (i + 1 < n) out += blank(text[i + 1]); i += 2; continue; }
    if (mode === 'sq' && c === "'") { mode = 'code'; out += ' '; prevSig = "x"; i++; continue; }
    if (mode === 'dq' && c === '"') { mode = 'code'; out += ' '; prevSig = "x"; i++; continue; }
    if (mode === 'tpl') {
      if (c === '`') { mode = 'code'; out += ' '; prevSig = 'x'; i++; continue; }
      if (c === '$' && c2 === '{') { tplStack.push('tpl'); braceDepth.push(0); mode = 'code'; out += '  '; i += 2; continue; }
    }
    out += blank(c); i++;
  }
  return out;
}

// Consume a regex literal /.../[flags] starting at `i`, emitting blanks for its
// content (so quotes inside cannot start a string). Honors escapes and `[...]`
// char classes (where `/` is literal). Returns the index just past the literal.
function skipRegex(text, i, emitBlank) {
  const n = text.length;
  emitBlank(text[i]); i++; // opening /
  let inClass = false;
  while (i < n) {
    const ch = text[i];
    if (ch === '\n') break; // unterminated — bail, leave rest as code
    if (ch === '\\') { emitBlank(ch); if (i + 1 < n) emitBlank(text[i + 1]); i += 2; continue; }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) { emitBlank(ch); i++; break; }
    emitBlank(ch); i++;
  }
  while (i < n && /[a-z]/i.test(text[i])) { emitBlank(text[i]); i++; } // flags
  return i;
}
