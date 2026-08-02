// 最小 Electron 主进程测试：验证 ESM 下 from "path" 的 dirname 命名导入
import { app } from 'electron'

// 这是 ESM。测试 from "path"（无 node:）的命名导入
async function test() {
  // 动态导入两种形式
  try {
    const m = await import('path')
    console.log('import("path") keys:', Object.keys(m).slice(0, 20).join(','))
    console.log('has dirname:', typeof m.dirname)
    console.log('dirname("/a/b/c") =>', m.dirname?.('/a/b/c'))
  } catch (e) {
    console.log('import("path") FAIL:', e.message)
  }
  try {
    const m = await import('node:path')
    console.log('import("node:path") has dirname:', typeof m.dirname)
  } catch (e) {
    console.log('import("node:path") FAIL:', e.message)
  }
  app.quit()
}
app.whenReady().then(test)
