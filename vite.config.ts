/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        offscreen: 'src/offscreen/offscreen.html',
      },
      output: {
        manualChunks: {
          transformers: ['@huggingface/transformers'],
          orama: ['@orama/orama', '@orama/plugin-data-persistence'],
        },
        // Keep WASM and ONNX files with recognizable names
        assetFileNames: (assetInfo) => {
          const name = assetInfo.name || '';
          if (name.endsWith('.wasm') || name.endsWith('.onnx')) {
            return 'assets/models/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    chunkSizeWarningLimit: 4000,
    // Ensure WASM files are treated as assets
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  // Handle WASM and ONNX file imports
  assetsInclude: ['**/*.wasm', '**/*.onnx'],
  worker: {
    format: 'es',
  },
  test: {
    globals: true,
    environment: 'happy-dom',
  },
});
