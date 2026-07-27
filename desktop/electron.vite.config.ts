import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const mainEntry = resolve(__dirname, 'src/main/index.ts')

// 主进程外部化插件
function externalizeAll() {
  return {
    name: 'externalize-internal',
    enforce: 'pre' as const,
    resolveId(source: string, importer?: string) {
      // 不外部化入口文件
      if (source === mainEntry) return null
      // 外部化 electron 和 node 内置模块
      if (source === 'electron' || source.startsWith('node:')) {
        return { id: source, external: true }
      }
      // 外部化相对路径 src/ 内部模块（不包括入口文件）
      if (source.startsWith('src/') && source !== mainEntry) {
        return { id: source, external: true }
      }
      // 外部化不以 . / @ 开头的包名（真正的 node_modules 包）
      if (!source.startsWith('.') && !source.startsWith('/') && !source.startsWith('@')) {
        return { id: source, external: true }
      }
      return null
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), externalizeAll()],
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
