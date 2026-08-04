/**
 * require-shim.ts — 为 ESM 环境下的 Electron 主进程提供 require 支持
 *
 * Electron 主进程在 ESM 模式（output format: 'es'）下不提供全局 require()。
 * 本模块通过 createRequire 创建一个 require 函数并注入到 globalThis，
 * 使得源代码中使用 require() 的动态导入能够在 Electron 主进程中正常工作。
 */

import { createRequire } from 'node:module'

// 在 ESM 作用域中定义局部 require 变量，使打包后的 bundle 中所有 require() 调用都能找到
const require = createRequire(import.meta.url)

// 同时注入到全局以便其他可能的引用方式工作
globalThis.require = require
