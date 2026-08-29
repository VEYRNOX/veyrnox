import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getParentRoute } from '../parentRoute';

const appSrc = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8');
const start = appSrc.indexOf('<Route element={<Layout />}>');
const end = appSrc.indexOf('</Route>', start);
const layoutBlock = appSrc.slice(start, end);
const layoutRoutes = [...layoutBlock.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((path) => path !== '/' && !path.includes(':'));

describe('parentRoute coverage', () => {
  it('provides a non-self fallback for every concrete layout route', () => {
    const missing = layoutRoutes.filter((path) => getParentRoute(path) === path);
    expect(missing).toEqual([]);
  });
});
