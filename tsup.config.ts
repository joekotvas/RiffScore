import { defineConfig } from 'tsup';
import { copyFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
  minify: false,
  esbuildOptions(options) {
    // Configure loader for font files
    options.loader = {
      ...options.loader,
      '.woff2': 'file',
    };
    // Set asset output directory
    options.assetNames = 'fonts/[name]';
  },
  onSuccess: async () => {
    // Copy font assets to dist (backup in case loader doesn't handle it)
    const fontSrc = 'src/assets/fonts/Bravura.woff2';
    const fontDest = 'dist/fonts/Bravura.woff2';
    try {
      mkdirSync(dirname(fontDest), { recursive: true });
      copyFileSync(fontSrc, fontDest);
      console.log('📦 Copied Bravura.woff2 to dist/fonts/');
    } catch {
      // Font may already be copied by loader
    }
  },
});
