const { build } = require('vite')
const path = require('node:path')
const fs = require('node:fs')

const projectRoot = path.resolve('.')
const mainEntry = path.resolve('src/desktop-electron/main/index.ts')
const preloadEntry = path.resolve('src/desktop-electron/preload/index.ts')
const rendererRoot = path.resolve('src/desktop-electron/renderer')
const rendererEntry = path.resolve('src/desktop-electron/renderer/index.html')

const distDir = path.resolve('desktop-electron/dist')

// Markdown text plugin - imports .md files as raw text strings
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

// Plugin to resolve .js/.jsx extension imports to actual source files (Bun compat)
// Bun runtime imports .ts/.tsx files using .js extension for compatibility
function jsToTsResolverPlugin() {
  const extMap = [
    ['.tsx', '.tsx'],
    ['.ts', '.ts'],
    ['.jsx', '.tsx'],
    ['.js', '.ts'],
  ]
  return {
    name: 'js-to-ts-resolver',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.startsWith('http') || source.startsWith('//')) return null

      // Only process .js/.jsx extension imports
      const dotIdx = source.lastIndexOf('.')
      if (dotIdx === -1) return null
      const ext = source.slice(dotIdx)
      if (ext !== '.js' && ext !== '.jsx') return null

      // Determine search base
      let baseForSearch
      if (source.startsWith('.')) {
        // Relative import: resolve relative to importer directory
        baseForSearch = path.resolve(path.dirname(importer), source.slice(0, dotIdx))
      } else if (source.startsWith('src/')) {
        // src/ absolute import: resolve relative to project root
        baseForSearch = path.resolve(projectRoot, source.slice(0, dotIdx))
      } else {
        return null
      }

      // Try each candidate extension in preference order
      for (const [jsExt, tsExt] of extMap) {
        const candidate = baseForSearch + tsExt
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }
      return null
    },
  }
}

// Clean
for (const d of ['main', 'preload', 'renderer']) {
  const full = path.join(distDir, d)
  if (fs.existsSync(full)) {
    fs.rmSync(full, { recursive: true, force: true })
  }
}

const mdPlugin = markdownTextPlugin()
const jsResolverPlugin = jsToTsResolverPlugin()
const reactPlugin = require('@vitejs/plugin-react').default

// Build alias map for .js -> .tsx/.ts resolution
function buildJSAlias(dir) {
  const alias = {}
  if (!fs.existsSync(dir)) return alias
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isFile()) {
      const fullPath = path.join(dir, entry.name)
      const dotIdx = entry.name.lastIndexOf('.')
      if (dotIdx > 0) {
        const ext = entry.name.slice(dotIdx)
        if (ext === '.js' || ext === '.jsx') {
          const tsName = entry.name.slice(0, dotIdx) + (ext === '.jsx' ? '.tsx' : '.ts')
          const tsPath = path.join(dir, tsName)
          if (fs.existsSync(tsPath)) {
            alias[entry.name] = tsPath
          }
        }
      }
    }
  }
  return alias
}

async function main() {
  console.log('=== Building main process ===')
  await build({
    root: '.',
    build: {
      outDir: 'desktop-electron/dist/main',
      emptyOutDir: false,
      rollupOptions: {
        input: mainEntry,
        output: {
          format: 'es',
          entryFileNames: 'index.mjs',
        },
        external: ['electron', 'electron-store', 'node-pty', 'image-processor-napi', '@sentry/node', 'sharp'],
      },
    },
    plugins: [mdPlugin, jsResolverPlugin],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
      alias: {
        '@main': path.resolve(projectRoot, 'src/desktop-electron/main'),
        '@commands': path.resolve(projectRoot, 'src/commands'),
        '@engine': path.resolve(projectRoot, 'src/engine'),
        '@tools': path.resolve(projectRoot, 'src/tools'),
        '@skills': path.resolve(projectRoot, 'src/skills'),
        '@utils': path.resolve(projectRoot, 'src/desktop-electron/utils'),
        'bun:bundle': path.resolve(projectRoot, 'src/desktop-electron/polyfills/bun-bundle-polyfill.ts'),
        'bun:sqlite': path.resolve(projectRoot, 'src/desktop-electron/polyfills/bun-sqlite-polyfill.ts'),
      },
    },
  })

  console.log('=== Building preload ===')
  await build({
    root: '.',
    plugins: [mdPlugin, jsResolverPlugin],
    build: {
      outDir: 'desktop-electron/dist/preload',
      emptyOutDir: false,
      rollupOptions: {
        input: preloadEntry,
        output: {
          format: 'es',
          entryFileNames: 'index.mjs',
        },
        external: ['electron'],
      },
    },
  })

  console.log('=== Building renderer ===')
  await build({
    root: rendererRoot,
    build: {
      outDir: 'desktop-electron/dist/renderer',
      emptyOutDir: false,
      rollupOptions: { input: rendererEntry },
    },
    plugins: [reactPlugin(), mdPlugin],
  })

  console.log('\nBuild complete')
  console.log('Output:', distDir)
}

main().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
