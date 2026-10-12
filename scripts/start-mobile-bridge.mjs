#!/usr/bin/env node
/**
 * doge-code 手机端 — 一键启动脚本
 *
 * 用法: node scripts/start-mobile-bridge.mjs [--lan] [--usb] [--tunnel]
 *
 * **默认走局域网**：手机访问 http://<电脑IP>:6000
 *   - 不插线、可移动
 *   - 手机 App 的「会话页 → 扫描」能**自动发现**本机网段里的实例
 *   - 需要放行防火墙（脚本会检测并给出确切命令）
 *   - 需要手机与电脑同一 WiFi
 *
 * 加 --usb 走 USB 反向转发：手机访问 http://127.0.0.1:6000
 *   - 不需要管理员权限（不改防火墙）、不需要同一 WiFi
 *   - 代价：手机须一直插着 USB 线，且本机须跑过 adb reverse
 *
 * 加 --tunnel 走 cloudflared 公网隧道（户外可用）：
 *   - 手机访问 wss://<随机子域>.trycloudflare.com/mobile/ws
 *   - 不需要同一 WiFi、不需要 USB，**户外/数据流量也能连回本机**
 *   - 依赖 cloudflared（无需账号），未安装时自动回退局域网
 *
 * 三种模式的服务端完全相同，只是手机侧访问的地址不同。
 */
import { existsSync, rmSync, writeFileSync } from 'fs'
import { execSync, spawn } from 'child_process'
import { networkInterfaces, tmpdir } from 'os'
import { join } from 'path'
import { createConnection } from 'net'
import http from 'http'

/**
 * 隧道地址的「约定文件」路径（**按端口分**）。
 *
 * 快隧道的子域**每次启动都变**，手机端无法预知。服务端广播时读此文件，
 * 把当前地址塞进 beacon 的 `tunnelUrl` 字段 → 手机在同一 WiFi 收到广播
 * 即自动记住，出门切流量也能用。
 *
 * ## 为什么按端口分文件
 *
 * 多个 CLI 实例各占一个端口、各起一条隧道。若共用一个文件，后起的实例
 * 会覆盖先起的地址 → 所有实例广播同一个 `tunnelUrl` → 手机看到多个会话
 * 却全指向同一地址，切换无效。按端口命名后各写各的。
 *
 * **两端必须用同一路径**：脚本（本文件）写，服务端（mobileBridge.ts）读。
 * 用 `os.tmpdir()` 而非项目目录 —— 换工作目录时路径仍稳定。
 * 服务端侧同样的拼法见 `src/bridge/tunnelUrlFile.ts`。
 */
function tunnelUrlFileFor(port) {
  return join(tmpdir(), `doge-tunnel-url-${port}.json`)
}

/** 把隧道地址写入约定文件（尽力而为，失败静默）。 */
function writeTunnelUrlFile(httpsUrl) {
  try {
    writeFileSync(
      tunnelUrlFileFor(PORT),
      JSON.stringify({ url: httpsUrl, at: Date.now() }),
      'utf8',
    )
  } catch {
    // 写失败只是自动下发失效，不影响隧道；不打扰用户
  }
}

/**
 * 删除隧道地址约定文件。
 *
 * 非隧道模式（LAN/USB）或隧道建立失败时**必须**调用：否则服务端会
 * 继续广播上一次成功隧道留下的**陈旧地址**，手机自动存下后连不上，
 * 且现象隐蔽（地址看着像真的）。
 *
 * 同时清理旧的单文件路径：老版本写的是 `doge-tunnel-url.json`，
 * 新服务端不传端口时仍会读它 —— 不清掉会让「已停隧道」的实例继续广播
 * 旧地址。
 */
function clearTunnelUrlFile() {
  try {
    rmSync(tunnelUrlFileFor(PORT), { force: true })
    rmSync(join(tmpdir(), 'doge-tunnel-url.json'), { force: true })
  } catch {
    // 删不掉也无害：readTunnelUrl 有 12 小时超期兜底
  }
}

