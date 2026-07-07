#!/usr/bin/env node
// patch-ios-plugin-list.mjs — ensures custom native plugins (not from node_modules)
// survive `npx cap sync ios`, which regenerates capacitor.config.json's
// packageClassList from node_modules only. Run after every `cap sync ios`.

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const CUSTOM_PLUGINS = ['HardwareKekPlugin'];
const configPath = resolve('ios/App/App/capacitor.config.json');

try {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const list = config.packageClassList || [];
  let changed = false;
  for (const p of CUSTOM_PLUGINS) {
    if (!list.includes(p)) {
      list.push(p);
      changed = true;
    }
  }
  if (changed) {
    config.packageClassList = list;
    writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n');
    console.log(`[patch-ios-plugin-list] Added ${CUSTOM_PLUGINS.join(', ')} to packageClassList`);
  }
} catch (e) {
  // Non-fatal: the file may not exist yet (first sync)
  console.warn('[patch-ios-plugin-list] skipped:', e.message);
}
