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

      // Skip resolution for imports originating from within node_modules.
      // Node modules should be bundled as-is (or excluded via external), not
      // resolved to .ts/.tsx source files which may use browser-only APIs.
      if (importer && importer.includes('node_modules' + path.sep)) return null

      // Determine search base
      let baseForSearch
      let hasExt = false
      const dotIdx = source.lastIndexOf('.')
      if (dotIdx > 0) {
        const ext = source.slice(dotIdx)
        if (['.ts','.tsx','.js','.jsx','.json','.md'].includes(ext)) {
          hasExt = true
        }
      }

      if (source.startsWith('.')) {
        // Relative import: resolve relative to importer directory
        const baseNoExt = hasExt ? source.slice(0, dotIdx) : source
        baseForSearch = path.resolve(path.dirname(importer), baseNoExt)
      } else if (source.startsWith('src/')) {
        // src/ absolute import: resolve relative to project root
        const baseNoExt = hasExt ? source.slice(0, dotIdx) : source
        baseForSearch = path.resolve(projectRoot, baseNoExt)
      } else {
        return null
      }

      // If already has a known extension, just check if it exists
      if (hasExt) {
        const ext = source.slice(dotIdx)
        if (fs.existsSync(source.startsWith('.') ? path.resolve(path.dirname(importer), source) : path.resolve(projectRoot, source))) {
          // Resolve src/ imports to their full path
          if (source.startsWith('src/')) {
            return path.resolve(projectRoot, source)
          }
          return null // relative - let Vite handle it
        }
        // Try .ts/.tsx alternatives for .js/.jsx imports
        if (ext === '.js' || ext === '.jsx') {
          for (const [, tsExt] of extMap) {
            const candidate = baseForSearch + tsExt
            if (fs.existsSync(candidate)) {
              return candidate
            }
          }
        }
        return null
      }

      // No extension - try adding .ts, .tsx, .js, .jsx
      for (const [, tsExt] of extMap) {
        const candidate = baseForSearch + tsExt
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }
      return null
    },
  }
}


// Plugin to replace __vite-browser-external virtual modules with real named exports.
// Vite 7 generates these as empty Proxy objects for browser compat, but Rollup
// cannot verify named exports against them. This plugin intercepts the virtual
// module source via transform hook and replaces it with proper export declarations.
// Dynamically discover Node.js builtin exports at build time.
function getBuiltinExports(modName) {
  try {
    const mod = require(modName)
    const seen = new Set()
    const result = []
    let obj = mod
    while (obj && obj !== Object.prototype && obj !== Function.prototype) {
      const desc = Object.getOwnPropertyNames(obj)
      for (const key of desc) {
        if (!seen.has(key) && key !== 'default' && key !== 'length' && key !== 'name' && key !== 'prototype') {
          seen.add(key)
          result.push(key)
        }
      }
      obj = Object.getPrototypeOf(obj)
    }
    return result
  } catch {
    return []
  }
}

function hasDefaultExport(modName) {
  try {
    const mod = require(modName)
    return mod.default !== undefined || typeof mod === 'function'
  } catch {
    return false
  }
}

function nodeBuiltinsResolverPlugin() {
  const UNDEF = 'undefined'
  return {
    name: 'node-builtins-resolver',
    enforce: 'post',
    transform(code, id) {
      if (!id.startsWith('__vite-browser-external:')) return null
      // Skip commonjs-proxy variants
      if (id.includes('?commonjs-proxy')) return null
      let modName = id.slice(22)
      if (modName.startsWith('node:')) modName = modName.slice(5)
      const namedExports = getBuiltinExports(modName)
      const hasDefault = hasDefaultExport(modName)
      const stmts = []
      for (const e of namedExports) {
        stmts.push('export const ' + e + ' = ' + UNDEF)
      }
      if (hasDefault) stmts.push('export default ' + UNDEF)
      return stmts.length > 0 ? stmts.join(';') : 'export {}'
    },
  }
}
for (const d of ['main', 'preload', 'renderer']) {
  const full = path.join(distDir, d)
  if (fs.existsSync(full)) {
    fs.rmSync(full, { recursive: true, force: true })
  }
}

