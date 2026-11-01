import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { loadProject } from './scripts/lib/project-config.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [{
    name: 'redistribution-notices',
    async generateBundle() {
      const { models } = await loadProject(root);
      const sections = [
        ['Annora Explorer', new URL('./LICENSE', import.meta.url)],
        ['Three.js', new URL('./node_modules/three/LICENSE', import.meta.url)],
        ...models.map(model => [model.manifest.provenance.attribution, model.assets.license]),
      ];
      const notices = await Promise.all(sections.map(async ([name, file]) => `${name}\n${'='.repeat(name.length)}\n\n${await readFile(file, 'utf8')}`));
      this.emitFile({ type: 'asset', fileName: 'LICENSES.txt', source: notices.join('\n\n') });
    },
  }],
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      input: {
        explorer: fileURLToPath(new URL('./index.html', import.meta.url)),
        embed: fileURLToPath(new URL('./examples/embed/index.html', import.meta.url)),
      },
      output: { manualChunks: id => id.includes('/node_modules/three/') ? 'three' : undefined },
    },
  },
  server: { host: '127.0.0.1', port: 8095, strictPort: true },
});
