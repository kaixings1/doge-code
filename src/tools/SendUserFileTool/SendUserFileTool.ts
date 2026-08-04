import { type Tool } from '../../engine/types.js'
import { readFileSync, existsSync, statSync } from 'fs'
import { extname } from 'path'

export class SendUserFileTool implements Tool {
  name = 'send_user_file'
  description = 'Read and send a user file, supports text/base64 encoding, chunking for large files, and partial reads'
  parameters = {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string', description: 'Path to the file to send' },
      encoding: { type: 'string', description: 'Output encoding: text or base64', enum: ['text', 'base64'] },
      maxSize: { type: 'number', description: 'Maximum file size in bytes' },
      offset: { type: 'number', description: 'Read from this byte offset' },
      length: { type: 'number', description: 'Read this many bytes (for chunked access)' },
      chunkSize: { type: 'number', description: 'Chunk size for large files' }
    },
    required: ['filePath']
  }
  validate = () => ({ valid: true })
  execute = async (params: Record<string, any>) => {
    const filePath = params?.filePath || ''
    const encoding = params?.encoding || 'text'
    const maxSize = params?.maxSize || 5 * 1024 * 1024
    const offset = params?.offset || 0
    const chunkSize = params?.chunkSize || 100 * 1024

    if (!filePath) return { content: [{ type: 'text', text: 'Error: No file path specified' }] }
    if (!existsSync(filePath)) return { content: [{ type: 'text', text: `Error: File not found: ${filePath}` }] }

    const fileSize = statSync(filePath).size
    const ext = extname(filePath).toLowerCase()
    const textExtensions = ['.txt', '.md', '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.toml', '.css', '.html', '.xml', '.csv', '.env', '.gitignore', '.bat', '.ps1', '.sh', '.py', '.rs', '.go', '.java', '.sql', '.prisma']
    const isText = textExtensions.includes(ext)

    // chunked access
    if (params?.length !== undefined || offset > 0) {
      const length = params?.length || Math.min(chunkSize, fileSize - offset)
      try {
        const fs = require('fs')
        const fd = fs.openSync(filePath, 'r')
        const buffer = Buffer.alloc(length)
        const bytesRead = fs.readSync(fd, buffer, 0, length, offset)
        fs.closeSync(fd)
        const data = buffer.slice(0, bytesRead)
        const content = encoding === 'base64' || !isText ? data.toString('base64') : data.toString('utf-8')
        return {
          content: [{
            type: 'text',
            text: `File: ${filePath}\nTotal Size: ${fileSize} bytes\nChunk: ${offset}-${offset + bytesRead} (${bytesRead} bytes)\nEncoding: ${encoding === 'base64' || !isText ? 'base64' : 'text'}\n\n${content}`
          }]
        }
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error reading chunk: ${err.message}` }] }
      }
    }

    // binary / base64 mode
    if (encoding === 'base64' || !isText) {
      if (fileSize > maxSize) {
        const chunks = Math.ceil(fileSize / chunkSize)
        return {
          content: [{
            type: 'text',
            text: `File too large (${fileSize} bytes > max ${maxSize}).\nUse offset/length params for chunked access.\nSuggested: ${chunks} chunks of ${chunkSize} bytes each.\n\nExample: offset=0 length=${chunkSize}`
          }]
        }
      }
      const content = readFileSync(filePath)
      const base64 = content.toString('base64')
      return { content: [{ type: 'text', text: `File: ${filePath}\nSize: ${content.length} bytes\nEncoding: base64\n\n${base64}` }] }
    }

    // text mode
    try {
      if (fileSize > maxSize) {
        const lines = readFileSync(filePath, 'utf-8').split('\n').length
        const chunks = Math.ceil(fileSize / chunkSize)
        return {
          content: [{
            type: 'text',
            text: `File too large (${fileSize} bytes > max ${maxSize}).\nLines: ${lines}\nUse offset/length params for chunked access.\nSuggested: ${chunks} chunks of ${chunkSize} bytes each.`
          }]
        }
      }
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').length
      return { content: [{ type: 'text', text: `File: ${filePath}\nSize: ${content.length} bytes\nLines: ${lines}\n\n${content}` }] }
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error reading file: ${err.message}` }] }
    }
  }
}