const mdPlugin = markdownTextPlugin()
const jsResolverPlugin = jsToTsResolverPlugin()
const nodeBuiltinsResolver = nodeBuiltinsResolverPlugin()
const reactPlugin = require('@vitejs/plugin-react').default

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
          entryFileNames: 'index.js',
        },
        external: ['electron','node-pty','image-processor-napi','execa','npm-run-path','unicorn-magic','supports-hyperlinks','supports-color','has-flag','@anthropic-ai/sandbox-runtime','@mixmark-io/domino',/^@aws-sdk\//,/^node:/,'path','path/win32','path/posix','fs','fs/promises','crypto','os','util','stream','stream/promises','events','buffer','process','child_process','http','http2','https','url','zlib','querystring','v8','async_hooks','net','tls','assert','dns','readline','tty','string_decoder','perf_hooks','diagnostics_channel','worker_threads','module','turndown','he'],
      },
    },
    ssr: {
      target: 'node',
      external: ['electron','node-pty','image-processor-napi','execa','npm-run-path','unicorn-magic','supports-hyperlinks','supports-color','has-flag','@anthropic-ai/sandbox-runtime','@mixmark-io/domino',/^@aws-sdk\//,/^node:/,'path','path/win32','path/posix','fs','fs/promises','crypto','os','util','stream','stream/promises','events','buffer','process','child_process','http','http2','https','url','zlib','querystring','v8','async_hooks','net','tls','assert','dns','readline','tty','string_decoder','perf_hooks','diagnostics_channel','worker_threads','module','turndown','he'],
    },
    plugins: [mdPlugin, jsResolverPlugin, nodeBuiltinsResolver],
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
    ssr: {
      target: 'node',
    },
    plugins: [mdPlugin, jsResolverPlugin, nodeBuiltinsResolver],
    build: {
      outDir: 'desktop-electron/dist/preload',
      emptyOutDir: false,
      rollupOptions: {
        input: preloadEntry,
        output: {
          format: 'es',
          entryFileNames: 'index.js',
        },
        external: ['electron','node-pty','image-processor-napi','execa','npm-run-path','unicorn-magic','supports-hyperlinks','supports-color','has-flag','@anthropic-ai/sandbox-runtime',/^@aws-sdk\//,/^node:/,'path','path/win32','path/posix','fs','fs/promises','crypto','os','util','stream','stream/promises','events','buffer','process','child_process','http','http2','https','url','zlib','querystring','v8','async_hooks','net','tls','assert','dns','readline','tty','string_decoder','perf_hooks','diagnostics_channel','worker_threads','module'],
      },
    },
  })

  console.log('=== Building renderer ===')
  await build({
    root: projectRoot,
    build: {
      outDir: path.resolve(projectRoot, 'desktop-electron/dist/renderer'),
      emptyOutDir: false,
      rollupOptions: { input: rendererEntry },
    },
    plugins: [reactPlugin(), mdPlugin, jsResolverPlugin, nodeBuiltinsResolver],
  })

  console.log('\nCopying build output to desktop/dist/')
  const desktopDist = path.resolve('desktop/dist')
  if (fs.existsSync(desktopDist)) {
    fs.rmSync(desktopDist, { recursive: true, force: true })
  }
  fs.mkdirSync(desktopDist, { recursive: true })
  fs.cpSync(path.join(distDir, 'main'), path.join(desktopDist, 'main'), { recursive: true })
  fs.cpSync(path.join(distDir, 'preload'), path.join(desktopDist, 'preload'), { recursive: true })
  fs.cpSync(path.join(distDir, 'renderer'), path.join(desktopDist, 'renderer'), { recursive: true })
  console.log('Copied to:', desktopDist)
  console.log('\nBuild complete')
}

main().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
