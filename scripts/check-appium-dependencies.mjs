#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const DRIVER_SOURCE = 'git+https://github.com/appium/appium-uiautomator2-driver.git#7a54db007aa8a44f5df21cd0b52afc13c0d277ae';
const watched = new Set(['axios', 'morgan', 'brace-expansion', 'appium', 'appium-uiautomator2-driver']);
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));

export function safeVersion(name, version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\w.-]+)?$/.exec(version);
  if (!match) return false; // Prereleases are not evidence of a shipped fix.
  const [major, minor, patch] = match.slice(1).map(Number);
  const floor = name === 'axios' ? [1, 20, 0] : name === 'morgan' ? [1, 12, 1]
    : ({ 1: [1, 1, 21], 2: [2, 1, 7], 5: [5, 0, 12] })[major];
  return Boolean(floor) && (major > floor[0] || (major === floor[0] &&
    (minor > floor[1] || (minor === floor[1] && patch >= floor[2]))));
}

export async function checkInstalledTree(root) {
  root = await realpath(root);
  const lock = await json(path.join(root, 'package-lock.json'));
  const pkg = await json(path.join(root, 'package.json'));
  assert.ok(lock.packages, 'A package-lock with packages is required');
  assert.equal(pkg.devDependencies?.['appium-uiautomator2-driver'], DRIVER_SOURCE, 'Driver must use the exact official source commit');
  assert.equal(lock.packages['']?.devDependencies?.['appium-uiautomator2-driver'], DRIVER_SOURCE, 'Root lock driver spec drift');
  const driverLock = lock.packages['node_modules/appium-uiautomator2-driver'];
  assert.ok([DRIVER_SOURCE, DRIVER_SOURCE.replace('git+https://github.com/', 'git+ssh://git@github.com/')].includes(driverLock?.resolved), 'Driver lock resolution must be the official pinned commit');
  const found = new Map();
  const seen = new Set();
  async function scan(modules) {
    // Walk actual package directories, not npm ls/lock metadata: bundled and
    // extraneous nested packages must be inspected too.
    for (const entry of await readdir(modules, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const dir = path.join(modules, entry.name);
      if (entry.name.startsWith('@')) {
        await scan(dir);
        continue;
      }
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const canonical = await realpath(dir);
      assert.ok(canonical.startsWith(`${root}${path.sep}`), `External dependency symlink: ${dir}`);
      assert.ok(!seen.has(canonical), `Repeated/symlinked package: ${dir}`);
      seen.add(canonical);
      const manifest = await json(path.join(dir, 'package.json'));
      const key = path.relative(root, dir).split(path.sep).join('/');
      // Also use the directory name so a renamed/malformed manifest cannot hide a target.
      const name = watched.has(entry.name) ? entry.name : manifest.name;
      if (watched.has(name)) {
        assert.equal(manifest.name, name, `Unexpected package identity at ${key}`);
        if (name === 'appium' || name === 'appium-uiautomator2-driver') {
          assert.equal(manifest.version, name === 'appium' ? '3.8.0' : '8.7.0', `Unexpected ${name} version at ${key}`);
        } else {
          assert.ok(safeVersion(name, manifest.version), `Vulnerable/unsupported ${name}@${manifest.version} on disk: ${key}`);
        }
        assert.equal(lock.packages[key]?.version, manifest.version, `Installed/lock mismatch at ${key}`);
        found.set(key, manifest);
      }
      try {
        await scan(path.join(dir, 'node_modules'));
      } catch (error) {
        if (error.code !== 'ENOENT' || error.path !== path.join(dir, 'node_modules')) throw error;
      }
    }
  }
  await scan(path.join(root, 'node_modules'));
  for (const name of watched) {
    assert.ok([...found.values()].some((p) => p.name === name), `No installed ${name} found`);
  }
  for (const name of ['appium', 'appium-uiautomator2-driver']) {
    const expected = path.join(root, 'node_modules', name);
    assert.ok(found.has(`node_modules/${name}`), `Missing root ${name}`);
    const require = createRequire(path.join(root, 'package.json'));
    // The source driver exposes only the ESM "import" condition at its root.
    const resolved = await realpath(require.resolve(`${name}/package.json`));
    assert.ok(resolved.startsWith(`${expected}${path.sep}`), `Unexpected ${name} runtime resolution: ${resolved}`);
    const entry = await realpath(path.resolve(expected, found.get(`node_modules/${name}`).main || 'index.js'));
    assert.ok(entry.startsWith(`${expected}${path.sep}`), `Unexpected ${name} entry: ${entry}`);
  }
  // Do not silently accept a lock-only fix whose expected targeted copies are absent.
  for (const key of Object.keys(lock.packages)) {
    if (watched.has(key.split('/node_modules/').at(-1).replace(/^node_modules\//, ''))) {
      assert.ok(found.has(key), `Locked package missing from disk: ${key}`);
    }
  }
  return found;
}

export async function smokeDriver(root) {
  const driverPkg = await json(path.join(root, 'node_modules/appium-uiautomator2-driver/package.json'));
  const driver = await import(pathToFileURL(path.resolve(root, 'node_modules/appium-uiautomator2-driver', driverPkg.main)).href);
  assert.equal(typeof driver.AndroidUiautomator2Driver, 'function', 'Driver ESM entry must export its Appium class');
  const env = { ...process.env };
  delete env.APPIUM_HOME;
  const require = createRequire(path.join(root, 'package.json'));
  const { env: appiumEnv } = require('@appium/support');
  // Assert discovery before startup: an existing ~/.appium must never supply the driver.
  const previousHome = process.env.APPIUM_HOME;
  delete process.env.APPIUM_HOME;
  try {
    assert.equal(await appiumEnv.resolveAppiumHome(root), root, 'Appium must discover this npm project');
  } finally {
    if (previousHome !== undefined) process.env.APPIUM_HOME = previousHome;
  }
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const scratch = await mkdtemp(path.join(tmpdir(), 'appium-smoke-'));
  let output = '';
  let spawnError;
  const child = spawn(process.execPath, [path.join(root, 'node_modules/appium/index.js'),
    '--address', '127.0.0.1', '--port', String(port), '--use-drivers', 'uiautomator2',
    '--log-level', 'debug', '--log-no-colors'], { cwd: root, env: { ...env, TMPDIR: scratch }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.on('error', (error) => { spawnError = error; });
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  try {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      assert.equal(child.exitCode, null, `Appium exited during startup:\n${output}`);
      if (output.includes('AndroidUiautomator2Driver has been successfully loaded')) {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(1000) });
          const status = await response.json();
          if (response.ok && status.value?.ready === true) {
            assert.ok(output.includes(path.join(root, 'node_modules/appium-uiautomator2-driver')), 'Server did not load the project driver');
            console.log('Appium server loaded project UiAutomator2 and returned ready (no device session).');
            return;
          }
        } catch (error) {
          if (error.code === 'ERR_ASSERTION') throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Appium driver startup timed out:\n${output}`);
  } finally {
    if (child.pid && !spawnError && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(killTimer);
    }
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.ok(process.argv.slice(2).every((arg) => arg === '--smoke'), 'Usage: node scripts/check-appium-dependencies.mjs [--smoke]');
    const root = await realpath(process.cwd());
    const found = await checkInstalledTree(root);
    console.log(`Installed dependency check passed (${found.size} targeted copies, including nested bundles).`);
    if (process.argv.includes('--smoke')) await smokeDriver(root);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
