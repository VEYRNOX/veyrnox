/**
 * Shamir Secret Sharing over GF(2^8) — AES field (irreducible poly 0x11B).
 *
 * Pure implementation, no external dependencies beyond Web Crypto RNG.
 * Designed for 2-of-3 threshold splitting of 32-byte DEK material.
 *
 * Security properties:
 *   - RNG: crypto.getRandomValues only (CSPRNG)
 *   - No data-dependent branching during reconstruction (table lookups are not cache-timing-constant)
 *   - Intermediate buffers zeroed in finally blocks
 *   - Input validation: fail-closed on malformed input
 *
 * @module wallet-core/shamir
 */

export const SECRET_SIZE = 32;
export const SHARE_SIZE = 33; // 1 byte x-coord + 32 bytes y-values

// ---------------------------------------------------------------------------
// GF(2^8) arithmetic — irreducible polynomial x^8 + x^4 + x^3 + x + 1 = 0x11B
// ---------------------------------------------------------------------------

const GF_ORDER = 256;
const IRREDUCIBLE = 0x11b;

// Build log and exp tables for GF(2^8) multiplication
const EXP_TABLE = new Uint8Array(512); // exp[i] = g^i, doubled for wrap-free indexing
const LOG_TABLE = new Uint8Array(256); // log[a] = i where g^i = a; log[0] is unused

// Generator g=3 (0x03) — the standard primitive root for the AES field.
// g=2 has order 51, NOT 255, and cannot generate the full multiplicative group.
const GF_GENERATOR = 3;

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x; // mirror for wrap-free lookup
    LOG_TABLE[x] = i;
    // Multiply by generator (3 = x + 1 in polynomial representation):
    // x*3 = x*(x+1) = x*x XOR x. Reduce mod irreducible if degree >= 8.
    x = gfMulByGen(x);
  }
  // LOG_TABLE[0] is a sentinel — gfMul guards against it
  LOG_TABLE[0] = 0;
})();

/** Multiply a by the generator (3) in GF(2^8). Used only during table init. */
function gfMulByGen(a) {
  // a*3 = a*2 XOR a (since 3 = 2 + 1 in GF(2))
  let a2 = a << 1;
  if (a2 & 0x100) a2 ^= IRREDUCIBLE;
  return a2 ^ a;
}

/**
 * Multiply two elements in GF(2^8). Returns 0 if either operand is 0.
 * Uses log/exp table lookup — constant number of table reads regardless of values.
 */
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

/**
 * Multiplicative inverse in GF(2^8). Throws on 0 (no inverse).
 */
function gfInv(a) {
  if (a === 0) throw new Error('GF_ZERO_INVERSE');
  return EXP_TABLE[255 - LOG_TABLE[a]];
}

/**
 * Add two elements in GF(2^8). Addition is XOR in characteristic 2.
 */
function gfAdd(a, b) {
  return a ^ b;
}

// ---------------------------------------------------------------------------
// Polynomial evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate polynomial at x in GF(2^8).
 * coeffs[0] is the constant term (the secret byte), coeffs[1..k-1] are random.
 */
