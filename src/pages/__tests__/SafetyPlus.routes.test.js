import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SAFETY_PLUS_ROUTES } from '@/lib/safetyPlusRoutes';

describe('SafetyPlus.jsx feature routes', () => {
  it('every route listed on the hub page exists in the canonical Safety Plus route list', () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const source = readFileSync(join(__dirname, '../SafetyPlus.jsx'), 'utf-8');
    const routeMatches = [...source.matchAll(/route:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(routeMatches.length).toBe(4);
    for (const route of routeMatches) {
      expect(SAFETY_PLUS_ROUTES, `${route} must be a real, gated route`).toContain(route);
    }
  });
});
