#!/usr/bin/env node
/**
 * 手机端对话功能 — 电脑端自检脚本
 *
 * 用法: node scripts/verify-mobile.mjs
 *
 * 检查所有「不需要真手机」就能确认的项目，减少真机排查成本。
 * 真机扫码链路仍需人工验证（见脚本末尾清单）。
 */
import { existsSync, statSync } from 'fs'
import { execSync } from 'child_process'
import { networkInterfaces } from 'os'
import { createConnection } from 'net'

const ROOT = 'D:\\doge-code'
const EXE = ROOT + '\\doge.exe'
const PORT = 5680

let pass = 0
let fail = 0
const notes = []

function ok(msg) { console.log('       OK   ' + msg); pass++ }
function bad(msg) { console.log('       FAIL ' + msg); fail++ }
function warn(msg) { console.log('       WARN ' + msg) }
function info(msg) { console.log('       ' + msg) }

console.log('')
console.log('============================================================')
console.log('  手机端对话功能 — 电脑端自检')
console.log('============================================================')

// ── 1. doge.exe 存在 ──
console.log('')
console.log('[1/6] doge.exe')
if (existsSync(EXE)) {
  const size = Math.round(statSync(EXE).size / 1024 / 1024)
  ok(`存在（${size} MB）`)
} else {
  bad('未找到，请先运行 compile.bat')
}

// ── 2. 二进制含新代码 ──
console.log('')
console.log('[2/6] doge.exe 是否包含本次修复')
if (existsSync(EXE)) {
  try {
    // 在二进制中搜索仅新代码才有的字符串
    const out = execSync(`findstr /c:"mobile-web" "${EXE}"`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 30000,
    })
    if (out && out.length > 0) ok('含新代码标记 mobile-web')
    else bad('未找到标记 → 是旧二进制，需重新 compile.bat')
  } catch {
    bad('未找到标记 → 是旧二进制，需重新 compile.bat')
  }
} else {
  info('跳过')
}

// ── 3. 局域网 IP ──
console.log('')
console.log('[3/6] 局域网 IP')
let routeIp = null
try {
  const out = execSync('route print -4', { encoding: 'utf8', timeout: 5000, windowsHide: true })
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.startsWith('0.0.0.0')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 5) continue
    if (parts[2] === '0.0.0.0' || !parts[3]) continue
    if (parts[3].startsWith('169.254.') || parts[3] === '127.0.0.1') continue
    routeIp = parts[3]
    break
  }
} catch (e) {
  warn('路由解析失败: ' + e.message)
}
if (routeIp) {
  ok(`程序将使用 ${routeIp}（与 getLanIp() 同逻辑）`)
  notes.push(`phone-url: http://${routeIp}:${PORT}`)
} else {
  bad('未找到有效局域网 IP → 请检查是否连着 WiFi')
}

// 列出所有候选，便于人工确认
console.log('')
info('所有网卡地址（供参考）:')
const ifs = networkInterfaces()
for (const name of Object.keys(ifs)) {
  for (const i of ifs[name] || []) {
    if (i.family === 'IPv4' && !i.internal) {
      const mark = i.address === routeIp ? '  <-- 将使用' : ''
      info(`  ${name}: ${i.address}${mark}`)
    }
  }
}

// ── 4. 防火墙 ──
console.log('')
console.log('[4/6] 防火墙规则')
try {
  const out = execSync('netsh advfirewall firewall show rule name="doge-code mobile"', {
    encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (out.includes('doge-code mobile')) ok('规则已存在')
  else bad('规则不存在')
} catch {
  bad('规则不存在 → 需管理员执行:')
  info(`netsh advfirewall firewall add rule name="doge-code mobile" dir=in action=allow protocol=TCP localport=${PORT} remoteip=192.168.0.0/24`)
}

// ── 5. 端口占用 ──
console.log('')
console.log('[5/6] 端口 ' + PORT)
await new Promise((resolve) => {
  const sock = createConnection({ port: PORT, host: '127.0.0.1', timeout: 1500 })
  sock.on('connect', () => { info('已被监听（可能上次的 doge 未退出）'); sock.destroy(); resolve() })
  sock.on('timeout', () => { info('空闲（正常，启动 /mobile-connect 后才监听）'); sock.destroy(); resolve() })
  sock.on('error', () => { info('空闲（正常）'); resolve() })
})

// ── 6. 环境变量 ──
console.log('')
console.log('[6/6] 环境变量')
if (process.env.CLAUDE_CODE_MOBILE_BRIDGE === '1') {
  ok('CLAUDE_CODE_MOBILE_BRIDGE=1')
} else {
  bad('CLAUDE_CODE_MOBILE_BRIDGE 未设为 1')
  info('启动前执行: set CLAUDE_CODE_MOBILE_BRIDGE=1')
}
if (process.env.CLAUDE_CODE_MOBILE_SECRET) {
  ok('CLAUDE_CODE_MOBILE_SECRET 已设置')
} else {
  warn('密钥未设置 —— 等于把本机命令执行能力开放给整个局域网')
}

// ── 汇总 ──
console.log('')
console.log('============================================================')
console.log(`  通过 ${pass} 项，待办 ${fail} 项`)
console.log('============================================================')
console.log('')
console.log('启动步骤:')
console.log('  set CLAUDE_CODE_MOBILE_BRIDGE=1')
console.log('  set CLAUDE_CODE_MOBILE_SECRET=你的密钥')
console.log('  doge.exe')
console.log('')
console.log('然后 CLI 内输入: /mobile-connect')
console.log('')
console.log('真机验收清单:')
console.log('  1. 界面 IP 应为 192.168.0.106（非 169.254.x.x）')
console.log('  2. 手机连同一 WiFi，扫二维码')
console.log('  3. 手机页面顶部圆点变绿 + 显示「已连接」')
console.log('  4. 电脑端「已连接设备」由 0 变 1')
console.log('  5. 手机发消息 → 电脑 CLI 出现该消息      【关键】')
console.log('  6. AI 回复 → 手机出现灰色气泡            【关键】')
console.log('')
if (notes.length) {
  console.log('本机信息:')
  for (const n of notes) console.log('  ' + n)
  console.log('')
}
