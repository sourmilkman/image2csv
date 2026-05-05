# Image 2 CSV

Installable PWA for managing artworks in `tommulliner.com`. Drag-drop images, edit CSV rows, no server required.

**Live:** https://sourmilkman.github.io/image2csv/
**Browser:** Chrome / Edge / Brave (uses File System Access API)

## How it works

On first launch the app asks you to pick the `tommulliner.com` project root once. The browser remembers the handle. After that, the app reads/writes:

- `public/data/artworks.csv`
- `public/images/artwork/<slug>.webp`

…directly via the File System Access API. Nothing leaves your machine.

## Features

- Drag-and-drop → auto WebP conversion (Canvas, max 2000px wide, q=0.85)
- Slug-based filenames derived from the title
- Edit / delete existing rows; image file is renamed when title changes
- Datalist suggestions on every text field, populated from previous CSV entries
- Required: title, category, medium, status, featured, visible. Year defaults to current; size/price optional

## Install as a PWA

1. Visit https://sourmilkman.github.io/image2csv/ in Chrome/Edge
2. Click the install icon in the address bar (or ⋮ menu → "Install Image 2 CSV")
3. App appears as a desktop icon and runs in its own window

## Local development

```
npm install
npm run icons     # one-time, generates PWA icons via sharp
npm run dev       # http://localhost:5180
```

## Deployment

Push to `main`. GitHub Actions builds and publishes to Pages automatically (see `.github/workflows/deploy.yml`).
