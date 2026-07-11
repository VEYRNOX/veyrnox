import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const pageSrc = readFileSync(join(dir, '../AppHealthPage.jsx'), 'utf8');
const settingsSrc = readFileSync(join(dir, '../Settings.jsx'), 'utf8');
const appSrc = readFileSync(join(dir, '../../App.jsx'), 'utf8');

describe('AppHealthPage.jsx', () => {
  it('renders AppHealthWidget', () => {
    expect(pageSrc).toMatch(/AppHealthWidget/);
  });
});

describe('App.jsx route', () => {
  it('has a /app-health route', () => {
    expect(appSrc).toMatch(/app-health/);
    expect(appSrc).toMatch(/AppHealthPage/);
  });
});

describe('Settings.jsx', () => {
  it('links to /app-health', () => {
    expect(settingsSrc).toMatch(/app-health/);
  });

  it('renders a warning dot when issues exist', () => {
    expect(settingsSrc).toMatch(/issueCount|issue.*dot|warn.*dot|dot.*warn/i);
  });
});
