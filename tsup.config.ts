import { defineConfig } from 'tsup';

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
    // Configure loader for font files - esbuild will emit to dist/fonts/
    options.loader = {
      ...options.loader,
      '.woff2': 'file',
    };
    // Set asset output directory relative to outdir
    options.assetNames = 'fonts/[name]';
  },
});
