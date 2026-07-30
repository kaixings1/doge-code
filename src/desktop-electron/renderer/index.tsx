/**
 * 渲染进程入口：在 Electron BrowserWindow 中渲染桌面聊天 UI
 *
 * 重构说明（2026-07-27）：
 * - 原 2900+ 行单体文件已拆分为多个组件模块
 * - 主题定义 → theme.ts
 * - 子组件 → components/ 目录
 * - 主组件 → App.tsx
 * - 本文件仅作为入口点，负责启动应用
 */

export { App, main } from './App.js'