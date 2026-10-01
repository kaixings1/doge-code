#!/usr/bin/env node
/**
 * doge-code 手机端 — 一键启动脚本
 *
 * 用法: node scripts/start-mobile-bridge.mjs [--lan]
 *
 * 默认走 adb reverse（USB 通道）：手机访问 http://127.0.0.1:5680
 *   - 不需要管理员权限（不改防火墙）
 *   - 不需要手机与电脑同 WiFi
 *   - 不需要安装任何 App（手机浏览器即可）
 *   代价：手机须插着 USB 线
 *
 * 加 --lan 走局域网方案：手机访问 http://<电脑IP>:5680
 *   - 需要事先放行防火墙（管理员权限）
 *   - 需要手机与电脑同一 WiFi
 *   好处：不插线，可移动
 *
 * 两种模式的服务端完全相同，只是手机侧访问的地址不同。
 */
import { existsSync } from 'fs'
import { execSync, spawn } from 'child_process'
import { networkInterfaces } from 'os'
import { createConnection } from 'net'
import http from 'http'

const EXE = 'D:\\doge-code\\doge.exe'
const PORT = 5680
const DEFAULT_SECRET = 'doge2026'
const ADB = process.env.USERPROFILE + '\\Android\\platform-tools\\adb.exe'
const USE_LAN = process.argv.includes('--lan')

function line() { console.log('='.repeat(60)) }

function getLanIp() {
  // 优先取默认路由对应的本机地址（多网卡环境下只有它手机能连）
  try {
    const out = execSync('route print -4', { encoding: 'utf8', timeout: 5000, windowsHide: true })
    for (const raw of out.split(/\r?\n/)) {
      const l = raw.trim()
      if (!l.startsWith('0.0.0.0')) continue
      const p = l.split(/\s+/)
      if (p.length < 5 || p[2] === '0.0.0.0' || !p[3]) continue
      if (p[3].startsWith('169.254.') || p[3] === '127.0.0.1') continue
      return p[3]
    }
  } catch {}
  const ifs = networkInterfaces()
  for (const n of Object.keys(ifs)) {
    for (const i of ifs[n] || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) return i.address
    }
  }
  return null
}

line()
console.log('  doge-code 手机端桥接 — 启动')
console.log('  模式: ' + (USE_LAN ? '局域网 (--lan)' : 'USB 反向转发 (adb reverse)'))
line()
console.log('')

// ── 1. doge.exe ──
if (!existsSync(EXE)) {
  console.log('[错误] 未找到 ' + EXE)
  console.log('       请先运行 compile.bat 编译')
  process.exit(1)
}
console.log('[1/4] doge.exe 存在')

// ── 2. 连接方式 ──
let phoneUrl = null
if (USE_LAN) {
  const ip = getLanIp()
  console.log('[2/4] 局域网 IP: ' + (ip || '未检测到'))

  let fwOk = false
  try {
    const out = execSync('netsh advfirewall firewall show rule name="doge-code mobile"', {
      encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    })
    fwOk = out.includes('doge-code mobile')
  } catch {}
  if (fwOk) {
    console.log('      防火墙: 已放行')
  } else {
    console.log('      防火墙: 未放行 — 手机将连不上')
    console.log('')
    console.log('      用【管理员】cmd 执行下面这行（只需一次）:')
    console.log(`      netsh advfirewall firewall add rule name="doge-code mobile" dir=in action=allow protocol=TCP localport=${PORT} remoteip=192.168.0.0/24`)
    console.log('')
  }
  phoneUrl = ip ? `http://${ip}:${PORT}` : null
} else {
  // USB 反向转发
  if (!existsSync(ADB)) {
    // 无 adb 也可用：服务端自动启动，走局域网地址
    const fallback = getLanIp()
    console.log('[2/4] 未找到 adb — 回退到局域网地址')
    console.log('      如需 USB 通道，先安装 platform-tools')
    phoneUrl = fallback ? `http://${fallback}:${PORT}` : null
  } else {
    try {
      const dev = execSync(`"${ADB}" devices`, { encoding: 'utf8', timeout: 10000, windowsHide: true })
      const hasDevice = dev.split(/\r?\n/).some((l) => /\tdevice$/.test(l))
      if (!hasDevice) {
        // 手机没连：服务端仍会自动启动，只是不能走 USB 通道。
        // 回退到局域网地址，手机连同一 WiFi 即可访问。
        const fallback = getLanIp()
        console.log('[2/4] 未检测到手机 — 回退到局域网地址')
        if (fallback) {
          phoneUrl = `http://${fallback}:${PORT}`
          console.log('      手机需连同一 WiFi，并放行防火墙（见下方 --lan 提示）')
        } else {
          phoneUrl = null
        }
      } else {
        execSync(`"${ADB}" reverse tcp:${PORT} tcp:${PORT}`, { timeout: 10000, windowsHide: true })
        console.log('[2/4] USB 反向转发已建立 (手机 127.0.0.1:' + PORT + ' -> 电脑 ' + PORT + ')')
        phoneUrl = `http://127.0.0.1:${PORT}`
      }
    } catch (e) {
      console.log('[2/4] 建立反向转发失败: ' + String(e.message).slice(0, 100))
      phoneUrl = null
    }
  }
}

// ── 3. 端口 ──
const portBusy = await new Promise((resolve) => {
  const s = createConnection({ port: PORT, host: '127.0.0.1', timeout: 1500 })
  s.on('connect', () => { s.destroy(); resolve(true) })
  s.on('timeout', () => { s.destroy(); resolve(false) })
  s.on('error', () => resolve(false))
})
console.log('[3/4] 端口 ' + PORT + ': ' + (portBusy ? '占用中（可能有旧进程）' : '空闲'))

// ── 4. 密钥 ──
const secret = process.env.CLAUDE_CODE_MOBILE_SECRET || DEFAULT_SECRET
if (!process.env.CLAUDE_CODE_MOBILE_SECRET) {
  console.log('[4/4] 未设密钥，使用默认: ' + DEFAULT_SECRET)
  console.log('      注意：绑定 0.0.0.0 后，无密钥等于向局域网开放本机命令执行能力')
} else {
  console.log('[4/4] 密钥已设置')
}

// ── 启动 ──
console.log('')
line()
console.log('  启动中…')
line()
console.log('')
if (phoneUrl) {
  console.log('  手机浏览器打开:  ' + phoneUrl)
} else {
  console.log('  手机连接地址:    未就绪（见上方提示）')
}
console.log('  密钥:            ' + secret)
console.log('')
console.log('  服务端随 CLI 自动启动，无需手动执行 /mobile-connect')
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

// 轮询确认服务端真的就绪（自动启动是异步的），并回显一次访问地址，
// 便于确认"能连了"而不是凭启动输出猜测
if (phoneUrl) {
  const deadline = Date.now() + 20000
  const probe = async () => {
    while (Date.now() < deadline) {
      const ok = await new Promise((resolve) => {
        const req = http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 1500 }, (res) => {
          res.resume()
          resolve(res.statusCode === 200)
        })
        req.on('error', () => resolve(false))
        req.on('timeout', () => { req.destroy(); resolve(false) })
      })
      if (ok) {
        console.log('')
        console.log('  [就绪] 手机端服务端已启动 -> ' + phoneUrl)
        console.log('')
        return
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
    console.log('')
    console.log('  [未就绪] 20 秒内服务端未响应，请检查上方提示与 doge.exe 输出')
    console.log('')
  }
  void probe()
}

child.on('exit', (code) => {
  console.log('')
  console.log('doge.exe 已退出（code ' + code + '）')
  process.exit(code ?? 0)
})
