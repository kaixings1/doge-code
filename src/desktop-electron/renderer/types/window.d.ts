/**
 * 全局 Window 类型声明 — 唯一入口
 *
 * 本文件为脚本文件（非模块），declare global 自动全局生效。
 * 其他文件不应再声明 declare global { interface Window { ... } }
 *
 * 新增 API 步骤：
 * 1. 在 preload/index.ts 的 DogeAPIValue 中添加类型
 * 2. 在 preload/index.ts 的 dogeAPI 对象中实现
 * 3. 渲染进程直接使用 window.dogeAPI.xxx
 *
 * 对于未实现的占位 API，在本文件底部使用可选属性声明。
 */

declare global {
  interface Window {
    /**
     * Doge Code Desktop 主 API
     * 由 preload 脚本通过 contextBridge.exposeInMainWorld 暴露
     * Record<string, any> 允许组件扩展未在 DogeAPI 中声明的 API
     */
    dogeAPI: import('../../preload/index.js').DogeAPI & Record<string, any>
  }
}
