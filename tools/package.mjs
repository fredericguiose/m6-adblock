/**
 * package.mjs — construit l'extension puis genere le .zip a uploader sur le
 * Chrome Web Store.
 *
 * Encodeur ZIP maison (sans dependance) qui garantit :
 *   - manifest.json A LA RACINE du zip,
 *   - des separateurs de chemin "/" (la spec ZIP l'exige ; Compress-Archive de
 *     Windows met des "\" et fait echouer la lecture des sous-dossiers),
 *   - l'exclusion de _metadata (residu genere par Chrome en mode non empaquete).
 *
 * Sortie : release/m6-adblock-v<version>.zip
 */
import { deflateRawSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const out = `release/m6-adblock-v${version}.zip`;

// --- build propre (dist vide -> pas de _metadata residuel) -----------------
rmSync('dist', { recursive: true, force: true });
execSync('node build.mjs', { stdio: 'inherit' });
mkdirSync('release', { recursive: true });

// --- CRC32 -----------------------------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- collecte des fichiers (hors _metadata) --------------------------------
function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '_metadata') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const files = [...walk('dist')].sort();

// --- ecriture du ZIP (deflate) ---------------------------------------------
const DOS_DATE = 0x21; // 1980-01-01, deterministe
const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
  const name = relative('dist', file).split(sep).join('/');
  const nameBuf = Buffer.from(name, 'utf8');
  const data = readFileSync(file);
  const crc = crc32(data);
  const comp = deflateRawSync(data, { level: 9 });

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(8, 8); // deflate
  lh.writeUInt16LE(0, 10);
  lh.writeUInt16LE(DOS_DATE, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  localParts.push(lh, nameBuf, comp);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0, 8);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(0, 12);
  ch.writeUInt16LE(DOS_DATE, 14);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(0, 36); // internal/external attrs partiels
  ch.writeUInt32LE(offset, 42);
  centralParts.push(ch, nameBuf);

  offset += lh.length + nameBuf.length + comp.length;
}

const localBuf = Buffer.concat(localParts);
const centralBuf = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(localBuf.length, 16);

writeFileSync(out, Buffer.concat([localBuf, centralBuf, end]));

console.log(`\n${files.length} fichiers -> ${out}`);
for (const f of files) console.log('  ' + relative('dist', f).split(sep).join('/'));
console.log('\nUploade ce fichier sur https://chrome.google.com/webstore/devconsole');
