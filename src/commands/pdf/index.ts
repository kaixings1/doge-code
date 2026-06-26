import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import fs from 'fs'

export const call: LocalJSXCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: '/pdf read <file> | 读取 PDF 文本内容\n/pdf info <file> | PDF 基本信息\n/pdf images <file> | 提取图片信息' }
  const file = p[1]
  if (!file || !fs.existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
  let r = ''
  if (c === 'read') {
    try {
      const data = fs.readFileSync(file)
      const text = data.toString('utf-8').replace(/[^\x20-\x7E\u4e00-\u9fa5\n]/g, ' ').replace(/\s+/g, ' ').trim()
      r = text.slice(0, 5000) + (text.length > 5000 ? '\n...(truncated)' : '')
    } catch (e: any) { r = 'Error reading PDF: ' + e.message }
  } else if (c === 'info') {
    const stat = fs.statSync(file)
    r = 'File: ' + file + '\nSize: ' + (stat.size / 1024).toFixed(1) + ' KB\nModified: ' + stat.mtime.toISOString()
  } else {
    r = 'Unknown: ' + c
  }
  return { type: 'text', value: r || '(no content)' }
}

const cmd = { type: 'local-jsx' as const, name: 'pdf', description: 'PDF 文件读取与信息查看：read/info', argumentHint: '<read|info> <file>', isEnabled: true, load: () => import('./index.js') } satisfies Command
export default cmd
