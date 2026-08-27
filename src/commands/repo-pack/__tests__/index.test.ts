import { describe, it, expect, beforeAll } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import repoPack from '../index.ts'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

describe('repo-pack', () => {
  beforeAll(() => {
    mkdirSync(join(FIXTURES_DIR, 'src'), { recursive: true })
    writeFileSync(join(FIXTURES_DIR, 'src', 'main.ts'), 'export function hello() { return "world" }\n')
    writeFileSync(join(FIXTURES_DIR, 'src', 'utils.ts'), 'export function add(a: number, b: number) { return a + b }\n')
    writeFileSync(join(FIXTURES_DIR, 'README.md'), '# Test Project\nThis is a test.\n')
  })

  it('shows help with --help', async () => {
    const result = await repoPack.call('--help', {} as any)
    expect(result.type).toBe('text')
    expect(result.value).toContain('Repo Pack')
    expect(result.value).toContain('markdown')
    expect(result.value).toContain('xml')
    expect(result.value).toContain('json')
  })

  it('packs repository to markdown', async () => {
    const result = await repoPack.call('--include *.ts --include *.md', { cwd: FIXTURES_DIR } as any)
    expect(result.type).toBe('text')
    expect(result.value).toContain('Packed')
    expect(result.value).toContain('repomix-output.md')
  })

  it('packs to xml format', async () => {
    const result = await repoPack.call('--output xml --include *.ts --include *.md', { cwd: FIXTURES_DIR } as any)
    expect(result.type).toBe('text')
    expect(result.value).toContain('repomix-output.xml')
  })

  it('packs to json format', async () => {
    const result = await repoPack.call('--output json --include *.ts --include *.md', { cwd: FIXTURES_DIR } as any)
    expect(result.type).toBe('text')
    expect(result.value).toContain('repomix-output.json')
  })

  it('respects token budget', async () => {
    const result = await repoPack.call('--token-budget 10 --include *.ts --include *.md', { cwd: FIXTURES_DIR } as any)
    expect(result.type).toBe('text')
    expect(result.value).toContain('Packed')
  })

  it('includes git diff when requested', async () => {
    const result = await repoPack.call('--include-git-diff --include *.ts --include *.md', { cwd: FIXTURES_DIR } as any)
    expect(result.type).toBe('text')
    expect(result.value).toContain('repomix-output.md')
  })

  it('includes git log when requested', async () => {
    const result = await repoPack.call('--include-git-log 5 --include *.ts --include *.md', { cwd: FIXTURES_DIR } as any)
    expect(result.type).toBe('text')
    expect(result.value).toContain('repomix-output.md')
  })

  it('respects custom output file', async () => {
    const result = await repoPack.call('--output-file custom-output.md --include *.ts --include *.md', { cwd: FIXTURES_DIR } as any)
    expect(result.type).toBe('text')
    expect(result.value).toContain('custom-output.md')
  })

  it('respects custom output format and file', async () => {
    const result = await repoPack.call('--output json --output-file data.json --include *.ts --include *.md', { cwd: FIXTURES_DIR } as any)
    expect(result.type).toBe('text')
    expect(result.value).toContain('data.json')
  })

  it('shows directory structure when requested', async () => {
    const result = await repoPack.call('--directory-structure --include *.ts --include *.md', { cwd: FIXTURES_DIR } as any)
    expect(result.type).toBe('text')
    const match = result.value.match(/Output: (.+)/)
    const outputFile = match ? match[1].trim() : join(FIXTURES_DIR, 'repomix-output.md')
    const content = readFileSync(outputFile, 'utf-8')
    expect(content).toContain('Directory Structure')
    expect(content).toContain('README.md')
    expect(content).toContain('src')
  })
}, 30000)
