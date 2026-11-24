// Génère les icônes PNG de Zeleph (Z blanc sur dégradé rose → violet), sans dépendance : node tools/icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const Z = [[26, 26], [74, 26], [74, 37], [42, 63], [74, 63], [74, 74], [26, 74], [26, 63], [58, 37], [26, 37]];
const inside = (x, y) => {
  let c = false;
  for (let i = 0, j = Z.length - 1; i < Z.length; j = i++) {
    const [xi, yi] = Z[i], [xj, yj] = Z[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const A = [255, 95, 143], B = [122, 60, 255]; // dégradé diagonal

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1)), SS = 4;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const k = (x + y) / (2 * size), bg = A.map((a, i) => a + (B[i] - a) * k);
      let cov = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) if (inside(((x + (sx + 0.5) / SS) / size) * 100, ((y + (sy + 0.5) / SS) / size) * 100)) cov++;
      cov /= SS * SS;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(bg[i] * (1 - cov) + 255 * cov);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RVB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const dir = new URL('../public/icons/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) writeFileSync(new URL(name, dir), png(size));
console.log('icônes générées');
