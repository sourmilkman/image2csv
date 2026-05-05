export type Row = {
  title: string;
  image: string;
  category: string;
  medium: string;
  size: string;
  year: string;
  status: string;
  price: string;
  featured: string;
  visible: string;
};

export const EMPTY_ROW: Row = {
  title: '', image: '', category: 'portraits', medium: 'Charcoal on paper',
  size: '', year: String(new Date().getFullYear()), status: 'available',
  price: '', featured: 'FALSE', visible: 'TRUE'
};

// Seed values — used only when CSV is empty. Otherwise dropdowns derive from
// previously-entered data so they grow naturally with the catalogue.
export const SEED = {
  categories: ['portraits', 'still-life', 'miniatures'],
  mediums:    ['Charcoal on paper', 'Pastel on paper', 'Oil on panel'],
  statuses:   ['available', 'sold']
};

export function uniqueValues(rows: Row[], key: keyof Row): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = (r[key] || '').trim();
    if (v) seen.add(v);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function suggestionsFor(rows: Row[], key: keyof Row, seed: string[] = []): string[] {
  const merged = new Set<string>([...seed, ...uniqueValues(rows, key)]);
  return [...merged].sort((a, b) => a.localeCompare(b));
}
