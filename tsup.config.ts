import { defineConfig } from 'tsup';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

export default defineConfig({
  entry: ['src/index.tsx', 'src/theory.ts', 'src/extensions.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
  minify: false,
  async onSuccess() {
    for (const entry of ['dist/index.js', 'dist/index.mjs']) {
      await writeFile(entry, '"use client";\n' + (await readFile(entry, 'utf8')));
      const map = JSON.parse(await readFile(`${entry}.map`, 'utf8'));
      map.mappings = ';' + map.mappings;
      await writeFile(`${entry}.map`, JSON.stringify(map));
    }
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
