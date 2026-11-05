import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// One Rsbuild (Rspack) build, three environments:
//   main     – Electron main process   (Node, CommonJS) → dist/main/index.cjs
//   preload  – sandboxed preload bridge (Node, CommonJS) → dist/preload/index.cjs
//   renderer – React UI                 (web)            → dist/renderer/index.html
const DEV_PORT = 5199;

const nodeEnvironment = (name: 'main' | 'preload') => ({
  source: {
    entry: { index: `./src/${name}/index.ts` },
  },
  output: {
    target: 'node' as const,
    // Rsbuild 2 emits ESM for Node by default; Electron's sandboxed preload requires CommonJS.
    module: false,
    distPath: { root: `dist/${name}`, js: '.' },
    filename: { js: '[name].cjs' },
    externals: { electron: 'commonjs electron' },
    cleanDistPath: true,
  },
});

export default defineConfig({
  dev: {
    // Electron loads main/preload from disk, so dev builds must be written out.
    writeToDisk: true,
  },
  server: {
    host: '127.0.0.1',
    port: DEV_PORT,
    strictPort: true,
    open: false,
  },
  output: {
    sourceMap: { js: 'source-map' },
  },
  environments: {
    main: nodeEnvironment('main'),
    preload: nodeEnvironment('preload'),
    renderer: {
      plugins: [pluginReact()],
      source: {
        entry: { index: './src/renderer/index.tsx' },
      },
      html: {
        template: './src/renderer/index.html',
      },
      output: {
        target: 'web',
        distPath: { root: 'dist/renderer' },
        // Relative URLs so the packaged app can load index.html via file://.
        // 'auto' resolves each URL relative to the file that references it
        // (a plain './' would break url() inside static/css/*.css).
        assetPrefix: 'auto',
        cleanDistPath: true,
      },
    },
  },
});
