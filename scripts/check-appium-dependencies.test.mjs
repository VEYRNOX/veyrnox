import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkInstalledTree, DRIVER_SOURCE, safeVersion } from './check-appium-dependencies.mjs';

const versions = {
  appium: '3.8.0',
  'appium-uiautomator2-driver': '8.7.0',
  axios: '1.20.0',
  morgan: '1.12.1',
  'brace-expansion': '5.0.12',
};

test('WDIO default and APPIUM_APP override agree with the emulator APK contract', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const harness = await readFile(path.join(root, '.github/scripts/android-e2e-emulator.sh'), 'utf8');
  const apk = /^APK_PATH="([^"]+)"$/m.exec(harness)?.[1];
  assert.equal(apk, 'android/app/build/outputs/apk/google/debug/app-google-debug.apk');
  assert.match(harness, /^export APPIUM_APP="\$PWD\/\$APK_PATH"$/m);
  const previous = process.env.APPIUM_APP;
  try {
    delete process.env.APPIUM_APP;
    const defaults = await import('../tests/android/wdio.conf.js?appium-contract=default');
    assert.equal(defaults.config.capabilities[0]['appium:app'], path.resolve(root, apk));
    process.env.APPIUM_APP = path.join(tmpdir(), 'appium-contract-custom.apk');
    const override = await import('../tests/android/wdio.conf.js?appium-contract=override');
    assert.equal(override.config.capabilities[0]['appium:app'], process.env.APPIUM_APP);
  } finally {
    if (previous === undefined) delete process.env.APPIUM_APP;
    else process.env.APPIUM_APP = previous;
  }
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'appium-dependencies-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const pkg = { devDependencies: { 'appium-uiautomator2-driver': DRIVER_SOURCE } };
  const lock = { packages: { '': pkg } };
  const writeJson = (file, value) => writeFile(path.join(root, file), JSON.stringify(value));
  async function install(key, name, version, lockedVersion = version) {
    await mkdir(path.join(root, key), { recursive: true });
    await writeJson(`${key}/package.json`, { name, version, main: 'index.js' });
    await writeFile(path.join(root, key, 'index.js'), 'module.exports = {};');
    if (lockedVersion !== null) lock.packages[key] = { version: lockedVersion };
  }
  for (const [name, version] of Object.entries(versions)) {
    await install(`node_modules/${name}`, name, version);
  }
  lock.packages['node_modules/appium-uiautomator2-driver'].resolved = DRIVER_SOURCE;
  async function save() {
    await writeJson('package.json', pkg);
    await writeJson('package-lock.json', lock);
  }
  await save();
  return { root, pkg, lock, install, save };
}

test('security floors reject old, prerelease, malformed and unexpected brace major versions', () => {
  for (const [name, bad, good] of [
    ['axios', '1.19.0', '1.20.0'],
    ['morgan', '1.12.0', '1.12.1'],
    ['brace-expansion', '1.1.20', '1.1.21'],
    ['brace-expansion', '2.1.6', '2.1.7'],
    ['brace-expansion', '5.0.11', '5.0.12'],
  ]) {
    assert.equal(safeVersion(name, bad), false);
    assert.equal(safeVersion(name, good), true);
    assert.equal(safeVersion(name, `${good}-rc.1`), false);
    assert.equal(safeVersion(name, 'garbage'), false);
  }
  for (const version of ['0.99.0', '3.0.0', '4.0.0', '6.0.0']) {
    assert.equal(safeVersion('brace-expansion', version), false);
  }
});

test('accepts matching installed versions, including scoped nested packages', async (t) => {
  const f = await fixture(t);
  await f.install('node_modules/@example/consumer', '@example/consumer', '1.0.0');
  await f.install('node_modules/@example/consumer/node_modules/brace-expansion', 'brace-expansion', '2.1.7');
  await f.save();
  assert.equal((await checkInstalledTree(f.root)).size, 6);
});

test('accepts the source driver ESM-only root export', async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, 'node_modules/appium-uiautomator2-driver/package.json'), JSON.stringify({
    name: 'appium-uiautomator2-driver', version: '8.7.0', type: 'module', main: './index.js',
    exports: { '.': { import: './index.js' }, './package.json': './package.json' },
  }));
  assert.equal((await checkInstalledTree(f.root)).size, 5);
});

for (const [name, version] of [['axios', '1.19.0'], ['morgan', '1.12.0'], ['brace-expansion', '5.0.9']]) {
  test(`rejects vulnerable bundled ${name} absent from lock metadata`, async (t) => {
    const f = await fixture(t);
    await f.install(`node_modules/appium-uiautomator2-driver/node_modules/${name}`, name, version, null);
    await f.save();
    await assert.rejects(checkInstalledTree(f.root), /Vulnerable\/unsupported/);
  });
}

test('rejects patched lock metadata hiding vulnerable installed bytes', async (t) => {
  const f = await fixture(t);
  await f.install('node_modules/axios', 'axios', '1.18.0', '1.20.0');
  await f.save();
  await assert.rejects(checkInstalledTree(f.root), /Vulnerable\/unsupported axios@1.18.0/);
});

test('rejects safe installed version that disagrees with lock', async (t) => {
  const f = await fixture(t);
  await f.install('node_modules/axios', 'axios', '1.20.1', '1.20.0');
  await f.save();
  await assert.rejects(checkInstalledTree(f.root), /Installed\/lock mismatch/);
});

test('rejects safe extraneous bundled copy missing from lock', async (t) => {
  const f = await fixture(t);
  await f.install('node_modules/appium-uiautomator2-driver/node_modules/morgan', 'morgan', '1.12.1', null);
  await f.save();
  await assert.rejects(checkInstalledTree(f.root), /Installed\/lock mismatch/);
});

test('rejects missing installed tree rather than passing lock-only scan', async (t) => {
  const f = await fixture(t);
  await rm(path.join(f.root, 'node_modules'), { recursive: true });
  await assert.rejects(checkInstalledTree(f.root), /ENOENT/);
});

test('rejects a missing nested copy expected by the lock', async (t) => {
  const f = await fixture(t);
  f.lock.packages['node_modules/appium/node_modules/morgan'] = { version: '1.12.1' };
  await f.save();
  await assert.rejects(checkInstalledTree(f.root), /Locked package missing from disk/);
});

test('rejects registry driver substitution even when version remains 8.7.0', async (t) => {
  const f = await fixture(t);
  f.lock.packages['node_modules/appium-uiautomator2-driver'].resolved = 'https://registry.npmjs.org/appium-uiautomator2-driver/-/appium-uiautomator2-driver-8.7.0.tgz';
  await f.save();
  await assert.rejects(checkInstalledTree(f.root), /official pinned commit/);
});

test('rejects changed source SHA in the root declaration', async (t) => {
  const f = await fixture(t);
  f.pkg.devDependencies['appium-uiautomator2-driver'] = DRIVER_SOURCE.replace(/#.*$/, '#main');
  await f.save();
  await assert.rejects(checkInstalledTree(f.root), /exact official source commit/);
});
