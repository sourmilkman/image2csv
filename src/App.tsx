import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Row, EMPTY_ROW, SEED, suggestionsFor } from './types';
import { fileToWebp, parseArtworkFilename, slugify } from './lib';
import {
  isFsaSupported, pickRoot, getStoredRoot, ensurePermission,
  readCsv, writeCsv, writeImage, deleteImage, readImageUrl, readImageBlob, artworkImagePath
} from './fs';

type Toast = { kind: 'ok' | 'err'; msg: string } | null;

export default function App() {
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [needsPick, setNeedsPick] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  const [editing, setEditing] = useState<Row>({ ...EMPTY_ROW });
  const [defaults, setDefaults] = useState<Row>({ ...EMPTY_ROW });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewMeta, setPreviewMeta] = useState<string>('');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const thumbCache = useRef<Map<string, string>>(new Map());

  // Boot: try to recover stored handle
  useEffect(() => { (async () => {
    if (!isFsaSupported()) return;
    const stored = await getStoredRoot();
    if (stored) {
      const ok = await ensurePermission(stored);
      if (ok) { setRoot(stored); setNeedsPick(false); }
    }
  })(); }, []);

  useEffect(() => { if (root) load(root); }, [root]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  async function load(r: FileSystemDirectoryHandle) {
    try { setLoading(true); setRows(await readCsv(r)); }
    catch (e: any) { showToast('err', e.message); }
    finally { setLoading(false); }
  }

  async function pick() {
    try {
      const h = await pickRoot();
      const ok = await ensurePermission(h);
      if (!ok) return showToast('err', 'Permission denied');
      setRoot(h); setNeedsPick(false);
    } catch (e: any) {
      if (e.name !== 'AbortError') showToast('err', e.message);
    }
  }

  function showToast(kind: 'ok' | 'err', msg: string) { setToast({ kind, msg }); }

  async function thumbFor(imagePath: string): Promise<string> {
    if (!imagePath || !root) return '';
    if (thumbCache.current.has(imagePath)) return thumbCache.current.get(imagePath)!;
    const url = await readImageUrl(root, imagePath);
    if (url) thumbCache.current.set(imagePath, url);
    return url;
  }

  async function handleFile(file: File) {
    try {
      setBusy(true);
      const blob = await fileToWebp(file);
      setPendingBlob(blob);
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      const kb = (blob.size / 1024).toFixed(0);
      const bmp = await createImageBitmap(blob);
      setPreviewMeta(`${bmp.width} × ${bmp.height} · ${kb} KB · WebP`);
      const parsed = parseArtworkFilename(file.name);
      setEditing(e => ({
        ...e,
        category: parsed.category ?? defaults.category,
        medium: parsed.medium ?? defaults.medium,
        size: parsed.size ?? defaults.size,
        year: parsed.year ?? defaults.year,
        status: parsed.status ?? defaults.status,
        price: parsed.price ?? defaults.price,
        featured: parsed.featured ?? defaults.featured,
        visible: parsed.visible ?? defaults.visible,
        title: parsed.title ?? e.title
      }));
    } catch (e: any) { showToast('err', e.message); }
    finally { setBusy(false); }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
  }

  function clearForm() {
    setEditing({ ...EMPTY_ROW });
    setEditingIndex(null);
    setPendingBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setPreviewMeta('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function loadIntoForm(idx: number) {
    const r = rows[idx];
    setEditing({ ...r });
    setEditingIndex(idx);
    setPendingBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = await thumbFor(r.image);
    setPreviewUrl(url);
    setPreviewMeta(r.image);
  }

  async function save() {
    if (!root) return showToast('err', 'Pick site folder first');
    const required: (keyof Row)[] = ['title','category','medium','status'];
    for (const k of required) {
      if (!editing[k]?.trim()) return showToast('err', `Missing field: ${k}`);
    }
    setBusy(true);
    try {
      const slug = slugify(editing.title);
      const filename = `${slug}.webp`;
      const nextImagePath = artworkImagePath(editing.category, filename);
      let imagePath = editing.image;

      if (pendingBlob) {
        await writeImage(root, nextImagePath, pendingBlob);
        if (editingIndex !== null && rows[editingIndex].image && rows[editingIndex].image !== nextImagePath) {
          await deleteImage(root, rows[editingIndex].image);
        }
        imagePath = nextImagePath;
      } else if (editingIndex === null) {
        return showToast('err', 'Drop an image to add a new entry');
      } else {
        const oldPath = rows[editingIndex].image;
        if (oldPath && oldPath !== nextImagePath) {
          const oldBlob = await readImageBlob(root, oldPath);
          if (oldBlob) {
            await writeImage(root, nextImagePath, oldBlob);
            await deleteImage(root, oldPath);
          }
          imagePath = nextImagePath;
        }
      }

      const newRow: Row = { ...editing, image: imagePath };
      const next = [...rows];
      if (editingIndex === null) next.push(newRow);
      else next[editingIndex] = newRow;

      await writeCsv(root, next);
      setRows(next);
      thumbCache.current.delete(imagePath);
      showToast('ok', editingIndex === null ? 'Added' : 'Updated');
      clearForm();
    } catch (e: any) { showToast('err', e.message); }
    finally { setBusy(false); }
  }

  async function remove(idx: number) {
    if (!root) return;
    if (!confirm(`Delete "${rows[idx].title}"? Image file will also be removed.`)) return;
    setBusy(true);
    try {
      const imagePath = rows[idx].image;
      const next = rows.filter((_, i) => i !== idx);
      await writeCsv(root, next);
      if (imagePath) await deleteImage(root, imagePath);
      setRows(next);
      thumbCache.current.delete(imagePath);
      if (editingIndex === idx) clearForm();
      showToast('ok', 'Deleted');
    } catch (e: any) { showToast('err', e.message); }
    finally { setBusy(false); }
  }

  // Suggestions derived from CSV history
  const sCategory = useMemo(() => suggestionsFor(rows, 'category', SEED.categories), [rows]);
  const sMedium   = useMemo(() => suggestionsFor(rows, 'medium',   SEED.mediums),   [rows]);
  const sStatus   = useMemo(() => suggestionsFor(rows, 'status',   SEED.statuses), [rows]);
  const sSize     = useMemo(() => suggestionsFor(rows, 'size'),  [rows]);
  const sYear     = useMemo(() => suggestionsFor(rows, 'year'),  [rows]);
  const sPrice    = useMemo(() => suggestionsFor(rows, 'price'), [rows]);

  function useDefaultsForCurrent() {
    setEditing(e => ({ ...e, ...defaults, title: e.title, image: e.image }));
    showToast('ok', 'Defaults applied');
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.map((r, i) => ({ r, i })).filter(({ r }) =>
      (!filterCat || r.category === filterCat) &&
      (!q || r.title.toLowerCase().includes(q) || r.medium.toLowerCase().includes(q))
    );
  }, [rows, search, filterCat]);

  if (!isFsaSupported()) {
    return (
      <div className="app">
        <header className="topbar"><h1>Image <span>2</span> CSV</h1></header>
        <div style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}>
          <div className="empty">
            This app needs the File System Access API. Open it in <strong>Chrome</strong>,{' '}
            <strong>Edge</strong>, or another Chromium browser.
          </div>
        </div>
      </div>
    );
  }

  if (needsPick) {
    return (
      <div className="app">
        <header className="topbar"><h1>Image <span>2</span> CSV</h1></header>
        <div style={{ padding: 60, maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 28, marginBottom: 14 }}>
            Pick your site folder
          </h2>
          <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: 28 }}>
            Select the <code>tommulliner.com</code> project root.<br />
            The app will read and write <code>public/data/artworks.csv</code> and
            files in <code>public/images/artwork/portraits</code>,{' '}
            <code>miniatures</code>, and <code>still-lifes</code>.
            Your choice is remembered.
          </p>
          <button onClick={pick}>Choose Folder</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Image <span>2</span> CSV</h1>
        <div className={`status ${loading ? '' : 'ok'}`}>
          {loading ? 'Loading…' : `${rows.length} artworks`}
          {' · '}<button className="ghost" style={{ padding: '4px 10px', fontSize: 10 }} onClick={pick}>Change folder</button>
        </div>
      </header>

      <div className="main">
        <aside className="left">
          <div
            className={`dropzone ${drag ? 'drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileInput.current?.click()}
          >
            <strong>{editingIndex === null ? 'Drop image here' : 'Replace image'}</strong>
            <p>or click to browse</p>
            <p style={{ fontSize: 11 }}>Auto-converted to WebP</p>
          </div>
          <input
            ref={fileInput} type="file" accept="image/*" hidden
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          <div className="quick-panel">
            <div className="quick-title">Quick import defaults</div>
            <p>
              Use these once for a batch, or name files like{' '}
              <code>Arthur--portraits--charcoal--2019--sold--featured.jpg</code>.
            </p>
            <div className="field-row compact">
              <div className="field">
                <label>Category</label>
                <input list="d-category" value={defaults.category}
                  onChange={e => setDefaults({ ...defaults, category: e.target.value })} />
              </div>
              <div className="field">
                <label>Status</label>
                <input list="d-status" value={defaults.status}
                  onChange={e => setDefaults({ ...defaults, status: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Medium</label>
              <input list="d-medium" value={defaults.medium}
                onChange={e => setDefaults({ ...defaults, medium: e.target.value })} />
            </div>
            <div className="field-row compact">
              <div className="field">
                <label>Size</label>
                <input list="d-size" value={defaults.size}
                  onChange={e => setDefaults({ ...defaults, size: e.target.value })} />
              </div>
              <div className="field">
                <label>Year</label>
                <input list="d-year" value={defaults.year}
                  onChange={e => setDefaults({ ...defaults, year: e.target.value })} />
              </div>
            </div>
            <div className="checks">
              <label>
                <input type="checkbox" checked={defaults.featured === 'TRUE'}
                  onChange={e => setDefaults({ ...defaults, featured: e.target.checked ? 'TRUE' : 'FALSE' })} />
                Featured
              </label>
              <label>
                <input type="checkbox" checked={defaults.visible === 'TRUE'}
                  onChange={e => setDefaults({ ...defaults, visible: e.target.checked ? 'TRUE' : 'FALSE' })} />
                Visible
              </label>
            </div>
            <button className="ghost wide" onClick={useDefaultsForCurrent} disabled={busy}>
              Apply To Current
            </button>
          </div>

          {previewUrl && (
            <div className="preview">
              <img src={previewUrl} alt="" />
              <div className="meta">{previewMeta}</div>
            </div>
          )}

          <div className="field">
            <label>Title <span className="req">*</span></label>
            <input value={editing.title}
              onChange={e => setEditing({ ...editing, title: e.target.value })} />
            {editing.title && (
              <div className="hint">→ {artworkImagePath(editing.category, `${slugify(editing.title)}.webp`)}</div>
            )}
          </div>

          <div className="field-row">
            <div className="field">
              <label>Category <span className="req">*</span></label>
              <input list="d-category" value={editing.category}
                onChange={e => setEditing({ ...editing, category: e.target.value })} />
              <datalist id="d-category">{sCategory.map(v => <option key={v} value={v} />)}</datalist>
            </div>
            <div className="field">
              <label>Status <span className="req">*</span></label>
              <input list="d-status" value={editing.status}
                onChange={e => setEditing({ ...editing, status: e.target.value })} />
              <datalist id="d-status">{sStatus.map(v => <option key={v} value={v} />)}</datalist>
            </div>
          </div>

          <div className="field">
            <label>Medium <span className="req">*</span></label>
            <input list="d-medium" value={editing.medium}
              onChange={e => setEditing({ ...editing, medium: e.target.value })} />
            <datalist id="d-medium">{sMedium.map(v => <option key={v} value={v} />)}</datalist>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Size</label>
              <input list="d-size" value={editing.size}
                onChange={e => setEditing({ ...editing, size: e.target.value })} />
              <datalist id="d-size">{sSize.map(v => <option key={v} value={v} />)}</datalist>
            </div>
            <div className="field">
              <label>Year</label>
              <input list="d-year" value={editing.year}
                onChange={e => setEditing({ ...editing, year: e.target.value })} />
              <datalist id="d-year">{sYear.map(v => <option key={v} value={v} />)}</datalist>
            </div>
          </div>

          <div className="field">
            <label>Price</label>
            <input list="d-price" value={editing.price}
              onChange={e => setEditing({ ...editing, price: e.target.value })} />
            <datalist id="d-price">{sPrice.map(v => <option key={v} value={v} />)}</datalist>
          </div>

          <div className="checks">
            <label>
              <input type="checkbox" checked={editing.featured === 'TRUE'}
                onChange={e => setEditing({ ...editing, featured: e.target.checked ? 'TRUE' : 'FALSE' })} />
              Featured
            </label>
            <label>
              <input type="checkbox" checked={editing.visible === 'TRUE'}
                onChange={e => setEditing({ ...editing, visible: e.target.checked ? 'TRUE' : 'FALSE' })} />
              Visible
            </label>
          </div>

          <div className="actions">
            <button onClick={save} disabled={busy}>
              {editingIndex === null ? 'Add Artwork' : 'Save Changes'}
            </button>
            <button className="ghost" onClick={clearForm} disabled={busy}>
              {editingIndex === null ? 'Reset' : 'Cancel'}
            </button>
          </div>
        </aside>

        <section className="right">
          <div className="toolbar">
            <input type="search" placeholder="Search title or medium…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">All categories</option>
              {sCategory.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="empty">No matching artworks.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th></th><th>Title</th><th>Category</th><th>Medium</th>
                  <th>Year</th><th>Status</th><th>Flags</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ r, i }) => (
                  <RowItem key={i} r={r} idx={i} selected={editingIndex === i}
                    thumbFor={thumbFor}
                    onEdit={() => loadIntoForm(i)} onDelete={() => remove(i)} />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
    </div>
  );
}

function RowItem({ r, idx, selected, thumbFor, onEdit, onDelete }: {
  r: Row; idx: number; selected: boolean;
  thumbFor: (p: string) => Promise<string>;
  onEdit: () => void; onDelete: () => void;
}) {
  const [src, setSrc] = useState('');
  useEffect(() => { thumbFor(r.image).then(setSrc); }, [r.image]);
  return (
    <tr className={selected ? 'selected' : ''}>
      <td>{src ? <img className="thumb" src={src} alt="" /> : <div className="thumb" />}</td>
      <td>{r.title}</td>
      <td>{r.category}</td>
      <td>{r.medium}</td>
      <td>{r.year}</td>
      <td><span className={`pill ${r.status}`}>{r.status}</span></td>
      <td>
        {r.featured === 'TRUE' && <span className="pill featured">★</span>}{' '}
        {r.visible !== 'TRUE' && <span className="pill">hidden</span>}
      </td>
      <td>
        <div className="row-actions">
          <button className="ghost" onClick={onEdit}>Edit</button>
          <button className="danger" onClick={onDelete}>Del</button>
        </div>
      </td>
    </tr>
  );
}
