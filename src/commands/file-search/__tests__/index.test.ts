import { describe, expect, test } from 'vitest'
import * as fileSearchModule from '../index'

const call = fileSearchModule.call

/** 窄化到 text 结果并取出 value，避免 LocalCommandResult 联合类型报错 */
async function callText(args: string): Promise<string> {
  const result = await call(args)
  if (result.type !== 'text') throw new Error('expected text result, got ' + result.type)
  return result.value
}

// 全仓递归扫描随仓库增长而变慢，给足超时避免误报失败
const SCAN_TIMEOUT = 120_000

describe('file-search', () => {
  test('returns help for empty args', async () => {
    const value = await callText('')
    expect(value).toContain('文件搜索')
    expect(value).toContain('stats')
  })

  test('stats works without shell find/wc (cross-platform)', async () => {
    const value = await callText('stats')
    expect(value).toContain('项目文件数')
    // 必须真正数出文件，而不是走到 catch 分支
    expect(value).not.toContain('无法统计文件数')
    const n = Number(value.replace(/\D/g, ''))
    expect(n).toBeGreaterThan(0)
  }, SCAN_TIMEOUT)

  test('grep returns matches in file:line format', async () => {
    const value = await callText('grep execSync')
    expect(value).toContain('个匹配')
    // 断言输出格式为 "路径:行号 - 内容"
    expect(value).toMatch(/:\d+ - /)
  }, SCAN_TIMEOUT)

  test('grep without pattern returns usage', async () => {
    const value = await callText('grep')
    expect(value).toContain('用法')
  })

  test('rg is aliased to grep behaviour', async () => {
    const value = await callText('rg execSync')
    expect(value).toContain('个匹配')
  }, SCAN_TIMEOUT)

  test('non-matching pattern reports no match', async () => {
    const needle = 'zzz_' + 'no_such' + '_pattern_' + 'zzz'
    const value = await callText(needle)
    expect(value).toContain('未找到匹配')
  }, SCAN_TIMEOUT)
})
