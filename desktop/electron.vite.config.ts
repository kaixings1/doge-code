import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const mainEntry = resolve(__dirname, 'src/main/index.ts')

// 仅外部化真正的 node_modules 包（不含内部 @ 别名）
function externalizeNodeModules() {
  return {
    name: 'externalize-node-modules',
    enforce: 'pre' as const,
    resolveId(source: string) {
      // 外部化 electron 和 node 内置模块
      if (source === 'electron' || source.startsWith('node:')) {
        return { id: source, external: true }
      }
      // 外部化真正的 node_modules 包（不含内部 @ 别名）
      if (source.startsWith('@')) {
        const pkg = source.split('/')[0]
        const internalAliases = ['@main', '@commands', '@engine', '@tools', '@skills', '@utils', '@preload']
        if (!internalAliases.includes(pkg)) {
          return { id: source, external: true }
        }
        return null // 内部别名，不外部化
      }
      // 外部化不含路径分隔符的顶层包名（如 react, lodash）
      if (!source.startsWith('.') && !source.startsWith('/') && !source.includes('/')) {
        return { id: source, external: true }
      }
      return null
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeNodeModules()],
    build: {
      outDir: 'dist/main',
      rollupOptions: { input: { index: mainEntry } },
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@commands': resolve(__dirname, '../src/commands'),
        '@engine': resolve(__dirname, '../src/engine'),
        '@tools': resolve(__dirname, '../src/tools'),
        '@skills': resolve(__dirname, '../src/skills'),
        '@utils': resolve(__dirname, '../src/utils'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { '@': resolve(__dirname, 'src/renderer') } },
    plugins: [react()],
    build: {
      outDir: 'dist/renderer',
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
    },
    server: { port: 5173 },
  },
})
