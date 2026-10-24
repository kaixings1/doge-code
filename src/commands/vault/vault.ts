import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, extname, join, relative, resolve } from 'path'
import type { LocalCommandCall } from '../../types/command.js'
import { Bm25Index, type Bm25Doc } from '../../utils/bm25.js'

/**
 * /vault — 本地 Markdown 知识库检索（Obsidian 风格）
 *
 * 吸收自 claude-obsidian 的 wiki-retrieve / bm25-index 流程：
 * BM25 排序 → 返回段落片段 + 绝对路径，调用方再去 Read 原文综合。
 * 上游是 Python 实现（scripts/bm25-index.py + retrieve.py），这里用 TS 零依赖重写。
 *
 * 用法：
 *   /vault <关键词>                  检索当前目录（自动定位 vault）
 *   /vault --dir <path> <关键词>     指定 vault 目录
 *   /vault --tag <tag>               列出带该 tag 的笔记
 *   /vault --links <笔记名>          列出该笔记的出链 / 被链（[[wikilink]]）
 *   /vault --json <关键词>           JSON 输出
 */

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'temp', 'vendor', '.obsidian'])

interface VaultNote {
  path: string
  rel: string
  name: string
  text: string
}

function walkMarkdown(root: string, maxFiles = 3000): VaultNote[] {
  const out: VaultNote[] = []
  const stack = [root]
  while (stack.length > 0 && out.length < maxFiles) {
    const cur = stack.pop()!
    let entries: string[]
    try {
      entries = readdirSync(cur)
    } catch {
      continue
    }
    for (const name of entries) {
      if (out.length >= maxFiles) break
      if (name.startsWith('.') && name !== '.obsidian') continue
      const full = join(cur, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (!SKIP.has(name)) stack.push(full)
        continue
      }
      if (extname(name).toLowerCase() !== '.md') continue
      try {
        out.push({
          path: full,
          rel: relative(root, full),
          name: basename(name, '.md'),
          text: readFileSync(full, 'utf8'),
        })
      } catch {
        // 读取失败（权限/编码）时跳过，不影响整体检索
      }
    }
  }
  return out
}

/** 从笔记文本提取 [[wikilink]] 目标（去掉 |别名 与 #标题 部分）。 */
export function extractLinks(text: string): string[] {
  const out: string[] = []
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const target = m[1].trim()
    if (target) out.push(target)
  }
  return Array.from(new Set(out))
}

/** 提取 #tag（排除代码块内的 #）。 */
export function extractTags(text: string): string[] {
  const withoutFences = text.replace(/```[\s\S]*?```/g, '')
  const out = new Set<string>()
  const re = /(^|\s)#([\p{L}\p{N}_/-]+)/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(withoutFences))) {
    out.add(m[2])
  }
  return Array.from(out)
}

/** 自动定位 vault：有 .obsidian 的最近祖先目录，否则用当前目录。 */
function locateVault(explicit?: string): string {
  if (explicit) return resolve(explicit)
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, '.obsidian'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

function toDocs(notes: VaultNote[]): Bm25Doc[] {
  return notes.map(n => ({ id: n.rel, path: n.path, text: n.text }))
}

const call: LocalCommandCall = async (args, _context) => {
  let rest = args.trim()

  const takeOption = (flag: string): string | undefined => {
    const re = new RegExp(`^${flag}\\s+(\\S+)\\s*`)
    const m = rest.match(re)
    if (!m) return undefined
    rest = rest.slice(m[0].length)
    return m[1]
  }

  const dirArg = takeOption('--dir')
  const tagArg = takeOption('--tag')
  const linksArg = takeOption('--links')
  const json = /^--json\b/.test(rest)
  if (json) rest = rest.replace(/^--json\s*/, '')

  const root = locateVault(dirArg)
  if (!existsSync(root)) {
    return { type: 'text', value: `目录不存在: ${root}` }
  }

  const notes = walkMarkdown(root)

  if (tagArg) {
    const matched = notes.filter(n => extractTags(n.text).includes(tagArg))
    if (json) {
      return {
        type: 'text',
        value: JSON.stringify({ vault: root, tag: tagArg, notes: matched.map(n => n.rel) }, null, 2),
      }
    }
    return {
      type: 'text',
      value:
        matched.length === 0
          ? `vault ${root} 中没有带 #${tagArg} 的笔记（共扫描 ${notes.length} 篇）`
          : [`带 #${tagArg} 的笔记 (${matched.length}/${notes.length}):`, ...matched.map(n => `  ${n.rel}`)].join('\n'),
    }
  }

  if (linksArg) {
    const target = notes.find(n => n.name.toLowerCase() === linksArg.toLowerCase()) ??
      notes.find(n => n.name.toLowerCase().includes(linksArg.toLowerCase()))
    if (!target) {
      return { type: 'text', value: `未找到笔记「${linksArg}」` }
    }
    const outgoing = extractLinks(target.text)
    const backlinks = notes
      .filter(n => n.rel !== target.rel && extractLinks(n.text).some(l => l.toLowerCase() === target.name.toLowerCase()))
      .map(n => n.rel)
    if (json) {
      return {
        type: 'text',
        value: JSON.stringify({ note: target.rel, path: target.path, outgoing, backlinks }, null, 2),
      }
    }
    return {
      type: 'text',
      value: [
        `笔记: ${target.rel}`,
        '',
        `出链 (${outgoing.length}):`,
        ...(outgoing.length > 0 ? outgoing.map(l => `  → [[${l}]]`) : ['  （无）']),
        '',
        `反向链接 (${backlinks.length}):`,
        ...(backlinks.length > 0 ? backlinks.map(b => `  ← ${b}`) : ['  （无）']),
      ].join('\n'),
    }
  }

  const query = rest.trim()
  if (!query) {
    const tagged = notes.reduce((acc, n) => acc + extractTags(n.text).length, 0)
    return {
      type: 'text',
      value: [
        'vault 本地知识库（Obsidian 风格）',
        `目录: ${root}`,
        `Markdown 笔记: ${notes.length} 篇，标签 ${tagged} 个`,
        '',
        '用法:',
        '  /vault <关键词>               BM25 检索',
        '  /vault --tag <tag>           列出带该标签的笔记',
        '  /vault --links <笔记名>      查看出链/反向链接',
        '  /vault --dir <path> ...      指定 vault 目录',
      ].join('\n'),
    }
  }

  const index = new Bm25Index(toDocs(notes))
  const hits = index.search(query, 8)

  if (json) {
    return {
      type: 'text',
      value: JSON.stringify(
        {
          vault: root,
          query,
          notes: notes.length,
          hits: hits.map(h => ({
            path: relative(root, h.path),
            abs: h.path,
            line: h.line,
            score: Number(h.score.toFixed(4)),
            snippet: h.snippet,
          })),
        },
        null,
        2,
      ),
    }
  }

  if (hits.length === 0) {
    return { type: 'text', value: `未在 ${root} 中找到与「${query}」相关的笔记（已索引 ${notes.length} 篇）。` }
  }

  const lines = [`检索「${query}」— 命中 ${hits.length} 条（vault: ${root}，${notes.length} 篇）`, '']
  hits.forEach((h, i) => {
    lines.push(`${i + 1}. ${relative(root, h.path)}:${h.line}  score=${h.score.toFixed(3)}`)
    lines.push(`   ${h.snippet}`)
    lines.push(`   ${h.path}`)
  })
  return { type: 'text', value: lines.join('\n') }
}

export { call, locateVault, walkMarkdown }
