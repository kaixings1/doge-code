import fs from 'fs'
import path from 'path'
import { LocalRagIndex } from '../../utils/localRag.js'

const DATA_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.doge-rag-index.json'
)

interface IndexEntry {
  file: string
  content: string
  indexedAt: string
}

function loadIndex(): IndexEntry[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    }
  } catch {}
  return []
}

function saveIndex(entries: IndexEntry[]) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf-8')
}

export const ragApi = {
  async indexFolder(folderPath: string): Promise<string> {
    const absPath = path.resolve(folderPath)
    if (!fs.existsSync(absPath)) return '未找到文件夹：' + absPath

    const entries: IndexEntry[] = []
    const extSet = new Set([
      '.ts', '.tsx', '.js', '.jsx', '.md', '.txt',
      '.json', '.yaml', '.yml', '.css', '.html',
      '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h'
    ])

    function walk(dir: string) {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true })
        for (const item of items) {
          const full = path.join(dir, item.name)
          if (item.isDirectory()) {
            if (!item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== 'dist' && item.name !== 'build') {
              walk(full)
            }
          } else if (extSet.has(path.extname(item.name))) {
            try {
              const content = fs.readFileSync(full, 'utf-8').slice(0, 50000)
              if (content.trim()) {
                entries.push({
                  file: full,
                  content,
                  indexedAt: new Date().toISOString(),
                })
              }
            } catch {}
          }
        }
      } catch {}
    }

    walk(absPath)
    saveIndex(entries)
    return 'Indexed ' + entries.length + ' files from ' + absPath + '\nSaved to: ' + DATA_FILE
  },

  async query(searchText: string): Promise<string> {
    const entries = loadIndex()
    if (entries.length === 0) return '没有已索引的文件。请先使用 /rag add。'

    // 用 TF-IDF 排序替代旧的「子串命中计数」：
    // 旧实现对中文不切词，`includes(整串)` 命中率极低；新版按字/词切分并做 IDF 加权。
    const idx = new LocalRagIndex(
      entries.map(e => ({ path: e.file, text: e.content, length: e.content.length }))
    )
    const hits = idx.search(searchText, 10)
    if (hits.length === 0) return 'No results for: ' + searchText

    const lines = ['Results for: ' + searchText, '']
    for (const h of hits) {
      lines.push('File: ' + h.path)
      lines.push('Score: ' + h.score.toFixed(3) + (h.line > 0 ? `  (line ${h.line})` : ''))
      lines.push((h.snippet || '').slice(0, 300))
      lines.push('')
    }
    return lines.join('\n')
  },

  async listIndexed(): Promise<string> {
    const entries = loadIndex()
    if (entries.length === 0) return 'No indexed files.'
    const groups: Record<string, number> = {}
    for (const e of entries) {
      const dir = path.dirname(e.file)
      groups[dir] = (groups[dir] || 0) + 1
    }
    const lines = ['Total indexed files: ' + entries.length, '']
    for (const [dir, count] of Object.entries(groups).sort()) {
      lines.push(dir + ' (' + count + ' files)')
    }
    return lines.join('\n')
  },

  async clearIndex(): Promise<string> {
    saveIndex([])
    return 'Knowledge base cleared.'
  },
}
