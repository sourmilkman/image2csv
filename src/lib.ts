export function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
