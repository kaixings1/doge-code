/**
 * 浏览器版聊天页的测试。
 *
 * 为什么必须测（此前的测试盲区）：
 * `renderMobileChatPage` 返回的是**内嵌 JS 的 HTML 字符串**。对 TypeScript
 * 而言，`<script>` 里的全部内容只是一坨普通文本 —— 类型检查、lint 都
 * 看不出其中的语法错误、拼错的函数名、未定义的变量。而这段代码是
 * **扫码用浏览器的人唯一的界面**，一旦脚本抛错，页面就是个死壳子。
 *
 * 做法：把 `<script>` 内容抽出来，在一个最小的假 DOM / 假 WebSocket
 * 环境里真的执行它，然后驱动完整交互：
 *   连接 → 收流式增量 → 收工具活动 → 收定稿 → 收权限请求 → 点批准
 *
 * 变异验证：把 appendDelta 里的 `previewText += chunk` 改成 `= chunk`，
 * 「多条增量累积」用例失败。
 */
import { describe, it, expect } from 'vitest'
import vm from 'vm'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { renderMobileChatPage } from '../../src/bridge/mobileBridge.js'

/** 从 HTML 里抽出 <script> 的脚本正文。 */
function extractScript(html: string): string {
  const m = html.match(/<script>([\s\S]*?)<\/script>/)
  if (!m) throw new Error('页面里没有 <script> 块')
  return m[1]!
}

/**
 * 最小 DOM 桩：只实现脚本实际调用的 API。
 *
 * 不做「复刻浏览器」——只实现用到的那部分，这样若脚本用了未实现的 API，
 * 测试会显式报错而不是静默通过。
 */
class El {
  tagName: string
  className = ''
  textContent = ''
  private _id = ''
  open = false
  style: Record<string, string> = {}
  children: El[] = []
  parent: El | null = null
  listeners: Record<string, ((e: any) => void)[]> = {}
  dataset: Record<string, string> = {}
  value = ''
  scrollTop = 0
  scrollHeight = 100
  disabled = false

  /** 全局 id 索引（真实 DOM 里 document.getElementById 的行为）。 */
  static index: Record<string, El> = {}

  /**
   * id 用访问器而非普通字段：真实 DOM 里给元素设 id 会自动进入
   * document 的 id 索引，脚本因此可以「先 createElement 再 getElementById
   * 找回它」。用普通字段就模拟不出这一点，会让脚本看起来在重复创建
   * 元素（那是**测试桩的缺陷**，不是产品缺陷）。
   */
  get id(): string {
    return this._id
  }
  set id(v: string) {
    this._id = v
    if (v) El.index[v] = this
  }

  constructor(tag: string) {
    this.tagName = tag.toUpperCase()
  }
  appendChild(c: El) {
    c.parent = this
    this.children.push(c)
    return c
  }
  removeChild(c: El) {
    this.children = this.children.filter(x => x !== c)
    if (c.parent === this) c.parent = null
  }
  remove() {
    this.parent?.removeChild(this)
  }
  addEventListener(ev: string, fn: (e: any) => void) {
    ;(this.listeners[ev] ||= []).push(fn)
  }
  /**
   * 支持两种选择器：`.class` 与 `tag`（脚本两者都用到）。
   * 递归查找（真实 querySelector 是深度优先）。
   */
  querySelector(sel: string): El | null {
    const byClass = sel.startsWith('.')
    const want = byClass ? sel.slice(1) : sel.toUpperCase()
    for (const c of this.children) {
      const hit = byClass
        ? c.className.split(' ').includes(want)
        : c.tagName === want
      if (hit) return c
      const deep = c.querySelector(sel)
      if (deep) return deep
    }
    return null
  }
  /** 递归找所有后代中 class 匹配的元素。 */
  findAll(cls: string): El[] {
    const out: El[] = []
    const walk = (n: El) => {
      if (n.className.split(' ').includes(cls)) out.push(n)
      n.children.forEach(walk)
    }
    this.children.forEach(walk)
    return out
  }
  get onclick() {
    return this.listeners['click']?.[0]
  }
  set onclick(fn: ((e: any) => void) | undefined) {
    this.listeners['click'] = fn ? [fn] : []
  }
  get textContentAll(): string {
    return this.textContent + this.children.map(c => c.textContentAll).join('')
  }
}

