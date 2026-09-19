import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// play.releaseNotes exists because Apple's whatsNew could not serve Play:
// Apple caps at 4000 characters, Play at 500, and Play attaches release notes
// to a track RELEASE rather than to a listing. These pins guard the two ways
// that distinction gets lost — someone copying apple.whatsNew across, and
// someone letting a locale drift over Play's much tighter cap.
const METADATA_DIR = join(process.cwd(), 'store-metadata');
const PLAY_LIMIT = 500;

const entries = readdirSync(METADATA_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(METADATA_DIR, f), 'utf8')));

const schema = JSON.parse(readFileSync(join(METADATA_DIR, '_schema.json'), 'utf8'));

describe('play.releaseNotes', () => {
  it('is declared in the schema', () => {
    expect(schema.properties.play.properties.releaseNotes).toBeDefined();
  });

  it('exists in every locale, non-empty', () => {
    const missing = entries
      .filter((e) => !e.play?.releaseNotes?.value?.trim())
      .map((e) => e.locale);
    expect(missing).toEqual([]);
  });

  it('is within Play’s 500-character cap in every locale', () => {
    const over = entries
      .filter((e) => (e.play?.releaseNotes?.value?.length ?? 0) > PLAY_LIMIT)
      .map((e) => `${e.locale}:${e.play.releaseNotes.value.length}`);
    expect(over).toEqual([]);
  });

  it('declares the Play limit, not Apple’s', () => {
    const wrong = entries
      .filter((e) => e.play?.releaseNotes?.limit !== PLAY_LIMIT)
      .map((e) => `${e.locale}:${e.play?.releaseNotes?.limit}`);
    expect(wrong).toEqual([]);
  });

  // The failure this is really guarding: apple.whatsNew pasted into
  // play.releaseNotes. It fits the 4000 cap, so no other pin here would fire.
  it('is never a copy of apple.whatsNew', () => {
    const copied = entries
      .filter((e) => e.play?.releaseNotes?.value === e.apple?.whatsNew?.value)
      .map((e) => e.locale);
    expect(copied).toEqual([]);
  });
});
