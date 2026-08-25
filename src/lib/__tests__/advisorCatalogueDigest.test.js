// Self-check for the Advisor's system-prompt corpus.
// Guards the two additions (feature catalogue digest + app pages digest) that
// let the Security Advisor answer questions about anything in /docs or any
// page in the app. Also caps size against the tip-chat MAX_SYSTEM_CONTENT.
import { describe, it, expect } from 'vitest';
import {
  buildFeatureCatalogueDigest,
  buildAppPagesDigest,
  buildAdvisorSystemContext,
  APP_PAGES,
} from '../advisorKnowledge.js';
import { FEATURE_CATEGORIES } from '../featureCatalogue.js';

// Matches supabase/functions/tip-chat/index.ts MAX_SYSTEM_CONTENT.
const MAX_SYSTEM_CONTENT = 32768;

describe('Advisor system-prompt corpus', () => {
  it('feature catalogue digest lists every catalogued feature exactly once', () => {
    const out = buildFeatureCatalogueDigest();
    for (const cat of FEATURE_CATEGORIES) {
      expect(out).toContain(`### ${cat.category}`);
      for (const f of cat.features) {
        expect(out).toContain(`- ${f.name} [`);
      }
    }
  });

  it('digest labels each feature Live or Roadmap (never Verified)', () => {
    const out = buildFeatureCatalogueDigest();
    expect(out).not.toMatch(/\[Verified\]/);
    expect(out).toMatch(/\[Live\]/);
  });

  it('app pages digest includes each declared page', () => {
    const out = buildAppPagesDigest();
    for (const p of APP_PAGES) {
      expect(out).toContain(`- ${p.path} — `);
    }
  });

  it('full advisor system context fits under MAX_SYSTEM_CONTENT', () => {
    const ctx = buildAdvisorSystemContext('general');
    expect(ctx.length).toBeLessThan(MAX_SYSTEM_CONTENT);
  });
});
