import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages serves it under /<repo>/).
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
});
