#!/usr/bin/env node
/**
 * scripts/convert-opencode.mjs
 *
 * 将 .claude/agents/*.md 代理文件转换为 OpenCode 兼容格式。
 *
 * OpenCode 代理格式：
 * - YAML frontmatter: name, description
 * - 内容: Markdown prompt
 *
 * Claude Code 代理格式（输入）：
 * - YAML frontmatter: name, description, tools, model
 * - 内容: Markdown prompt
 *
 * 转换逻辑：
 * 1. 提取 name 和 description
 * 2. 移除 tools 和 model 字段（OpenCode 不需要）
 * 3. 保留完整的 prompt 内容
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const AGENTS_DIR = join(projectRoot, '.claude', 'agents')
const OUTPUT_DIR = join(projectRoot, '.claude', 'agents', 'integrations', 'opencode', 'agents')

function parseFrontmatter(content) {
  // 处理 UTF-8 BOM 和 CRLF 行尾
  const clean = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return { frontmatter: {}, body: clean }

  const frontmatter = {}
  const lines = match[1].split('\n')
  let currentKey = null

  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.*)/)
    if (kvMatch) {
      currentKey = kvMatch[1]
      let value = kvMatch[2].trim()
      // YAML 数组: [Read, Grep, Glob]
      if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1).trim()
        frontmatter[currentKey] = inner === ''
          ? []
          : inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''))
      } else {
        frontmatter[currentKey] = value
      }
    } else if (currentKey && line.startsWith('  ')) {
      // 多行 YAML 值的续行（缩进 2 空格）
      frontmatter[currentKey] += '\n' + line.replace(/^  /, '')
    }
  }

  const body = clean.slice(match[0].length).trim()
  return { frontmatter, body }
}

function convertToOpenCode(frontmatter, body) {
  const opencodeFrontmatter = {
    name: frontmatter.name || '',
    description: frontmatter.description || '',
  }

  const fmStr = `---\nname: ${opencodeFrontmatter.name}\ndescription: ${opencodeFrontmatter.description}\n---\n\n`

  return fmStr + body
}

async function main() {
  console.log('=== OpenCode Agent 转换 ===\n')

  // 读取所有 agent 文件
  const files = await readdir(AGENTS_DIR)
  const mdFiles = files.filter(f => f.endsWith('.md') && !f.startsWith('.') && f !== 'README.md')

  console.log(`发现 ${mdFiles.length} 个代理文件\n`)

  // 确保输出目录存在
  await mkdir(OUTPUT_DIR, { recursive: true })

  let converted = 0
  let skipped = 0

  for (const file of mdFiles) {
    const srcPath = join(AGENTS_DIR, file)
    const content = await readFile(srcPath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(content)

    if (!frontmatter.name || !frontmatter.description) {
      console.log(`  SKIP: ${file} (缺少 name 或 description)`)
      skipped++
      continue
    }

    const opencodeContent = convertToOpenCode(frontmatter, body)
    const outFile = join(OUTPUT_DIR, file)
    await writeFile(outFile, opencodeContent, 'utf-8')
    console.log(`  CONVERT: ${file} → ${frontmatter.name}`)
    converted++
  }

  console.log(`\n=== 转换完成 ===`)
  console.log(`  转换: ${converted}`)
  console.log(`  跳过: ${skipped}`)
  console.log(`  输出: ${OUTPUT_DIR}`)
}

main().catch(err => {
  console.error('转换失败:', err)
  process.exit(1)
})
