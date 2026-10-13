// 核对：页面调用的 electronAPI.X.Y 是否都在 preload 中暴露，以及 channel 是否两头对齐
// 用法: node scripts/_audit-api-usage.mjs [repoRoot]
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.argv[2] || 'D:/kx2api'
const PAGES = path.join(ROOT, 'src/renderer/src/pages')
const PRELOAD = path.join(ROOT, 'src/preload/index.ts')
const CHANNELS = path.join(ROOT, 'src/main/ipc/channels.ts')
const HANDLER_FILES = ['handlers.ts', 'chat-handlers.ts', 'task-handlers.ts']
  .map(f => path.join(ROOT, 'src/main/ipc', f))

const read = f => fs.readFileSync(f, 'utf8')

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(p, out) }
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(p)
  }
  return out
}

// ---------- 1. 页面调用点 ----------
const callRe = /electronAPI\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/g
const calls = new Map()
for (const f of walk(PAGES)) {
  read(f).split(/\r?\n/).forEach((l, i) => {
    let m; callRe.lastIndex = 0
    while ((m = callRe.exec(l))) {
      const k = `${m[1]}.${m[2]}`
      if (!calls.has(k)) calls.set(k, new Set())
      calls.get(k).add(`${path.relative(ROOT, f).replace(/\\/g, '/')}:${i + 1}`)
    }
  })
}

// ---------- 2. preload 暴露 ----------
const pre = read(PRELOAD)
const preLines = pre.split(/\r?\n/)

// 提取独立 API 对象块: const xxxAPI = { ... }\n}
const apiBlocks = new Map()
for (let i = 0; i < preLines.length; i++) {
  const m = preLines[i].match(/^const ([A-Za-z0-9_]+)\s*=\s*\{\s*$/)
  if (!m) continue
  // 找收尾顶格 }
  let j = i + 1
  const methods = new Set()
  for (; j < preLines.length; j++) {
    if (/^\}/.test(preLines[j])) break
    const mm = preLines[j].match(/^\s{2}([A-Za-z0-9_]+)\s*[:(]/)
    if (mm) methods.add(mm[1])
  }
  apiBlocks.set(m[1], methods)
  i = j
}

// 从 electronAPI 块（890行 const electronAPI = { 到顶格 }）解析命名空间
const startIdx = preLines.findIndex(l => /^const electronAPI\s*=\s*\{\s*$/.test(l))
const exposed = new Set()
if (startIdx >= 0) {
  // 用花括号计数定位 electronAPI 对象整体范围的结束（顶格 }）
  let brace = 0
  let endIdx = -1
  for (let i = startIdx; i < preLines.length; i++) {
    brace += (preLines[i].match(/\{/g) || []).length - (preLines[i].match(/\}/g) || []).length
    if (i > startIdx && brace <= 0) { endIdx = i; break }
  }
  const body = preLines.slice(startIdx + 1, endIdx < 0 ? preLines.length : endIdx)
  const nsVar = new Map(), inlineNs = new Map()
  let cur = null, curSet = null
  for (const line of body) {
    if (cur) {
      const mm = line.match(/^\s{4}([A-Za-z0-9_]+)\s*[:(]/)
      if (mm) curSet.add(mm[1])
      if (/^\s{2}\},?\s*$/.test(line)) { inlineNs.set(cur, curSet); cur = null; curSet = null }
      continue
    }
    const nm = line.match(/^\s{2}([A-Za-z0-9_]+)\s*:\s*([A-Za-z0-9_]+)\s*,?\s*$/)
    if (nm && apiBlocks.has(nm[2])) { nsVar.set(nm[1], nm[2]); continue }
    const nm2 = line.match(/^\s{2}([A-Za-z0-9_]+)\s*:\s*\{\s*$/)
    if (nm2) { cur = nm2[1]; curSet = new Set(); continue }
  }
  for (const [ns, v] of nsVar) for (const m of (apiBlocks.get(v) || [])) exposed.add(`${ns}.${m}`)
  for (const [ns, set] of inlineNs) for (const m of set) exposed.add(`${ns}.${m}`)
  console.log(`[debug] electronAPI 范围行 ${startIdx + 1}-${endIdx + 1}, 内联ns=${[...inlineNs.keys()].join(',')}, 引用ns=${[...nsVar.keys()].join(',')}`)
}

// ---------- 3. channels / handlers ----------
const chSrc = read(CHANNELS)
const channelNames = new Set([...chSrc.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*[:=]/gm)].map(m => m[1]))
const hSrc = HANDLER_FILES.map(read).join('\n')
const handled = new Set()
for (const m of hSrc.matchAll(/ipcMain\.handle\(\s*[^,]*?(?:IpcChannels\.)?(['"`]?)([A-Z][A-Z0-9_]*)\1/g)) handled.add(m[2])
// 也抓起 string literal 形式
for (const m of hSrc.matchAll(/ipcMain\.handle\(\s*['"`]([A-Z][A-Z0-9_]*)['"`]/g)) handled.add(m[1])
const preChannels = new Set([...pre.matchAll(/IpcChannels\.([A-Z][A-Z0-9_]*)/g)].map(m => m[1]))

// ---------- 输出 ----------
console.log('===== [P0] 页面调用但 preload 未暴露 =====')
const missing = []
for (const [k, locs] of [...calls].sort()) if (!exposed.has(k)) missing.push({ api: k, at: [...locs].slice(0, 6) })
console.log(missing.length ? JSON.stringify(missing, null, 2) : '(无)')

console.log('\n===== [P0] preload 引用的 channel 在 channels.ts 未定义 =====')
const chMiss = [...preChannels].filter(c => !channelNames.has(c)).sort()
console.log(chMiss.length ? chMiss.join('\n') : '(无)')

console.log('\n===== [P1] channel 已定义但无 ipcMain.handle =====')
const notHandled = [...channelNames].filter(c => !handled.has(c)).sort()
console.log(notHandled.length ? notHandled.join('\n') : '(无)')

console.log(`\n统计: 页面调用 ${calls.size} / preload 暴露 ${exposed.size} / channels ${channelNames.size} / handled ${handled.size}`)
console.log('页面调用清单:', [...calls.keys()].sort().join(', '))
