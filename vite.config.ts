import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // percorsi relativi: la build funziona sia sul web sia dentro Electron
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5173 },
  // librerie PDF pre-elaborate insieme: evita errori al primo export in sviluppo
  optimizeDeps: { include: ['jspdf', 'svg2pdf.js'] },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      // maxGraph usa eval() internamente: avviso noto della libreria, non del nostro codice
      onwarn(warning, defaultHandler) {
        if (warning.code === 'EVAL' && String(warning.id ?? '').includes('@maxgraph')) return;
        defaultHandler(warning);
      }
    }
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