/** 假 WebSocket：记录发出的帧，并能从服务端推消息进来。 */
class FakeWS {
  static last: FakeWS | null = null
  url: string
  sent: any[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWS.last = this
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  /** 模拟服务端推一帧。 */
  push(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) })
  }
  open() {
    this.onopen?.()
  }
}

/** 在隔离环境里执行页面脚本，返回 DOM 与 WebSocket 句柄。 */
function runPage() {
  const html = renderMobileChatPage('sess-1', 5680, '')
  const script = extractScript(html)

  // 每次运行重置 id 索引，避免用例之间互相污染
  El.index = {}
  const byId = El.index
  const root = new El('body')
  const document = {
    createElement: (tag: string) => new El(tag),
    // 走 El 的全局索引：与「元素被设 id 时自动登记」配套
    getElementById: (id: string) => El.index[id] ?? null,
  }
  const mk = (id: string, tag = 'div') => {
    const e = new El(tag)
    e.id = id
    byId[id] = e
    // 挂到 root 下：断言从 root 里找元素，必须与脚本实际操作的
    // 那棵树是同一棵（否则 findAll 永远返回空）
    root.appendChild(e)
    return e
  }
  mk('log')
  mk('in', 'textarea')
  mk('send', 'button')
  mk('dot')
  mk('st')

  const sandbox: Record<string, any> = {
    document,
    WebSocket: FakeWS,
    location: { host: '127.0.0.1:5680' },
    setTimeout: () => 0, // 不做重连，避免测试里出现悬挂定时器
    Math,
    Date,
    JSON,
    String,
    Number,
    console,
    __root: root,
  }
  vm.createContext(sandbox)
  vm.runInContext(script, sandbox)

  const ws = FakeWS.last!
  ws.open()
  return { html, root, byId, ws }
}

