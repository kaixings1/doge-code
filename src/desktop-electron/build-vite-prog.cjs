const { createRequire } = require('node:module')
const requireFromCwd = createRequire(require.resolve('electron-vite/package.json'))

const { build } = require('electron-vite')

const mainEntry = require('node:path').resolve('src/desktop-electron/main/index.ts')
const preloadEntry = require('node:path').resolve('src/desktop-electron/preload/index.ts')
const rendererEntry = require('node:path').resolve('src/desktop-electron/renderer/index.html')

console.log('mainEntry:', mainEntry)
console.log('preloadEntry:', preloadEntry)
console.log('rendererEntry:', rendererEntry)

const distDir = require('node:path').resolve('desktop-electron/dist')

// Clean
for (const d of ['main', 'preload', 'renderer']) {
  const full = require('node:path').join(distDir, d)
  if (require('node:fs').existsSync(full)) {
    require('node:fs').rmSync(full, { recursive: true, force: true })
  }
}

async function main() {
  console.log('=== Building with electron-vite API ===')

  try {
    await build({
      main: {
        root: '.',
        plugins: [],
        build: {
          outDir: 'desktop-electron/dist/main',
          rollupOptions: {
            input: mainEntry,
            output: { format: 'es', entryFileNames: 'index.mjs' },
            external: ['electron', 'electron-store', 'node-pty'],
          },
        },
      },
      preload: {
        root: '.',
        plugins: [],
        build: {
          outDir: 'desktop-electron/dist/preload',
          rollupOptions: {
            input: preloadEntry,
            external: ['electron'],
          },
        },
      },
      renderer: {
        root: 'src/desktop-electron/renderer',
        plugins: [],
        build: {
          outDir: 'desktop-electron/dist/renderer',
          rollupOptions: { input: rendererEntry },
        },
      },
    })
    console.log('\nBuild complete')
  } catch (err) {
    console.error('Build failed:', err.message)
    process.exit(1)
  }
}

main()
