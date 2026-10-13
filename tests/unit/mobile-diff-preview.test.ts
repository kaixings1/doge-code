/**
 * 手机端 diff 预览生成的测试。
 *
 * 这段决定用户在手机上**看到什么**才决定要不要批准。它属于权限链路的
 * 安全边界：若 diff 生成错了（如把 new_string 标成删除行、或截断掉关键
 * 改动），用户会在错误信息上做判断 —— 比看不到 diff 更危险。
 *
 * 覆盖重点：
 * - Edit 的删/增方向必须正确（- 是旧内容、+ 是新内容）
 * - Write 全是新增行
 * - Bash 等命令类工具**不生成** diff（伪造一个反而误导）
 * - 超长截断保留首尾（中间多为重复上下文）
 *
 * 变异验证：把 Edit 的 `'-' + l` 与 `'+' + l` 对调，
 * 「删除行标 - / 新增行标 +」用例必然失败。
 */
import { describe, it, expect } from 'vitest'
import { buildDiffPreviewForMobile, MAX_DIFF_LINES } from '../../src/bridge/mobileDiffPreview.js'

describe('Edit 工具', () => {
  it('删除行标 - 、新增行标 +', () => {
    const d = buildDiffPreviewForMobile('Edit', {
      file_path: 'src/a.ts',
      old_string: 'const x = 1',
      new_string: 'const x = 2',
    })
    expect(d).toBeTruthy()
    expect(d!.kind).toBe('edit')
    expect(d!.filePath).toBe('src/a.ts')
    expect(d!.lines).toEqual(['-const x = 1', '+const x = 2'])
  })

  it('多行改动逐行标记', () => {
    const d = buildDiffPreviewForMobile('Edit', {
      file_path: 'a.ts',
      old_string: 'line1\nline2',
      new_string: 'line1\nLINE2',
    })
    expect(d!.lines).toEqual(['-line1', '-line2', '+line1', '+LINE2'])
  })

  it('只有 old_string 时视为纯删除', () => {
    const d = buildDiffPreviewForMobile('Edit', {
      file_path: 'a.ts',
      old_string: 'gone',
    })
    expect(d!.lines).toEqual(['-gone'])
  })

  it('只有 new_string 时视为纯新增', () => {
    const d = buildDiffPreviewForMobile('Edit', {
      file_path: 'a.ts',
      new_string: 'added',
    })
    expect(d!.lines).toEqual(['+added'])
  })

  it('两者都缺时不生成预览', () => {
    expect(buildDiffPreviewForMobile('Edit', { file_path: 'a.ts' })).toBeNull()
  })

  it('MultiEdit 走同一分支', () => {
    const d = buildDiffPreviewForMobile('MultiEdit', {
      file_path: 'a.ts',
      old_string: 'x',
      new_string: 'y',
    })
    expect(d!.kind).toBe('edit')
    expect(d!.lines).toContain('-x')
  })
})

describe('Write 工具', () => {
  it('全是新增行（Write 是覆盖写，旧内容不在入参里）', () => {
    const d = buildDiffPreviewForMobile('Write', {
      file_path: 'new.ts',
      content: 'a\nb',
    })
    expect(d!.kind).toBe('create')
    expect(d!.lines).toEqual(['+a', '+b'])
  })

  it('缺 content 时不生成', () => {
    expect(buildDiffPreviewForMobile('Write', { file_path: 'a.ts' })).toBeNull()
  })
})

describe('不生成 diff 的工具', () => {
  it.each(['Bash', 'Read', 'Grep', 'Glob', 'WebFetch'])('%s 不生成 diff', t => {
    // 命令类工具的入参本身就是完整信息；伪造一个"diff"反而误导
    expect(buildDiffPreviewForMobile(t, { command: 'ls', file_path: 'x' })).toBeNull()
  })

  it('未知工具名不生成', () => {
    expect(buildDiffPreviewForMobile('SomeFutureTool', { old_string: 'a' })).toBeNull()
  })
})

describe('边界', () => {
  it('非对象入参返回 null 而非崩', () => {
    expect(buildDiffPreviewForMobile('Edit', null)).toBeNull()
    expect(buildDiffPreviewForMobile('Edit', 'str')).toBeNull()
    expect(buildDiffPreviewForMobile('Edit', 42)).toBeNull()
  })

  it('file_path 缺失时回落为空串（不崩）', () => {
    const d = buildDiffPreviewForMobile('Edit', { old_string: 'a', new_string: 'b' })
    expect(d!.filePath).toBe('')
  })

  it('超长单行被截断（压缩文件的一整行会撑爆渲染）', () => {
    const long = 'x'.repeat(5000)
    const d = buildDiffPreviewForMobile('Edit', {
      file_path: 'a.ts',
      old_string: long,
      new_string: 'y',
    })
    expect(d!.lines[0]!.length).toBeLessThan(400)
    expect(d!.lines[0]!.endsWith('…')).toBe(true)
  })

  it(`超过 ${MAX_DIFF_LINES} 行时截断并保留首尾`, () => {
    const old = Array.from({ length: 100 }, (_, i) => `old${i}`).join('\n')
    const d = buildDiffPreviewForMobile('Edit', {
      file_path: 'a.ts',
      old_string: old,
      new_string: 'x',
    })
    expect(d!.truncatedLines).toBeGreaterThan(0)
    // 首行必须是第一条删除行（改动开头），尾行必须是新增行（改动结果）
    expect(d!.lines[0]).toBe('-old0')
    expect(d!.lines[d!.lines.length - 1]).toBe('+x')
    // 中间省略提示
    expect(d!.lines.some(l => l.includes('省略'))).toBe(true)
  })

  it('恰好等于上限时不标截断', () => {
    const content = Array.from({ length: MAX_DIFF_LINES }, (_, i) => `l${i}`).join('\n')
    const d = buildDiffPreviewForMobile('Write', { file_path: 'a.ts', content })
    expect(d!.truncatedLines).toBe(0)
    expect(d!.lines.length).toBe(MAX_DIFF_LINES)
  })

  it('空字符串内容不产生行（但对象仍返回）', () => {
    const d = buildDiffPreviewForMobile('Edit', {
      file_path: 'a.ts',
      old_string: '',
      new_string: '',
    })
    // 空串是合法值（表示插入/删除到空），但都为空时无信息量应返回 null
    expect(d).toBeNull()
  })
})
