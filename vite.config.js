import { defineConfig } from 'vite';

// Caminhos relativos: o mesmo build serve no GitHub Pages (subpasta) e dentro do APK.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', target: 'es2020' },
});
