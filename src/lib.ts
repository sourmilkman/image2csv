export function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function titleCase(s: string): string {
  return s
    .split(' ')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function cleanToken(s: string): string {
  return s.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function mediumFromToken(token: string): string {
  const t = cleanToken(token);
  if (t === 'charcoal') return 'Charcoal on paper';
  if (t === 'pastel') return 'Pastel on paper';
  if (t === 'oil' || t === 'oils' || t === 'oil-panel') return 'Oil on panel';
  if (t === 'graphite') return 'Graphite';
  return '';
}

export function parseArtworkFilename(filename: string) {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ');
  const parts = base.split('--').map(part => part.trim()).filter(Boolean);
  const parsed: Record<string, string> = {};
  const titleParts: string[] = [];

  for (const part of parts.length > 1 ? parts : [base]) {
    const token = cleanToken(part);
    const medium = mediumFromToken(part);

    if (['portrait', 'portraits'].includes(token)) parsed.category = 'portraits';
    else if (['miniature', 'miniatures'].includes(token)) parsed.category = 'miniatures';
    else if (['still-life', 'still-lifes', 'stilllife'].includes(token)) parsed.category = 'still-life';
    else if (['atelier', 'atelier-mulliner', 'ateliermulliner'].includes(token)) parsed.category = 'atelier-mulliner';
    else if (['available', 'sold'].includes(token)) parsed.status = token;
    else if (['featured', 'feature', 'feat'].includes(token)) parsed.featured = 'TRUE';
    else if (['hidden', 'hide'].includes(token)) parsed.visible = 'FALSE';
    else if (token === 'visible') parsed.visible = 'TRUE';
    else if (/^(19|20)\d{2}$/.test(token)) parsed.year = token;
    else if (/^\d+(\.\d+)?x\d+(\.\d+)?(cm|in)?$/i.test(token)) parsed.size = part;
    else if (/^(gbp|eur|usd)?\d+/.test(token)) parsed.price = part;
    else if (medium) parsed.medium = medium;
    else titleParts.push(part);
  }

  if (titleParts.length > 0) {
    parsed.title = titleCase(titleParts.join(' ').replace(/[-_]+/g, ' '));
  }

  return parsed;
}

export async function fileToWebp(file: File, maxW = 2000, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width > maxW ? maxW / bmp.width : 1;
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', quality);
  });
}

export function basename(p: string): string {
  return (p || '').split('/').pop() || '';
}