const EXE = 'D:\\doge-code\\doge.exe'
// 桥接端口：与服务端共用同一环境变量 CLAUDE_CODE_MOBILE_PORT。
// 默认 6000（与 mobile.bat / 主进程一致，避开 Windows 保留端口段 5680-5880）。
// 此前硬编码 5680，导致「主进程在 6000、脚本却按 5680 建隧道」的错位，
// 手机永远连不上。读取同一变量即可对齐；未设时回落 6000。
const PORT = Number(process.env.CLAUDE_CODE_MOBILE_PORT) || 6000
// 刻意不提供默认密钥：绑 0.0.0.0 时用公开常量"D保护"本机命令执行能力，
// 局域网内任何人可控制本机。未设密钥即空密钥，服务端不做认证。
const ADB = process.env.USERPROFILE + '\\Android\\platform-tools\\adb.exe'
const ARGV = process.argv.slice(2)
const USE_USB = ARGV.includes('--usb')
const USE_TUNNEL = ARGV.includes('--tunnel')
const USE_LAN = !USE_USB && !USE_TUNNEL

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
console.log('  模式: ' + (USE_TUNNEL ? '公网隧道（--tunnel，户外可用）' : USE_USB ? 'USB 反向转发 (--usb)' : '局域网（默认，免插线）'))
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
if (USE_TUNNEL) {
  const tunnel = await startCloudflareTunnel(PORT)
  if (tunnel) {
    phoneUrl = tunnel
    console.log('[2/4] 公网隧道已建立 -> ' + tunnel)
  } else {
    // 隧道失败（未装 cloudflared / 起不来）：自动回退局域网，不让用户卡死。
    clearTunnelUrlFile() // 清掉旧隧道地址，别让手机广播里收到失效地址
    const ip = getLanIp()
    console.log('[2/4] 隧道不可用，回退到局域网地址')
    phoneUrl = ip ? `http://${ip}:${PORT}` : null
  }
} else if (USE_LAN) {
  // 非隧道模式：清掉可能残留的隧道地址文件（见 clearTunnelUrlFile）。
  clearTunnelUrlFile()
  const ip = getLanIp()
  console.log('[2/4] 局域网 IP: ' + (ip || '未检测到'))

  // 按**实际**本机 IP 推导网段，而不是写死 192.168.0.0/24。
  const subnet = ip ? ip.split('.').slice(0, 3).join('.') + '.0/24' : null

  let fwOk = false
  try {
    const out = execSync('netsh advfirewall firewall show rule name="doge-code mobile"', {
      encoding: 'utf8', timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    })
    fwOk = out.includes('doge-code mobile')
  } catch {}
  if (fwOk) {
    console.log('      防火墙: 已放行')
  } else if (!subnet) {
    console.log('      防火墙: 未放行，且未检测到局域网 IP — 无法自动生成规则')
  } else {
    const cmd =
      `netsh advfirewall firewall add rule name="doge-code mobile" ` +
      `dir=in action=allow protocol=TCP localport=${PORT} remoteip=${subnet}`
    let added = false
    try {
      execSync(cmd, { encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      added = true
    } catch {}
    if (added) {
      console.log(`      防火墙: 已自动放行（仅允许 ${subnet} 访问 ${PORT}）`)
    } else {
      console.log('      防火墙: 未放行 — 手机将连不上')
      console.log('')
      console.log('      脚本没有管理员权限，请用【管理员】cmd 执行下面这行（只需一次）:')
      console.log('      ' + cmd)
      console.log('')
    }
  }
  phoneUrl = ip ? `http://${ip}:${PORT}` : null
} else {
  // USB 反向转发：非隧道模式，同样清掉残留隧道地址文件。
  clearTunnelUrlFile()
  if (!existsSync(ADB)) {
    const fallback = getLanIp()
    console.log('[2/4] 未找到 adb — 回退到局域网地址')
    console.log('      如需 USB 通道，先安装 platform-tools')
    phoneUrl = fallback ? `http://${fallback}:${PORT}` : null
  } else {
    try {
      const dev = execSync(`"${ADB}" devices`, { encoding: 'utf8', timeout: 10000, windowsHide: true })
      const hasDevice = dev.split(/\r?\n/).some((l) => /\tdevice$/.test(l))
      if (!hasDevice) {
        const fallback = getLanIp()
        console.log('[2/4] 未检测到手机 — 回退到局域网地址')
        phoneUrl = fallback ? `http://${fallback}:${PORT}` : null
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
const secret = process.env.CLAUDE_CODE_MOBILE_SECRET || ''
if (!secret) {
  console.log('[4/4] 未设密钥 —— 服务端将不做任何认证')
  console.log('      绑定 0.0.0.0 且无密钥 = 局域网内任何设备均可控制本机。')
  console.log('      仅可在完全可信的网络下这样用；否则请先设置：')
  console.log('        set CLAUDE_CODE_MOBILE_SECRET=<你的密钥>')
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
  const isTunnel = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.test(phoneUrl)
  if (USE_TUNNEL && isTunnel) {
    const wssUrl = 'wss://' + phoneUrl.replace(/^https?:\/\//, '') + '/mobile/ws'
    console.log('  手机 App「设置 → 工作模式 → 互联网连本机（隧道）」')
    console.log('  在连接框填入这个地址（户外、任意网络都能连回本机）:')
    console.log('')
    console.log('    ' + wssUrl)
    console.log('')
    console.log('  （多数终端可直接 Ctrl+点击 复制；隧道为 Cloudflare 随机子域，')
    console.log('   每次启动都会变，手机端需重新填。）')
  } else if (USE_TUNNEL) {
    console.log('  ⚠ 公网隧道未建立，已回退到局域网地址（**户外不可用**）。')
    console.log('    手机须与电脑连同一 WiFi，连接框填:')
    console.log('')
    console.log('    ' + phoneUrl)
  } else {
    console.log('  手机 App「会话页」点扫描即可自动发现本实例 —— 不必手输地址。')
    console.log('  若需手填，地址是:  ' + phoneUrl)
  }
} else {
  console.log('  手机连接地址:    未就绪（见上方提示）')
}
console.log('  密钥:            ' + (secret || '（空 — 服务端不做认证）'))
console.log('')
console.log('  服务端随 CLI 自动启动，无需手动执行 /mobile-connect')
console.log('')
line()
console.log('')

// 先探测端口是否**已有桥接服务在跑**（例如用户正开着的 doge-code 主进程
// 自带 mobile bridge，或上一次启动未退干净）。
//   · 已有 → **复用**，绝不再 spawn 第二个 doge.exe：否则两实例抢端口，
//     新实例会被迫顺延（6000→6001），而隧道仍指向 6000，手机连不上。
//   · 没有 → 才自己 spawn 一个，让脚本可独立使用。
const serviceReady = await new Promise((resolve) => {
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/', timeout: 1500 }, (res) => {
    res.resume()
    resolve(res.statusCode === 200)
  })
  req.on('error', () => resolve(false))
  req.on('timeout', () => { req.destroy(); resolve(false) })
})

let child = null
if (serviceReady) {
  console.log('[启动] 端口 ' + PORT + ' 已有桥接服务在跑 —— 复用，不再另起进程')
  console.log('       （这通常是你的 doge-code 主进程自带的 mobile bridge）')
} else {
  child = spawn(EXE, [], {
    stdio: 'inherit',
    env: {
      ...process.env,
      CLAUDE_CODE_MOBILE_BRIDGE: '1',
      CLAUDE_CODE_MOBILE_SECRET: secret,
      // 显式注入端口：保证子进程监听的端口 == 脚本建隧道/探测用的 PORT。
      CLAUDE_CODE_MOBILE_PORT: String(PORT),
    },
  })
}

// 轮询确认服务端真的就绪，并回显一次访问地址
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

// 仅在「本脚本自己 spawn 了 doge.exe」时才监听其退出。
child?.on('exit', (code) => {
  console.log('')
  console.log('doge.exe 已退出（code ' + code + '）')
  process.exit(code ?? 0)
})

// ============================================================================
// cloudflared 公网隧道（TUNNEL 模式后端）
// ============================================================================

/**
 * 启动 Cloudflare 快隧道，把本机 HTTP 服务暴露到公网随机子域。
 *
 * 解析策略：cloudflared 启动后会往 stdout 打印
 *   `INF ... your quick Tunnel is available at: https://xxxx.trycloudflare.com`
 * 用正则抓这一行。超时（25 秒）未拿到域名即视为失败，返回 null，由调用方
 * 回退到局域网地址，绝不让用户卡在「隧道起不来」上。
 */
async function startCloudflareTunnel(localPort) {
  // 解析 cloudflared：先试 PATH，失败则回退探测已知固定位置（本机实测装在
  // AppData\Roaming\9router\bin，但该目录常不在 PATH）。
  const candidates = [
    'cloudflared',
    process.env.APPDATA ? `${process.env.APPDATA}\\9router\\bin\\cloudflared.exe` : null,
    process.env.USERPROFILE ? `${process.env.USERPROFILE}\\.cloudflared\\cloudflared.exe` : null,
  ].filter(Boolean)

  let cf = null
  for (const cand of candidates) {
    try {
      execSync(`"${cand}" --version`, {
        encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      })
      cf = cand
      break
    } catch {}
  }

  if (!cf) {
    console.log('[2/4] 未检测到 cloudflared —— 无法建立公网隧道。')
    console.log('')
    console.log('      请先安装 Cloudflare 快隧道（无需账号）:')
    console.log('        winget install Cloudflare.cloudflared')
    console.log('        或下载 cloudflared.exe 放入 PATH')
    console.log('')
    console.log('      装好重跑:  node scripts/start-mobile-bridge.mjs --tunnel')
    console.log('')
    return null
  }
  if (cf !== 'cloudflared') {
    console.log('[2/4] 已定位 cloudflared: ' + cf)
  }

  console.log('[2/4] 正在建立公网隧道（cloudflared quick tunnel）…')
  return new Promise((resolve) => {
    let proc = null
    let settled = false
    let timer = null
    const finish = (v) => {
      if (settled) return
      settled = true
      // 关键：清掉超时计时器。否则成功拿到地址 25 秒后，计时器仍会触发
      // 「未拿到地址」的误报并 kill 掉正在服务的隧道进程。
      if (timer) { clearTimeout(timer); timer = null }
      resolve(v)
    }

    try {
      proc = spawn(cf, ['tunnel', '--url', `http://127.0.0.1:${localPort}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (e) {
      console.log('[2/4] 启动 cloudflared 失败: ' + String(e.message).slice(0, 120))
      return finish(null)
    }

    const onData = (buf) => {
      const text = buf.toString()
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi)
      if (m) {
        proc.stdout.off('data', onData)
        proc.stderr.off('data', onData)
        // 把隧道地址写到约定文件，供服务端广播（beacon.tunnelUrl）——
        // 手机在同一 WiFi 收到广播即可自动记住此地址，出门直接用。
        // 写失败不影响隧道本身（只是自动下发失效），故吞掉异常。
        writeTunnelUrlFile(m[0])
        finish(m[0])
      }
    }
    proc.stdout.on('data', onData)
    proc.stderr.on('data', onData)

    proc.on('error', (e) => {
      console.log('[2/4] cloudflared 进程错误: ' + String(e.message).slice(0, 120))
      finish(null)
    })
    proc.on('exit', (code) => {
      if (code !== 0 && !settled) {
        console.log('[2/4] cloudflared 异常退出（code ' + code + '），隧道不可用。')
        finish(null)
      }
    })

    // 超时兜底：25 秒内没拿到域名就放弃。这是**唯一** kill cloudflared 的路径。
    timer = setTimeout(() => {
      if (settled) return
      console.log('[2/4] 25 秒内未拿到隧道地址，放弃公网隧道。')
      if (proc && !proc.killed) try { proc.kill() } catch {}
      finish(null)
    }, 25000)
  })
}
