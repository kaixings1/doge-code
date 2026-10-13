/**
 * /mobile-connect 的「裸文本」回归测试。
 *
 * 背景（真实崩溃）：MobileConnectScreen 是手写 React Compiler 产物，缓存块写成
 *   let tN; if($[k] !== 依赖){ tN = <Text/>; $[k] = 依赖 } else { tN = $[k] }
 * 即把「依赖键槽」当「元素值槽」复用。第二次渲染命中 else 时 tN 被赋成**依赖本身**
 * （如 clientCount=0），React 渲染出裸数字 0 → Ink 报
 *   `Text string "0" must be rendered inside <Text> component`
 * 整个 REPL 掉进「恢复回退模式」。
 *
 * 单测无法轻易挂载 Ink 树（仓库未引入 ink-testing-library），故按既有
 * mobile-web-page.test.ts 的做法做**源码契约扫描**：断言危险模式已消失、
 * 且不再有 `$[k] = 依赖(原始值)` 这类错位赋值。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(
  join(here, '..', '..', 'src', 'commands', 'mobile', 'connect.tsx'),
  'utf8',
)

/** 取出 MobileConnectScreen 函数体（到 `export async function call` 之前） */
function screenBody(): string {
  const start = SRC.indexOf('function MobileConnectScreen')
  const end = SRC.indexOf('export async function call')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return SRC.slice(start, end)
}

describe('MobileConnectScreen 裸文本回归', () => {
  it('不存在「元素槽复用原始依赖」的缓存块', () => {
    const body = screenBody()
    // 合法形态：$[k] 在 if 分支存的是 JSX 元素（如 t1=函数、t16=元素），
    //          else 里 tN = $[k] 取回的也是同一类值。
    // 危险形态：$[k] 存的是**原始依赖**（数字/字符串），else 里 tN = $[k]
    //          会渲染出裸值。判定依据 = if 分支里 $[k] 被赋成的右侧不是 JSX。
    const bad: string[] = []
    const re = /else\s*\{\s*\n\s*(t\w+)\s*=\s*\$\[(\d+)\]\s*\n\s*\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      const slot = m[2]
      // 查该槽在 if 分支被赋成什么
      // 只取真正的赋值（= 后不能紧跟 =，排除 === / == 比较）
      const assignRe = new RegExp(`\\$\\[${slot}\\]\\s*=(?!=)\\s*([^\\n]+)`)
      const a = body.match(assignRe)
      if (!a) continue
      const rhs = a[1].trim()
      // 判定：该槽存的是「原始依赖」（connectInfo?.xxx / 数字 / 字符串字面量）
      // 才会导致 else 取回裸值。函数/JSX/变量引用（tN、onDone）均安全。
      const isRawDependency =
        rhs.startsWith('connectInfo?.') ||
        /^\d+$/.test(rhs) ||
        /^['"]/.test(rhs)
      if (isRawDependency) {
        bad.push(`$[${slot}] = ${rhs}  →  ${m[0].replace(/\s+/g, ' ')}`)
      }
    }
    expect(bad, `发现错位缓存块:\n${bad.join('\n')}`).toHaveLength(0)
  })

  it('不存在把原始依赖写入元素槽的赋值（$[k] = connectInfo?.xxx）', () => {
    const body = screenBody()
    // 历史 bug：$[5] = connectInfo?.status / $[6] = connectInfo?.clientCount
    const badAssign = /\$\d+\s*=\s*connectInfo\?\./g
    const hits = body.match(badAssign) ?? []
    expect(hits, `发现错位赋值:\n${hits.join('\n')}`).toHaveLength(0)
  })

  it('clientCount 仍渲染在 <Text> 内（防再次变成裸数字 0）', () => {
    const body = screenBody()
    // 必须有包在 Text 里的 clientCount 渲染
    expect(body).toMatch(/<Text>\s*已连接设备:\s*\{[^}]*clientCount[^}]*\}/)
  })
})
