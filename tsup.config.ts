import { defineConfig } from 'tsup';
import { cp, mkdir } from 'node:fs/promises';

export default defineConfig({
  entry: ['src/index.tsx', 'src/theory.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
  minify: false,
  async onSuccess() {
    await mkdir('dist/fonts', { recursive: true });
    await cp('src/assets/fonts/licenses/Bravura-OFL.txt', 'dist/fonts/Bravura-OFL.txt');
  },
  esbuildOptions(options) {
    // Configure loader for font files - esbuild will emit to dist/fonts/
    options.loader = {
      ...options.loader,
      '.woff2': 'file',
    };
    // Set asset output directory relative to outdir
    options.assetNames = 'fonts/[name]';
  },
});
