/**
 * 会话详情页「连接地址」构造的契约测试（针对已修缺陷）。
 *
 * **修复前的缺陷**：
 *   SessionDetailFragment 复制的是 `http://${s.cwd}:${s.port}` ——
 *   拿**工作目录路径**当主机名，拼出 `http://D:\doge-code:5680`，
 *   必然连不上。同时 MainActivity 里另有一份用 `currentHost()` 的
 *   正确实现（`detailAddressBuilder`），但它赋值后从未被读取，是死代码。
 *
 * 修法：地址构造收敛到 Host 一处，Fragment 只负责写剪贴板。
 *
 * 本测试锁定修法本身 —— 扫描源码确认不存在「用 cwd 当主机名」的拼接。
 * 这是**源码级契约测试**：若将来有人再加一份地址拼接（或改回用 cwd），
 * 测试会失败。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const FRAGMENT = 'android/app/src/main/java/com/dogecode/mobile/SessionDetailFragment.kt'
const ACTIVITY = 'android/app/src/main/java/com/dogecode/mobile/MainActivity.kt'

describe('详情页连接地址（已修缺陷的回归锁定）', () => {
  it('Fragment 不再自己拼接地址（不出现 cwd 当主机名）', () => {
    const src = readFileSync(FRAGMENT, 'utf8')
    // 只查**代码行**，排除注释 —— 注释里会引用修复前的错误写法作为反例
    const codeLines = src
      .split('\n')
      .filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
    const offenders = codeLines.filter(l => l.includes('http://'))
    expect(
      offenders.length,
      `Fragment 代码里不应出现 URL 拼接（发现 ${offenders.length} 处）：\n` +
        offenders.join('\n') +
        '\n地址构造必须由 Host 提供，否则会出现两份不一致的实现。',
    ).toBe(0)
  })

  it('Fragment 通过 Host 方法取地址而非直接构造', () => {
    const src = readFileSync(FRAGMENT, 'utf8')
    expect(src).toContain('fun detailAddress(session: SessionScanner.Session): String')
    expect(src).toContain('host?.detailAddress(s)')
  })

  it('Activity 用 currentHost 构造地址（而非会话的工作目录）', () => {
    const src = readFileSync(ACTIVITY, 'utf8')
    expect(src).toContain('override fun detailAddress(session: SessionScanner.Session): String')
    // 必须是 currentHost() 而不是 session.cwd
    const impl = src.slice(src.indexOf('override fun detailAddress'))
    const body = impl.slice(0, 200)
    expect(body, '应使用 currentHost() 作为主机名').toContain('currentHost()')
    expect(body, '不得使用 cwd 作为主机名').not.toContain('cwd')
  })

  it('死代码 detailAddressBuilder 已被移除', () => {
    const src = readFileSync(ACTIVITY, 'utf8')
    // 它是「赋值后从未被读取」的死代码 —— 与 Fragment 的拼接构成矛盾
    expect(src).not.toContain('detailAddressBuilder')
  })
})
