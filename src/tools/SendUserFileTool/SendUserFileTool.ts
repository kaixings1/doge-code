import { type Tool } from '../../engine/types.js'
import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'fs'
import { extname } from 'path'
import { createHash } from 'crypto'

export class SendUserFileTool implements Tool {
  name = 'send_user_file'
  description = 'Read and send a user file: text/base64 encoding, chunked access with validation, binary detection, preview mode, and SHA-256 hash'
  parameters = {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string', description: 'Path to the file to send' },
      encoding: { type: 'string', description: 'Output encoding: text or base64', enum: ['text', 'base64'] },
      maxSize: { type: 'number', description: 'Maximum file size in bytes (default 5MB)' },
      offset: { type: 'number', description: 'Read from this byte offset (must be >= 0)' },
      length: { type: 'number', description: 'Read this many bytes (must be > 0, offset+length <= file size)' },
      chunkSize: { type: 'number', description: 'Chunk size for large files (default 100KB)' },
      preview: { type: 'number', description: 'Preview mode: only show first N lines' },
      hash: { type: 'boolean', description: 'Include SHA-256 hash of the content' }
    },
    required: ['filePath']
  }
  validate = () => ({ valid: true })

  prompt = async (_options: {
    getToolPermissionContext: () => Promise<any>
    tools: any
    agents: any
    allowedAgentTypes?: string[]
  }): Promise<string> => {
    return this.description
  }

  execute = async (params: Record<string, any>) => {
    const filePath = params?.filePath || ''
    const encoding = params?.encoding || 'text'
    const maxSize = params?.maxSize || 5 * 1024 * 1024
    const offset = params?.offset || 0
    const chunkSize = params?.chunkSize || 100 * 1024
    const previewLines = typeof params?.preview === 'number' ? params.preview : 0
    const wantHash = params?.hash === true

    if (!filePath) return { content: [{ type: 'text', text: 'Error: No file path specified' }] }
    if (!existsSync(filePath)) return { content: [{ type: 'text', text: `Error: File not found: ${filePath}` }] }

    const fileSize = statSync(filePath).size

    // 参数校验
    if (offset < 0) return { content: [{ type: 'text', text: `Error: offset must be >= 0, got ${offset}` }] }
    if (params?.length !== undefined && params.length <= 0) {
      return { content: [{ type: 'text', text: `Error: length must be > 0, got ${params.length}` }] }
    }
    if (offset >= fileSize && fileSize > 0) {
      return { content: [{ type: 'text', text: `Error: offset ${offset} is beyond file size ${fileSize}` }] }
    }

    // 二进制内容检测：读前 512 字节检查 NUL 字节（比扩展名更可靠）
    const isBinary = () => {
      const sample = Buffer.alloc(Math.min(512, fileSize))
      let bytesRead = 0
      try {
        const fd = openSync(filePath, 'r')
        bytesRead = readSync(fd, sample, 0, sample.length, 0)
        closeSync(fd)
      } catch { return false }
      return sample.subarray(0, bytesRead).includes(0)
    }
    const ext = extname(filePath).toLowerCase()
    const textExtensions = ['.txt', '.md', '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.toml', '.css', '.html', '.xml', '.csv', '.env', '.gitignore', '.bat', '.ps1', '.sh', '.py', '.rs', '.go', '.java', '.sql', '.prisma']
    const isTextFile = textExtensions.includes(ext) && !isBinary()
    const useBase64 = encoding === 'base64' || !isTextFile

    // SHA-256 哈希辅助（对任意 Buffer 内容）
    const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex')

    // chunked access（提供 offset/length 或 offset > 0）
    if (params?.length !== undefined || offset > 0) {
      const length = params?.length !== undefined
        ? params.length
        : Math.min(chunkSize, fileSize - offset)
      if (offset + length > fileSize) {
        return { content: [{ type: 'text', text: `Error: offset(${offset}) + length(${length}) exceeds file size ${fileSize}` }] }
      }
      try {
        const fd = openSync(filePath, 'r')
        const buffer = Buffer.alloc(length)
        const bytesRead = readSync(fd, buffer, 0, length, offset)
        closeSync(fd)
        const data = buffer.subarray(0, bytesRead)
        const content = useBase64 ? data.toString('base64') : data.toString('utf-8')
        const lines = [
          `File: ${filePath}`,
          `Total Size: ${fileSize} bytes`,
          `Chunk: ${offset}-${offset + bytesRead} (${bytesRead} bytes)`,
          `Encoding: ${useBase64 ? 'base64' : 'text'}`,
        ]
        if (wantHash) lines.push(`SHA-256: ${sha256(data)}`)
        lines.push('', content)
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error reading chunk: ${err.message}` }] }
      }
    }

    // base64 / 二进制模式
    if (useBase64) {
      if (fileSize > maxSize) {
        const chunks = Math.ceil(fileSize / chunkSize)
        return {
          content: [{
            type: 'text',
            text: `File too large (${fileSize} bytes > max ${maxSize}).\nUse offset/length params for chunked access.\nSuggested: ${chunks} chunks of ${chunkSize} bytes each.\n\nExample: offset=0 length=${chunkSize}`
          }]
        }
      }
      const data = readFileSync(filePath)
      const base64 = data.toString('base64')
      const lines = [`File: ${filePath}`, `Size: ${data.length} bytes`, `Encoding: base64`]
      if (wantHash) lines.push(`SHA-256: ${sha256(data)}`)
      lines.push('', base64)
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    // 文本模式
    try {
      if (fileSize > maxSize) {
        // 大文本文件：分片读取前 5KB 用于预览 + 建议
        const fd = openSync(filePath, 'r')
        const sample = Buffer.alloc(Math.min(5 * 1024, fileSize))
        const bytesRead = readSync(fd, sample, 0, sample.length, 0)
        closeSync(fd)
        const sampleText = sample.subarray(0, bytesRead).toString('utf-8')
        const totalLines = (readFileSync(filePath, 'utf-8').match(/\n/g) || []).length + 1
        const chunks = Math.ceil(fileSize / chunkSize)
        return {
          content: [{
            type: 'text',
            text: `File too large (${fileSize} bytes > max ${maxSize}).\nLines: ${totalLines}\nUse offset/length params for chunked access.\nSuggested: ${chunks} chunks of ${chunkSize} bytes each.\n\n**Preview (first ${bytesRead} bytes):**\n\`\`\`\n${sampleText}\n\`\`\``
          }]
        }
      }
      let content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').length
      // 预览模式：只显示前 N 行
      if (previewLines > 0 && lines > previewLines) {
        const preview = content.split('\n').slice(0, previewLines).join('\n')
        const lines2 = [
          `File: ${filePath}`,
          `Size: ${content.length} bytes`,
          `Lines: ${lines}`,
          `Preview: first ${previewLines} lines`,
        ]
        if (wantHash) lines2.push(`SHA-256: ${createHash('sha256').update(content, 'utf-8').digest('hex')}`)
        lines2.push('', '```', preview, '```', '', `*... and ${lines - previewLines} more lines*`)
        return { content: [{ type: 'text', text: lines2.join('\n') }] }
      }
      const result = [`File: ${filePath}`, `Size: ${content.length} bytes`, `Lines: ${lines}`]
      if (wantHash) result.push(`SHA-256: ${createHash('sha256').update(content, 'utf-8').digest('hex')}`)
      result.push('', content)
      return { content: [{ type: 'text', text: result.join('\n') }] }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error reading file: ${err.message}` }] }
    }
  }
}
