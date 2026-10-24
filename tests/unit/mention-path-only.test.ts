import { describe, it, expect } from 'vitest'
import { join, relative } from 'path'
import { buildMentionPathOnlyAttachment } from '../../src/utils/attachments.js'

/**
 * CLAUDE_CODE_DISABLE_FILE_MENTIONS（对齐官方 v2.1.299）
 *
 * 开启后 @提及只提供路径、不含文件内容。这里测路径构造这一环：
 * - 附件类型必须是 mention_path_only（不是带内容的 file）
 * - 相对路径被展开为绝对路径
 * - `:行号` / `:起-止` 后缀被剥离，不进入 filename
 */
describe('buildMentionPathOnlyAttachment', () => {
  it('返回 mention_path_only 类型且不含内容字段', () => {
    const att = buildMentionPathOnlyAttachment('package.json')
    expect(att.type).toBe('mention_path_only')
    expect('content' in att).toBe(false)
  })

  it('相对路径展开为绝对路径', () => {
    const att = buildMentionPathOnlyAttachment('package.json')
    expect(att.filename.endsWith('package.json')).toBe(true)
    // displayPath 是相对 cwd 的短路径，便于展示
    expect(att.displayPath).toBe(relative(process.cwd(), att.filename))
  })

  it('剥离单行号后缀（#L42）', () => {
    const att = buildMentionPathOnlyAttachment('src/foo.ts#L42')
    expect(att.filename.endsWith('foo.ts')).toBe(true)
    expect(att.filename).not.toContain('#L42')
  })

  it('剥离行范围后缀（#L10-20）', () => {
    const att = buildMentionPathOnlyAttachment('src/foo.ts#L10-20')
    expect(att.filename.endsWith('foo.ts')).toBe(true)
    expect(att.filename).not.toContain('#L10-20')
  })

  it('剥离标题锚点（#heading）', () => {
    const att = buildMentionPathOnlyAttachment('docs/guide.md#setup')
    expect(att.filename.endsWith('guide.md')).toBe(true)
    expect(att.filename).not.toContain('#setup')
  })

  it('绝对路径保持不变', () => {
    const abs = join(process.cwd(), 'src', 'index.ts')
    const att = buildMentionPathOnlyAttachment(abs)
    expect(att.filename).toBe(abs)
  })
})
