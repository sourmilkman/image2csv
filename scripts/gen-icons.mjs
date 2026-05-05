// Generate PWA icons (192/512) from an SVG using node:canvas-free approach.
// Uses sharp if available, otherwise falls back to a tiny manual PNG.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '..', 'public');
if (!existsSync(out)) mkdirSync(out, { recursive: true });

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b0b0d"/>
  <rect x="32" y="32" width="448" height="448" rx="80" fill="none" stroke="#c9a86a" stroke-width="4" opacity="0.35"/>
  <text x="256" y="332" text-anchor="middle" font-family="Georgia, serif" font-size="280" fill="#c9a86a">2</text>
  <text x="256" y="430" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="44" letter-spacing="6" fill="#e8e6e1">IMAGE → CSV</text>
</svg>`;

async function emit() {
  let sharp;
  try { sharp = (await import('sharp')).default; }
  catch {
    console.error('sharp not installed. Run: npm i -D sharp');
    process.exit(1);
  }
  for (const size of [192, 512]) {
    const buf = await sharp(Buffer.from(svg(size))).resize(size, size).png().toBuffer();
    writeFileSync(resolve(out, `icon-${size}.png`), buf);
    console.log(`wrote icon-${size}.png`);
  }
}
emit();
