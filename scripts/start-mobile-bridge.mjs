#!/usr/bin/env node
/**
 * doge-code 手机端 — 一键启动脚本
 *
 * 用法: node scripts/start-mobile-bridge.mjs
 *
 * 作用：检查前置条件 → 设置环境变量 → 启动 doge.exe
 * 把「检测 IP、查防火墙、设密钥、清端口」这些手工步骤自动化。
 */
import { existsSync } from 'fs'
import { execSync, spawn } from 'child_process'
import { networkInterfaces } from 'os'
import { createConnection } from 'net'

const EXE = 'D:\\doge-code\\doge.exe'
const PORT = 5680
const DEFAULT_SECRET = 'doge2026'

function line() { console.log('='.repeat(60)) }

line()
console.log('  doge-code 手机端桥接 — 启动')
line()
console.log('')

// ── 1. doge.exe ──
if (!existsSync(EXE)) {
  console.log('[错误] 未找到 ' + EXE)
  console.log('       请先运行 compile.bat 编译')
  process.exit(1)
}
console.log('[1/4] doge.exe 存在')

// ── 2. 局域网 IP（与 getLanIp 同逻辑：优先默认路由）──
let ip = null
try {
  const out = execSync('route print -4', { encoding: 'utf8', timeout: 5000, windowsHide: true })
  for (const raw of out.split(/\r?\n/)) {
    const l = raw.trim()
    if (!l.startsWith('0.0.0.0')) continue
    const p = l.split(/\s+/)
    if (p.length < 5 || p[2] === '0.0.0.0' || !p[3]) continue
    if (p[3].startsWith('169.254.') || p[3] === '127.0.0.1') continue
    ip = p[3]
    break
  }
} catch {}
if (!ip) {
  // 回退：取第一个非回环私网地址
  const ifs = networkInterfaces()
  for (const n of Object.keys(ifs)) {
    for (const i of ifs[n] || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) {
        ip = i.address
        break
      }
    }
    if (ip) break
  }
}
console.log('[2/4] 局域网 IP: ' + (ip || '未检测到（请检查 WiFi）'))

// ── 3. 防火墙 ──
let fwOk = false
try {
  const out = execSync('netsh advfirewall firewall show rule name="doge-code mobile"', {
    encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
  })
  fwOk = out.includes('doge-code mobile')
} catch {}
if (fwOk) {
  console.log('[3/4] 防火墙: 已放行')
} else {
  console.log('[3/4] 防火墙: 未放行')
  console.log('')
  console.log('      手机将连不上。请用【管理员】cmd 执行下面这行：')
  console.log('')
  console.log(`      netsh advfirewall firewall add rule name="doge-code mobile" dir=in action=allow protocol=TCP localport=${PORT} remoteip=192.168.0.0/24`)
  console.log('')
}

// ── 4. 端口 ──
const portBusy = await new Promise((resolve) => {
  const s = createConnection({ port: PORT, host: '127.0.0.1', timeout: 1500 })
  s.on('connect', () => { s.destroy(); resolve(true) })
  s.on('timeout', () => { s.destroy(); resolve(false) })
  s.on('error', () => resolve(false))
})
console.log('[4/4] 端口 ' + PORT + ': ' + (portBusy ? '占用中（可能有旧进程）' : '空闲'))

// ── 密钥 ──
const secret = process.env.CLAUDE_CODE_MOBILE_SECRET || DEFAULT_SECRET
if (!process.env.CLAUDE_CODE_MOBILE_SECRET) {
  console.log('')
  console.log('      未设置 CLAUDE_CODE_MOBILE_SECRET，使用默认密钥: ' + DEFAULT_SECRET)
  console.log('      注意：绑定 0.0.0.0 后，无密钥等于向整个局域网开放本机命令执行能力')
}

// ── 启动 ──
console.log('')
line()
console.log('  启动中…')
line()
console.log('')
console.log('  手机连接地址:  http://' + (ip || '<本机IP>') + ':' + PORT)
console.log('  密钥:          ' + secret)
console.log('')
console.log('  在 CLI 里输入:  /mobile-connect')
console.log('  然后用手机 App 扫码，或直接访问上面的地址')
console.log('')
line()
console.log('')

const child = spawn(EXE, [], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CLAUDE_CODE_MOBILE_BRIDGE: '1',
    CLAUDE_CODE_MOBILE_SECRET: secret,
  },
})

child.on('exit', (code) => {
  console.log('')
  console.log('doge.exe 已退出（code ' + code + '）')
  process.exit(code ?? 0)
})
