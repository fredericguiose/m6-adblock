import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_COMPONENT = 65535;

export function isChromeVersion(version) {
  if (typeof version !== 'string') return false;
  const components = version.match(VERSION_PATTERN);
  if (!components) return false;

  const numbers = components.slice(1).map(Number);
  return numbers.some((component) => component !== 0)
    && numbers.every((component) => component <= MAX_COMPONENT);
}

function readJson(root, filename) {
  let content;
  try {
    content = readFileSync(resolve(root, filename), 'utf8');
  } catch (error) {
    throw new Error(`Lecture de ${filename} impossible : ${error.message}`, { cause: error });
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`JSON invalide dans ${filename} : ${error.message}`, { cause: error });
  }
}

function describe(value) {
  return value === undefined ? 'absent' : JSON.stringify(value);
}

function requireVersion(label, value) {
  if (typeof value !== 'string') {
    throw new Error(`Champ ${label} manquant ou non textuel (${describe(value)}).`);
  }
  if (!isChromeVersion(value)) {
    throw new Error(`Version incompatible dans ${label} : ${JSON.stringify(value)}. Attendu une version stable MAJOR.MINOR.PATCH, sans zéros initiaux, avec des composantes de 0 à ${MAX_COMPONENT}, différente de 0.0.0.`);
  }
  return value;
}

function checkTag(tag, version) {
  if (typeof tag !== 'string' || !tag.startsWith('v') || !isChromeVersion(tag.slice(1))) {
    throw new Error(`Tag invalide ${JSON.stringify(tag)}. Attendu vMAJOR.MINOR.PATCH avec une version stable compatible Chrome.`);
  }
  if (tag.slice(1) !== version) {
    throw new Error(`Tag incohérent : ${tag} ne correspond pas à la version ${version}.`);
  }
}

export function checkVersion({ root = process.cwd(), tag } = {}) {
  const packageJson = readJson(root, 'package.json');
  const manifest = readJson(root, 'src/manifest.json');
  const packageLock = readJson(root, 'package-lock.json');
  const versions = [
    ['package.json.version', packageJson?.version],
    ['src/manifest.json.version', manifest?.version],
    ['package-lock.json.version', packageLock?.version],
    ['package-lock.json.packages[""].version', packageLock?.packages?.['']?.version],
  ].map(([label, value]) => [label, requireVersion(label, value)]);

  const [expectedLabel, expectedVersion] = versions[0];
  const mismatches = versions.filter(([, version]) => version !== expectedVersion);
  if (mismatches.length > 0) {
    const details = versions.map(([label, version]) => `${label}=${version}`).join(', ');
    throw new Error(`Versions désalignées (référence ${expectedLabel}=${expectedVersion}) : ${details}.`);
  }

  if (tag !== undefined) checkTag(tag, expectedVersion);
  return expectedVersion;
}

function runCli(args) {
  if (args.length > 1) {
    throw new Error('Usage : node tools/check-version.mjs [vX.Y.Z]');
  }
  return checkVersion({ tag: args[0] });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${runCli(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`Erreur : ${error.message}\n`);
    process.exitCode = 1;
  }
}
