import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { KNOWLEDGE_BASE } from '@/lib/advisorKnowledge.js';
import { FEATURE_CATEGORIES } from '@/lib/featureCatalogue.js';
import {
  LIVE_SEND_ENABLED_ASSET_COUNT,
  NON_LIVE_ASSET_SPEND_NOTICE,
  RECEIVE_ONLY_ASSET_COUNT,
  TOTAL_SUPPORTED_ASSET_COUNT,
} from '../assets.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

describe('current-product asset counts and receive-only copy', () => {
  it('keeps every runtime UI count field registry-derived', () => {
    for (const path of [
      'src/pages/LandingPage.jsx',
      'src/pages/Documentation.jsx',
      'src/lib/advisorKnowledge.js',
    ]) {
      const source = read(path);
      expect(source, path).toContain('TOTAL_SUPPORTED_ASSET_COUNT');
      expect(source, path).toContain('LIVE_SEND_ENABLED_ASSET_COUNT');
      expect(source, path).toContain('RECEIVE_ONLY_ASSET_COUNT');
      expect(source, path).toContain('NON_LIVE_ASSET_SPEND_NOTICE');
    }

    const landing = read('src/pages/LandingPage.jsx');
    expect(landing).toMatch(
      /Receive \$\{TOTAL_SUPPORTED_ASSET_COUNT\} assets[\s\S]*?\$\{LIVE_SEND_ENABLED_ASSET_COUNT\}[\s\S]*?\$\{RECEIVE_ONLY_ASSET_COUNT\} are receive-only/,
    );
    expect(landing).toMatch(
      /Self-custody across \{TOTAL_SUPPORTED_ASSET_COUNT\} assets[\s\S]*?\{LIVE_SEND_ENABLED_ASSET_COUNT\} live\/send-enabled[\s\S]*?\{RECEIVE_ONLY_ASSET_COUNT\} receive-only/,
    );

    expect(read('src/pages/Documentation.jsx')).toMatch(
      /\{TOTAL_SUPPORTED_ASSET_COUNT\} assets across 8 networks:[\s\S]*?\{LIVE_SEND_ENABLED_ASSET_COUNT\} are live\/send-enabled;[\s\S]*?\{RECEIVE_ONLY_ASSET_COUNT\} receive-only assets/,
    );
  });

  it('keeps README total/live/receive-only fields equal to the registry split', () => {
    const readme = read('README.md');
    const totalCopy = readme.match(/supports (\d+) assets in total: the (\d+) verified live\/send-enabled assets[\s\S]*?as (\d+) receive-only Ethereum tokens/);
    expect(totalCopy?.slice(1).map(Number)).toEqual([
      TOTAL_SUPPORTED_ASSET_COUNT,
      LIVE_SEND_ENABLED_ASSET_COUNT,
      RECEIVE_ONLY_ASSET_COUNT,
    ]);
    expect(readme).toContain(`All ${LIVE_SEND_ENABLED_ASSET_COUNT} assets are testnet-verified`);
    expect(readme).toContain(NON_LIVE_ASSET_SPEND_NOTICE);

    const featureStatus = read('docs/Feature-Status.md');
    const heading = featureStatus.match(/Assets & send-gating \((\d+) standardized assets: (\d+) live, (\d+) receive-only\)/);
    expect(heading?.slice(1).map(Number)).toEqual([
      TOTAL_SUPPORTED_ASSET_COUNT,
      LIVE_SEND_ENABLED_ASSET_COUNT,
      RECEIVE_ONLY_ASSET_COUNT,
    ]);
    expect(featureStatus).toContain(NON_LIVE_ASSET_SPEND_NOTICE);
  });

  it('keeps advisor and feature-catalogue output count-correct and capability-honest', () => {
    const answer = KNOWLEDGE_BASE.general.entries.find(
      (entry) => entry.q === 'What blockchains does Veyrnox support?',
    )?.a;
    expect(answer).toContain(`supports ${TOTAL_SUPPORTED_ASSET_COUNT} assets`);
    expect(answer).toContain(`${LIVE_SEND_ENABLED_ASSET_COUNT} are live/send-enabled`);
    expect(answer).toContain(`the ${RECEIVE_ONLY_ASSET_COUNT} receive-only assets`);
    expect(answer).toContain(NON_LIVE_ASSET_SPEND_NOTICE);

    const networkFeatures = FEATURE_CATEGORIES.find(
      (category) => category.category === 'Networks & Assets',
    )?.features;
    const erc20 = networkFeatures?.find((feature) => feature.name === 'ERC-20 Tokens');
    const additional = networkFeatures?.find((feature) => feature.name === 'Additional Tokens');
    expect(erc20?.summary).toContain(`${RECEIVE_ONLY_ASSET_COUNT} Ethereum tokens receive-only`);
    expect(erc20?.explanation).toContain(NON_LIVE_ASSET_SPEND_NOTICE);
    expect(additional).toMatchObject({ status: 'built' });
    expect(additional?.summary).toContain(NON_LIVE_ASSET_SPEND_NOTICE);
    expect(additional?.explanation).toContain(NON_LIVE_ASSET_SPEND_NOTICE);
  });

  it('uses the exact connected-dApp caveat on the remaining current-product asset surfaces', () => {
    for (const path of [
      'src/components/SecurityAdvisor.jsx',
      'src/pages/LandingPage.jsx',
      'src/pages/Documentation.jsx',
      'src/lib/featureCatalogue.js',
    ]) {
      expect(read(path), path).toContain('NON_LIVE_ASSET_SPEND_NOTICE');
    }
    expect(NON_LIVE_ASSET_SPEND_NOTICE).toBe(
      'Direct sends are disabled. Connected dApps may still spend this token through existing approvals.',
    );
  });
});