describe('浏览器版聊天页 — 脚本可执行且功能完整', () => {
  it('脚本能在最小 DOM 环境里跑通（无语法/引用错误）', () => {
    // 这一步就是最大价值：任何未定义函数、拼错的字段都会在此暴露
    let err = ''
    try {
      runPage()
    } catch (e) {
      err = String((e as Error).stack || e)
    }
    expect(err, `页面脚本执行失败：\n${err}`).toBe('')
  })

  it('连接后状态点亮、发送按钮可用', () => {
    const { byId } = runPage()
    expect(byId['dot']!.className).toContain('on')
    expect(byId['send']!.disabled).toBe(false)
  })

  it('发送消息走 sendMessage 控制帧', () => {
    const { byId, ws } = runPage()
    byId['in']!.value = '你好'
    byId['send']!.onclick!(null)
    const frame = ws.sent.find(f => f.action === 'sendMessage')!
    expect(frame).toBeTruthy()
    expect(frame.params.message).toBe('你好')
    expect(frame.type).toBe('control')
  })

  // ── 流式增量（此前完全没有）──

  it('多条流式增量累积进同一个预览气泡', () => {
    const { root, ws } = runPage()
    ws.push({ type: 'assistant_delta', data: { text: '你' } })
    ws.push({ type: 'assistant_delta', data: { text: '好' } })
    ws.push({ type: 'assistant_delta', data: { text: '呀' } })
    const previews = root.findAll('preview')
    expect(previews.length, '应只有一个预览气泡（不是每条增量一个）').toBe(1)
    expect(previews[0]!.textContent).toBe('你好呀')
  })

  it('定稿到达后预览被移除，只留正式气泡', () => {
    const { root, ws } = runPage()
    ws.push({ type: 'assistant_delta', data: { text: '部分' } })
    ws.push({ type: 'assistant', data: { text: '完整回复' } })
    expect(root.findAll('preview').length, '预览应已被清掉').toBe(0)
    expect(JSON.stringify(root.children.map(c => c.textContentAll))).toContain('完整回复')
  })

  // ── 工具活动（此前完全没有）──

  it('工具 running 事件建可折叠条目并带命令原文', () => {
    const { root, ws } = runPage()
    ws.push({
      type: 'tool_activity',
      data: { kind: 'tool', name: 'Bash', target: 'ls', state: 'running', detail: 'ls -la' },
    })
    const tools = root.findAll('tool')
    expect(tools.length).toBe(1)
    expect(tools[0]!.textContentAll).toContain('Bash')
    expect(tools[0]!.textContentAll).toContain('ls -la')
  })

  it('工具结果按 toolUseId 合并进同一条（不新建）', () => {
    const { root, ws } = runPage()
    ws.push({
      type: 'tool_activity',
      data: { kind: 'tool', name: 'Bash', state: 'running', toolUseId: 'tu_1' },
    })
    ws.push({
      type: 'tool_activity',
      data: { state: 'done', result: '全部通过', toolUseId: 'tu_1' },
    })
    const tools = root.findAll('tool')
    expect(tools.length, '结果应合并而非新建条目').toBe(1)
    expect(tools[0]!.textContentAll).toContain('全部通过')
    expect(tools[0]!.dataset.state).toBe('done')
  })

  it('结果先于 running 到达时新建兜底条目（不丢输出）', () => {
    const { root, ws } = runPage()
    ws.push({
      type: 'tool_activity',
      data: { state: 'done', result: '孤立结果', toolUseId: 'tu_x' },
    })
    const tools = root.findAll('tool')
    expect(tools.length).toBe(1)
    expect(tools[0]!.textContentAll).toContain('孤立结果')
  })

  it('error 状态的条目带 err 类（可着色）', () => {
    const { root, ws } = runPage()
    ws.push({
      type: 'tool_activity',
      data: { kind: 'tool', name: 'Bash', state: 'running', toolUseId: 'tu_e' },
    })
    ws.push({
      type: 'tool_activity',
      data: { state: 'error', result: '命令失败', toolUseId: 'tu_e' },
    })
    const summary = root.findAll('tool')[0]!.querySelector('.tsum')!
    expect(summary.className).toContain('err')
  })

  // ── 用量（此前完全没有）──

  it('用量帧渲染成一行摘要', () => {
    const { root, ws } = runPage()
    ws.push({
      type: 'usage',
      data: { inputTokens: 10000, outputTokens: 2400, durationMs: 8300, costUSD: 0.023 },
    })
    const u = root.findAll('usage')
    expect(u.length).toBe(1)
    expect(u[0]!.textContent).toContain('12.4k tokens')
    expect(u[0]!.textContent).toContain('8.3s')
  })

  it('重复用量帧只保留一行（不堆叠）', () => {
    const { root, ws } = runPage()
    ws.push({ type: 'usage', data: { inputTokens: 100, durationMs: 1000 } })
    ws.push({ type: 'usage', data: { inputTokens: 200, durationMs: 2000 } })
    const u = root.findAll('usage')
    expect(u.length, '用量是累计值，不该堆成多行').toBe(1)
    expect(u[0]!.textContent).toContain('200')
  })

  it('全零用量不渲染', () => {
    const { root, ws } = runPage()
    ws.push({ type: 'usage', data: {} })
    expect(root.findAll('usage').length).toBe(0)
  })

  // ── 权限批准（此前完全没有，且缺了会让 AI 永久卡住）──

  it('权限请求渲染出批准卡片', () => {
    const { root, ws } = runPage()
    ws.push({
      type: 'permission_request',
      data: { requestId: 'r1', toolName: 'Bash', description: '执行 npm test' },
    })
    const perms = root.findAll('perm')
    expect(perms.length).toBe(1)
    expect(perms[0]!.textContentAll).toContain('Bash')
    expect(perms[0]!.textContentAll).toContain('执行 npm test')
  })

  it('点「批准」发出 permissionResponse(allow) 帧', () => {
    const { root, ws } = runPage()
    ws.push({ type: 'permission_request', data: { requestId: 'r1', toolName: 'Bash' } })
    const box = root.findAll('perm')[0]!
    const row = box.querySelector('.prow')!
    const allowBtn = row.children.find(c => c.textContent === '批准')!
    allowBtn.onclick!(null)
    const frame = ws.sent.find(f => f.action === 'permissionResponse')!
    expect(frame).toBeTruthy()
    expect(frame.params.requestId).toBe('r1')
    expect(frame.params.behavior).toBe('allow')
  })

  it('点「拒绝」发出 permissionResponse(deny) 帧', () => {
    const { root, ws } = runPage()
    ws.push({ type: 'permission_request', data: { requestId: 'r2', toolName: 'Write' } })
    const box = root.findAll('perm')[0]!
    const denyBtn = box.querySelector('.prow')!.children.find(c => c.textContent === '拒绝')!
    denyBtn.onclick!(null)
    expect(ws.sent.find(f => f.action === 'permissionResponse')!.params.behavior).toBe('deny')
  })

  it('决定后按钮被移除（防重复点击）', () => {
    const { root, ws } = runPage()
    ws.push({ type: 'permission_request', data: { requestId: 'r3', toolName: 'Bash' } })
    const box = root.findAll('perm')[0]!
    box.querySelector('.prow')!.children.find(c => c.textContent === '批准')!.onclick!(null)
    expect(box.querySelector('.prow'), '决定后不应再留下按钮').toBeNull()
    expect(box.textContentAll).toContain('已批准')
  })

  it('diff 预览按 +/- 着色', () => {
    const { root, ws } = runPage()
    ws.push({
      type: 'permission_request',
      data: {
        requestId: 'r4',
        toolName: 'Edit',
        diff: { lines: ['+新增行', '-删除行', ' 上下文'] },
      },
    })
    const spans = root.findAll('perm')[0]!.findAll('dl')
    expect(spans.length).toBe(3)
    expect(spans[0]!.className).toContain('add')
    expect(spans[1]!.className).toContain('del')
    expect(spans[2]!.className).toContain('ctx')
  })

  it('permission_cancel 移除按钮并标注已在终端处理', () => {
    const { root, ws } = runPage()
    ws.push({ type: 'permission_request', data: { requestId: 'r5', toolName: 'Bash' } })
    ws.push({ type: 'permission_cancel', data: { requestId: 'r5' } })
    const box = root.findAll('perm')[0]!
    expect(box.querySelector('.prow')).toBeNull()
    expect(box.textContentAll).toContain('电脑终端')
  })

  it('重复推送同一 requestId 不产生两张卡片', () => {
    const { root, ws } = runPage()
    ws.push({ type: 'permission_request', data: { requestId: 'r6', toolName: 'Bash' } })
    ws.push({ type: 'permission_request', data: { requestId: 'r6', toolName: 'Bash' } })
    expect(root.findAll('perm').length).toBe(1)
  })

  // ── 转义守卫（源码层，防止后来者改回单反斜杠）──

  it('源码里脚本段的 \\\\n 都写成了双反斜杠（防转译成真换行）', () => {
    // 这条守的是**源码层**，与上面「真执行」测试互补：
    // 真执行测试能抓到症状，但报错指向脚本第 N 行，病因却在 TS 模板的
    // 转义层，定位极难。这条直接扫源码，把病因钉住。
    //
    // 判据：脚本段内凡是「字符串里的换行转义」，源码必须是两个反斜杠
    // 加 n（写成 \\n），否则 esbuild 转译后变成真换行 → 字符串跨行 →
    // SyntaxError。注意 tsc 与 esbuild 行为不同，tsc 通过不代表能跑。
    const src = readFileSync(
      fileURLToPath(new URL('../../src/bridge/mobileBridge.ts', import.meta.url)),
      'utf8',
    )
    const start = src.indexOf('function renderMobileChatPage')
    const a = src.indexOf('<script>', start)
    const b = src.indexOf('</script>', start)
    const scriptSrc = src.slice(a, b)

    // 找「单个反斜杠 + n」出现处（前面不是反斜杠）
    const bad: string[] = []
    const re = /(^|[^\\])\\n/g
    let m: RegExpExecArray | null
    while ((m = re.exec(scriptSrc)) !== null) {
      const at = m.index + m[1]!.length
      const lineNo = scriptSrc.slice(0, at).split('\n').length
      bad.push(`第 ${lineNo} 行附近: ${JSON.stringify(scriptSrc.slice(at - 20, at + 8))}`)
    }
    expect(
      bad.join('\n'),
      '脚本段内存在单反斜杠 \\n —— 会被转译成真换行致页面脚本语法错误，' +
        `须写成双反斜杠：\n${bad.join('\n')}`,
    ).toBe('')
  })

  // ── 安全性：注入防护 ──

  it('secret 里的 </script> 被转义（不能闭合脚本标签）', () => {
    const html = renderMobileChatPage('s', 1, '</script><script>alert(1)</script>')
    const count = (html.match(/<\/script>/g) || []).length
    expect(count, '注入的 </script> 必须被转义为 \\u003c').toBe(1)
  })
})
