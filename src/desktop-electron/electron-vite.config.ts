import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import * as path from 'node:path'
import * as fs from 'node:fs'

function markdownTextPlugin() {
  return {
    name: 'md-text-plugin',
    enforce: 'pre',
    load(id) {
      if (id.endsWith('.md')) {
        try {
          const content = fs.readFileSync(id, 'utf-8')
          return `export default ${JSON.stringify(content)};`
        } catch {
          return `export default "";`
        }
      }
      return null
    },
    resolveId(source) {
      if (typeof source === 'string' && source.endsWith('.md')) {
        return source
      }
      return null
    },
  }
}

export default defineConfig({
  root: '.',
  main: {
    plugins: [externalizeDepsPlugin(), markdownTextPlugin()],
    build: {
      outDir: 'desktop-electron/dist/main',
      lib: {
        entry: path.resolve('src/desktop-electron/main/index.ts'),
        formats: ['es'],
        fileName: () => 'index.mjs',
      },
    },
  },
  preload: {
    root: '.',
    plugins: [externalizeDepsPlugin(), markdownTextPlugin()],
    build: {
      outDir: 'desktop-electron/dist/preload',
      lib: {
        entry: path.resolve('src/desktop-electron/preload/index.ts'),
        formats: ['es'],
        fileName: () => 'index.mjs',
      },
    },
  },
  renderer: {
    root: 'src/desktop-electron/renderer',
    plugins: [react(), markdownTextPlugin()],
    build: {
      outDir: 'desktop-electron/dist/renderer',
      rollupOptions: { input: path.resolve('src/desktop-electron/renderer/index.html') },
    },
  },
})
