import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { resolve: ['@accesscore/contracts'] },
  sourcemap: true,
  clean: true,
  treeshake: true,
  noExternal: ['@accesscore/contracts'],
  external: ['@nestjs/common', '@nestjs/core', 'reflect-metadata'],
  esbuildOptions(options) {
    options.sourcesContent = false;
  },
});
