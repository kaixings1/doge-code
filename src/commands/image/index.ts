import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

export const call: LocalJSXCommandCall = async (args) => {
  const p = args.trim().split(/\s+/)
  const c = p[0] || ''
  if (!c) return { type: 'text', value: '/image info <file> | 图片基本信息\n/image resize <file> <w> <h> | 调整大小\n/image convert <file> <format> | 格式转换\n/image ls <dir> | 列出图片文件' }

  const file = p[1]
  let r = ''
  if (c === 'ls') {
    const dir = file || '.'
    try {
      const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(f))
      r = files.map(f => path.join(dir, f)).join('\n') || '(no images)'
    } catch (e: any) { r = 'Error: ' + e.message }
  } else if (c === 'info') {
    if (!file || !fs.existsSync(file)) return { type: 'text', value: 'File not found: ' + (file || '') }
    const stat = fs.statSync(file)
    const ext = path.extname(file).toLowerCase()
    r = 'File: ' + file + '\nType: ' + ext + '\nSize: ' + (stat.size / 1024).toFixed(1) + ' KB'
  } else if (c === 'convert') {
    const fmt = p[2] || 'png'
    if (!file || !fs.existsSync(file)) return { type: 'text', value: 'File not found' }
    const out = file.replace(/\.[^.]+$/, '') + '.' + fmt
    const { execSync } = await import('child_process')
    try {
      execSync('magick convert "' + file + '" "' + out + '"', { timeout: 30000 })
      r = 'Converted to: ' + out
    } catch { r = 'ImageMagick not installed. Try: /image info ' + file }
  } else {
    r = 'Unknown: ' + c
  }
  return { type: 'text', value: r || '(no output)' }
}

const cmd = { type: 'local-jsx' as const, name: 'image', description: '图片信息查看与管理：info/ls/convert', argumentHint: '<info|ls|convert> [args]', isEnabled: true, load: () => import('./index.js') } satisfies Command
export default cmd
