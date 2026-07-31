const { build } = require('vite')
const path = require('path')

async function test() {
  const NODE_BUILTINS = new Set([
    'path', 'fs', 'fs/promises', 'crypto', 'os', 'util', 'stream', 'events',
    'buffer', 'process', 'child_process', 'http', 'https', 'url', 'zlib',
    'string_decoder', 'querystring', 'punycode', 'timers', 'console', 'module',
    'perf_hooks', 'inspector', 'async_hooks', 'wasi', 'vm', 'worker_threads',
    'tls', 'net', 'dns', 'dgram', 'readline', 'repl', 'domain', 'cluster',
    'v8', 'async_wait', 'http2',
  ])

  const testPlugin = {
    name: 'test-resolver',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.includes('fs/promises') || source === 'fs' || source === 'path' || source.startsWith('node:')) {
        console.log(`[test-resolver] source="${source}", importer="${importer}"`)
      }

      if (source.startsWith('node:')) {
        const modName = source.slice(5)
        if (NODE_BUILTINS.has(modName)) {
          console.log(`  -> node: matched: ${modName}`)
          return { id: modName, external: true }
        }
        return null
      }

      if (source.includes('/')) {
        const parts = source.split('/')
        const topLevel = parts[0]
        if (NODE_BUILTINS.has(topLevel)) {
          console.log(`  -> subpath matched: ${source}`)
          return { id: source, external: true }
        }
      }

      if (NODE_BUILTINS.has(source)) {
        console.log(`  -> bare matched: ${source}`)
        return { id: source, external: true }
      }

      return null
    },
  }

  try {
    await build({
      root: 'D:/doge-code',
      build: {
        outDir: 'D:/doge-code/test-build-out',
        emptyOutDir: true,
        rollupOptions: {
          input: 'D:/doge-code/src/utils/fsOperations.ts',
          output: { format: 'es' },
          external: ['electron', 'node-pty', 'image-processor-napi', 'execa', 'npm-run-path', 'unicorn-magic'],
        },
      },
      ssr: {
        external: ['electron', 'node-pty', 'image-processor-napi', 'execa', 'npm-run-path', 'unicorn-magic'],
      },
      plugins: [testPlugin],
      logLevel: 'warn',
    })
    console.log('BUILD SUCCESS')
  } catch (err) {
    console.log('BUILD FAILED:', err.message)
  }
}

test().catch(e => console.error(e))
