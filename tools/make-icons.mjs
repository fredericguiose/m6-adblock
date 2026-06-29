/**
 * make-icons.mjs — genere les icones PNG de l'extension sans dependance externe.
 * Dessine (en supersampling 4x pour l'anti-aliasing) un carre arrondi rouge M6
 * avec un anneau blanc barre d'un slash = symbole "bloque".
 * Sortie : src/icons/icon{16,32,48,128}.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

// --- CRC32 (pour les chunks PNG) ------------------------------------------
const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw : 1 octet de filtre (0) par ligne + RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- Dessin (coordonnees normalisees 0..1) --------------------------------
const RED = [226, 0, 26];
const WHITE = [255, 255, 255];

function sampleAt(nx, ny) {
  // carre arrondi
  const cx = nx - 0.5;
  const cy = ny - 0.5;
  const half = 0.5;
  const r = 0.2; // rayon des coins
  const dx = Math.max(Math.abs(cx) - (half - r), 0);
  const dy = Math.max(Math.abs(cy) - (half - r), 0);
  const distCorner = Math.sqrt(dx * dx + dy * dy);
  const inside = Math.abs(cx) <= half && Math.abs(cy) <= half && distCorner <= r;
  if (!inside) return [0, 0, 0, 0];

  let color = RED;

  // anneau blanc
  const dist = Math.sqrt(cx * cx + cy * cy);
  const ringOuter = 0.3;
  const ringInner = 0.21;
  if (dist <= ringOuter && dist >= ringInner) color = WHITE;

  // slash diagonal (ligne y = -x passant par le centre), epaisseur
  const distToDiag = Math.abs(cx + cy) / Math.SQRT2;
  if (distToDiag <= 0.045 && dist <= ringOuter + 0.02) color = WHITE;

  return [color[0], color[1], color[2], 255];
}

function render(size) {
  const SS = 4; // supersampling
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size;
          const ny = (y + (sy + 0.5) / SS) / size;
          const [pr, pg, pb, pa] = sampleAt(nx, ny);
          const af = pa / 255;
          r += pr * af;
          g += pg * af;
          b += pb * af;
          a += pa;
        }
      }
      const n = SS * SS;
      const aAvg = a / n;
      const i = (y * size + x) * 4;
      // couleur premultipliee -> on divise par alpha cumule pour la moyenne
      const wsum = a / 255 || 1;
      rgba[i] = Math.round(r / wsum);
      rgba[i + 1] = Math.round(g / wsum);
      rgba[i + 2] = Math.round(b / wsum);
      rgba[i + 3] = Math.round(aAvg);
    }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync('src/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`src/icons/icon${size}.png`, render(size));
  console.log(`src/icons/icon${size}.png`);
}
console.log('Icones generees.');
