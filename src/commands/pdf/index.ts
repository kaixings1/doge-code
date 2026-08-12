import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import fs from 'fs'

export const call: LocalJSXCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: '📖 用法:\n/pdf read <文件> | 读取 PDF 文本内容\n/pdf info <文件> | PDF 基本信息\n/pdf images <文件> | 提取图片信息' }
  const file = p[1]
  if (!file || !fs.existsSync(file)) return { type: 'text', value: '📁 文件不存在: ' + (file || '') }
  let r = ''
  if (c === 'read') {
    try {
      const data = fs.readFileSync(file)
      const text = data.toString('utf-8').replace(/[^\x20-\x7E\u4e00-\u9fa5\n]/g, ' ').replace(/\s+/g, ' ').trim()
      r = text.slice(0, 5000) + (text.length > 5000 ? '\n...(已截断)' : '')
    } catch (e: any) { r = '❌ 读取 PDF 出错: ' + e.message }
  } else if (c === 'info') {
    const stat = fs.statSync(file)
    r = '📄 文件: ' + file + '\n📦 大小: ' + (stat.size / 1024).toFixed(1) + ' KB\n🕒 修改时间: ' + stat.mtime.toISOString()
  } else {
    r = '❓ 未知: ' + c
  }
  return { type: 'text', value: r || '(无内容)' }
}

const cmd = { type: 'local-jsx' as const, name: 'pdf', description: 'PDF 文件读取与信息查看：read/info', argumentHint: '<read|info> <文件>', isEnabled: () => true, load: () => import('./index.ts') } satisfies Command
export default cmd
