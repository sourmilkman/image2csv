import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Repo: https://github.com/sourmilkman/image2csv
// GitHub Pages serves at https://sourmilkman.github.io/image2csv/
export default defineConfig({
  base: '/image2csv/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Image 2 CSV',
        short_name: 'Image2CSV',
        description: 'Drag-drop artwork manager for tommulliner.com',
        theme_color: '#0b0b0d',
        background_color: '#0b0b0d',
        display: 'standalone',
        scope: '/image2csv/',
        start_url: '/image2csv/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}']
      }
    })
  ],
  server: { port: 5180 }
});
