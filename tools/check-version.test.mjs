import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkVersion, isChromeVersion } from './check-version.mjs';

const VERSION = '1.0.2';
const CLI_PATH = fileURLToPath(new URL('./check-version.mjs', import.meta.url));

function writeJson(root, filename, value) {
  const path = join(root, filename);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'm6-check-version-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  writeJson(root, 'package.json', { version: VERSION });
  writeJson(root, 'src/manifest.json', { version: VERSION });
  writeJson(root, 'package-lock.json', {
    version: VERSION,
    packages: { '': { version: VERSION } },
  });
  return root;
}

function updateJson(root, filename, update) {
  const path = join(root, filename);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  update(value);
  writeJson(root, filename, value);
}

test('accepte les versions stables compatibles avec Chrome', () => {
  for (const version of ['0.0.1', '0.1.0', '1.0.0', '65535.65535.65535']) {
    assert.equal(isChromeVersion(version), true, version);
  }
});

test('rejette les versions invalides ou incompatibles avec Chrome', () => {
  for (const version of [
    '', '0.0.0', '01.2.3', '1.02.3', '1.2.03', '1.2', '1.2.3.4',
    '65536.0.1', '1.65536.0', '1.2.65536', '1.2.3-rc.1', '1.2.3+build.1',
    '1.2.3\n', '1.2.3\r\n', 1,
  ]) {
    assert.equal(isChromeVersion(version), false, String(version));
  }
});

test('retourne la version cohérente depuis une racine injectable', (t) => {
  const root = createFixture(t);
  assert.equal(checkVersion({ root }), VERSION);
});

const versionFiles = [
  {
    label: 'package.json.version',
    filename: 'package.json',
    update: (value) => { value.version = '1.0.3'; },
  },
  {
    label: 'src/manifest.json.version',
    filename: 'src/manifest.json',
    update: (value) => { value.version = '1.0.3'; },
  },
  {
    label: 'package-lock.json.version',
    filename: 'package-lock.json',
    update: (value) => { value.version = '1.0.3'; },
  },
  {
    label: 'package-lock.json.packages[""].version',
    filename: 'package-lock.json',
    update: (value) => { value.packages[''].version = '1.0.3'; },
  },
];

for (const field of versionFiles) {
  test(`rejette un désalignement de ${field.label}`, (t) => {
    const root = createFixture(t);
    updateJson(root, field.filename, field.update);
    assert.throws(() => checkVersion({ root }), /Versions désalignées/);
  });
}

const missingVersionFiles = [
  {
    label: 'package.json.version',
    filename: 'package.json',
    update: (value) => { delete value.version; },
  },
  {
    label: 'src/manifest.json.version',
    filename: 'src/manifest.json',
    update: (value) => { delete value.version; },
  },
  {
    label: 'package-lock.json.version',
    filename: 'package-lock.json',
    update: (value) => { delete value.version; },
  },
  {
    label: 'package-lock.json.packages[""].version',
    filename: 'package-lock.json',
    update: (value) => { delete value.packages[''].version; },
  },
];

for (const field of missingVersionFiles) {
  test(`signale le champ manquant ${field.label}`, (t) => {
    const root = createFixture(t);
    updateJson(root, field.filename, field.update);
    assert.throws(() => checkVersion({ root }), (error) => error.message.includes(field.label));
  });
}

test('rejette les versions incompatibles dans les métadonnées', (t) => {
  const root = createFixture(t);
  for (const version of ['0.0.0', '01.0.2', '1.0.2-beta.1', '65536.0.0']) {
    updateJson(root, 'package.json', (value) => { value.version = version; });
    assert.throws(() => checkVersion({ root }), /Version incompatible/);
  }
});

test('accepte un tag identique et rejette les tags décalés ou invalides', (t) => {
  const root = createFixture(t);
  assert.equal(checkVersion({ root, tag: `v${VERSION}` }), VERSION);
  assert.throws(() => checkVersion({ root, tag: 'v1.0.3' }), /Tag incohérent/);

  for (const tag of ['1.0.2', 'v01.0.2', 'v1.0.2-rc.1', 'v1.0.2+build', 'v0.0.0', 'v65536.0.0']) {
    assert.throws(() => checkVersion({ root, tag }), /Tag invalide/);
  }
});

test('un désalignement arrête le packager avant la suppression de dist', (t) => {
  const root = createFixture(t);
  mkdirSync(join(root, 'dist'));
  const marker = join(root, 'dist', 'a-preserver.txt');
  writeFileSync(marker, 'conservé');
  updateJson(root, 'src/manifest.json', (value) => { value.version = '1.0.3'; });

  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./package.mjs', import.meta.url))], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Versions désalignées/);
  assert.equal(readFileSync(marker, 'utf8'), 'conservé');
});

test('un tag de publication décalé arrête le packager avant la suppression de dist', (t) => {
  const root = createFixture(t);
  mkdirSync(join(root, 'dist'));
  const marker = join(root, 'dist', 'a-preserver.txt');
  writeFileSync(marker, 'conservé');

  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./package.mjs', import.meta.url))], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, RELEASE_TAG: 'v1.0.3' },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Tag incohérent/);
  assert.equal(readFileSync(marker, 'utf8'), 'conservé');
});

test('le CLI affiche la version et échoue avec un tag décalé', (t) => {
  const root = createFixture(t);
  const success = spawnSync(process.execPath, [CLI_PATH], { cwd: root, encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.stdout.trim(), VERSION);

  const mismatch = spawnSync(process.execPath, [CLI_PATH, 'v1.0.3'], { cwd: root, encoding: 'utf8' });
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /Tag incohérent/);
});