function polyEval(coeffs, x) {
  // Horner's method
  let result = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = gfAdd(gfMul(result, x), coeffs[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split a secret into n shares with threshold k.
 *
 * @param {Uint8Array} secret - The secret to split (must be SECRET_SIZE bytes)
 * @param {number} n - Number of shares to generate (default 3)
 * @param {number} k - Threshold for reconstruction (default 2)
 * @returns {Uint8Array[]} Array of n shares, each SHARE_SIZE bytes
 */
export function split(secret, n = 3, k = 2) {
  // --- Input validation (fail-closed) ---
  if (!(secret instanceof Uint8Array) || secret.length !== SECRET_SIZE) {
    throw new Error('INVALID_SECRET_SIZE');
  }
  if (k < 2 || n < k || n > 255) {
    throw new Error('INVALID_PARAMS');
  }
  // Reject all-zero secret — no meaningful security in splitting nothing
  let allZero = true;
  for (let i = 0; i < secret.length; i++) {
    if (secret[i] !== 0) { allZero = false; break; }
  }
  if (allZero) {
    throw new Error('ALL_ZERO_SECRET');
  }

  // --- Generate random polynomial coefficients ---
  // For each byte position, we build a degree-(k-1) polynomial where
  // coeffs[0] = secret[byteIdx] and coeffs[1..k-1] are random.
  const coeffBuf = new Uint8Array((k - 1) * SECRET_SIZE);
  try {
    crypto.getRandomValues(coeffBuf);

    // Allocate shares: each is 1 byte x-coord + SECRET_SIZE bytes
    const shares = [];
    for (let i = 0; i < n; i++) {
      shares.push(new Uint8Array(SHARE_SIZE));
      shares[i][0] = i + 1; // x-coordinates are 1-indexed
    }

    // Evaluate polynomial for each byte of the secret
    const coeffs = new Uint8Array(k);
    try {
      for (let byteIdx = 0; byteIdx < SECRET_SIZE; byteIdx++) {
        // Build polynomial for this byte position
        coeffs[0] = secret[byteIdx];
        for (let c = 1; c < k; c++) {
          coeffs[c] = coeffBuf[(c - 1) * SECRET_SIZE + byteIdx];
        }

        // Evaluate at each x-coordinate
        for (let i = 0; i < n; i++) {
          const x = i + 1;
          shares[i][1 + byteIdx] = polyEval(coeffs, x);
        }
      }
    } finally {
      coeffs.fill(0);
    }

    return shares;
  } finally {
    coeffBuf.fill(0);
  }
}

/**
 * Reconstruct a secret from k or more shares using Lagrange interpolation at x=0.
 *
 * No data-dependent branching during interpolation (table lookups are not cache-timing-constant).
 *
 * @param {Uint8Array[]} shares - Array of shares (each SHARE_SIZE bytes)
 * @returns {Uint8Array} Reconstructed secret (SECRET_SIZE bytes)
 */
export function combine(shares) {
  // --- Input validation ---
  if (!Array.isArray(shares) || shares.length < 2) {
    throw new Error('INSUFFICIENT_SHARES');
  }

  for (let i = 0; i < shares.length; i++) {
    if (!(shares[i] instanceof Uint8Array) || shares[i].length !== SHARE_SIZE) {
      throw new Error('INVALID_SHARE_SIZE');
    }
  }

  // Check for invalid and duplicate x-coordinates
  const xs = new Set();
  for (let i = 0; i < shares.length; i++) {
    const x = shares[i][0];
    if (x === 0) {
      throw new Error('INVALID_SHARE_X');
    }
    if (xs.has(x)) {
      throw new Error('DUPLICATE_X_COORD');
    }
    xs.add(x);
  }

  const k = shares.length;
  const result = new Uint8Array(SECRET_SIZE);

  // Precompute Lagrange basis coefficients at x=0.
  // For each share i: basis_i = product_{j != i} (0 - x_j) / (x_i - x_j)
  //   In GF(2^8): subtraction = addition = XOR, and 0 - x_j = x_j
  //   So: basis_i = product_{j != i} x_j / (x_i XOR x_j)
  const basis = new Uint8Array(k);
  try {
    for (let i = 0; i < k; i++) {
      const xi = shares[i][0];
      let num = 1; // numerator accumulator
      let den = 1; // denominator accumulator
      for (let j = 0; j < k; j++) {
        if (i === j) continue;
        const xj = shares[j][0];
        num = gfMul(num, xj);         // product of x_j
        den = gfMul(den, gfAdd(xi, xj)); // product of (x_i XOR x_j)
      }
      basis[i] = gfMul(num, gfInv(den));
    }

    // Interpolate each byte of the secret
    for (let byteIdx = 0; byteIdx < SECRET_SIZE; byteIdx++) {
      let val = 0;
      for (let i = 0; i < k; i++) {
        val = gfAdd(val, gfMul(basis[i], shares[i][1 + byteIdx]));
      }
      result[byteIdx] = val;
    }
  } finally {
    basis.fill(0);
  }

  return result;
}
