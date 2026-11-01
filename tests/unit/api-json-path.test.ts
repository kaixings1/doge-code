/**
 * DOGE_API_JSON 路径解析守卫。
 *
 * 背景：这个环境变量被 6 处独立代码读取，原本每处都写
 * `path.resolve(envPath.trim())`，不展开 `~`。在 Windows 上
 * `path.resolve('~\\.dogekey\\api.json')` 得到 `<cwd>\\~\\.dogekey\\api.json`
 * ——一个不存在的路径，于是 bootstrap 静默不加载任何配置，CLI 带着假 key 跑。
 *
 * 覆盖：
 * 1. `~\x`（Windows 启动脚本的写法）展开到 homedir
 * 2. `~/x`（POSIX 写法）同样展开
 * 3. 单独 `~`
 * 4. 未设置 / 空白 / 纯空格 → 返回 ''，让调用方保留各自的兜底路径
 * 5. 绝对路径原样保留（不被二次解析）
 * 6. 相对路径按 cwd 解析（保持改造前的行为）
 * 7. 首尾空白被 trim
 *
 * 变异验证（必须做，否则是复刻型假测试）：
 *   把 `resolve(expandHomePrefix(trimmed))` 改回 `resolve(trimmed)`
 *   → 用例 1/2/3 必须失败。实测已确认失败。
 */
import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { resolve } from 'path'
import {
  expandHomePrefix,
  resolveApiJsonPath,
} from '../../src/utils/apiJsonPath.js'

const HOME = homedir()

describe('resolveApiJsonPath', () => {
  it('expands the Windows tilde form used by the launchers', () => {
    // 这是最要紧的一条：D:\\... 下 path.resolve 会把 ~ 当普通目录名保留
    expect(resolveApiJsonPath('~\\.dogekey\\api.json')).toBe(
      resolve(HOME, '.dogekey', 'api.json'),
    )
  })

  it('expands the POSIX tilde form', () => {
    expect(resolveApiJsonPath('~/.dogekey/api.json')).toBe(
      resolve(HOME, '.dogekey', 'api.json'),
    )
  })

  it('expands a bare tilde', () => {
    expect(resolveApiJsonPath('~')).toBe(resolve(HOME))
  })

  it('returns empty string for unset / blank values', () => {
    // 调用方各有一套默认路径（cwd/.doge 或 exeDir/.doge），
    // 所以这里只能交还 ''，不能替它们选一个默认值。
    expect(resolveApiJsonPath(undefined)).toBe('')
    expect(resolveApiJsonPath(null)).toBe('')
    expect(resolveApiJsonPath('')).toBe('')
    expect(resolveApiJsonPath('   ')).toBe('')
  })

  it('leaves absolute paths untouched', () => {
    const abs = resolve(HOME, 'somewhere', 'api.json')
    expect(resolveApiJsonPath(abs)).toBe(abs)
  })

  it('still resolves relative paths against cwd', () => {
    // 改造前的行为必须保留：相对路径按当前目录解析
    expect(resolveApiJsonPath('.doge/api.json')).toBe(
      resolve(process.cwd(), '.doge', 'api.json'),
    )
  })

  it('trims surrounding whitespace', () => {
    expect(resolveApiJsonPath('  ~\\.dogekey\\api.json  ')).toBe(
      resolve(HOME, '.dogekey', 'api.json'),
    )
  })
})

describe('expandHomePrefix', () => {
  it('does NOT expand ~user, ~+ or ~- (path-injection guard)', () => {
    // ~Administrator\\.ssh\\id_rsa 指向*另一个*用户的家目录。
    // 展开它会把一个配置便利改成路径注入面，必须保持字面量。
    for (const p of ['~root/.ssh/id_rsa', '~+', '~-', '~someone\\x']) {
      expect(expandHomePrefix(p)).toBe(p)
    }
  })
})
