import * as React from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js'
import os from 'os'
import fs from 'fs'
import path from 'path'

// ==================== 持久化配置（模块级） ====================
interface TuiPersistentConfig {
  active: boolean
  mode: 'normal' | 'full'
  rows: number
  cols: number
  theme: string          // 主题名称，支持预设
  userThemeOverride: boolean  // 是否覆盖全局主题
  cursor: 'block' | 'underline' | 'bar'
  blink: boolean
  fontSize: number
  fontFamily: string
  layout: 'compact' | 'full'
  lastActivity: string
}

// 预设主题颜色（仅用于面板展示，实际主题色由 CSS 类控制）
const THEMES: Record<string, { bg: string; fg: string; accent: string }> = {
  dark: { bg: '#1e1e1e', fg: '#e5e5e5', accent: '#8b5cf6' },
  light: { bg: '#ffffff', fg: '#333333', accent: '#4f46e5' },
  'catppuccin-mocha': { bg: '#1e1e2e', fg: '#cdd6f4', accent: '#cba6f7' },
  dracula: { bg: '#282a36', fg: '#f8f8f2', accent: '#bd93f9' },
  'gruvbox-dark': { bg: '#282828', fg: '#ebdbb2', accent: '#fabd2f' },
  nord: { bg: '#2e3440', fg: '#d8dee9', accent: '#88c0d0' }
}

const defaultConfig: TuiPersistentConfig = {
  active: true,
  mode: 'normal',
  rows: 40,
  cols: 120,
  theme: 'dark',
  userThemeOverride: false,
  cursor: 'block',
  blink: true,
  fontSize: 14,
  fontFamily: 'Monaco, Menlo, Cascadia Mono, monospace',
  layout: 'full',
  lastActivity: new Date().toISOString()
}

let tuiConfig: TuiPersistentConfig = { ...defaultConfig }

// 配置更新辅助
function updateConfig(updates: Partial<TuiPersistentConfig>): TuiPersistentConfig {
  tuiConfig = { ...tuiConfig, ...updates, lastActivity: new Date().toISOString() }
  return tuiConfig
}

// 系统信息获取（复用增强版）
function getSystemInfo() {
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const memPercent = Math.round((usedMem / totalMem) * 100)
  const cpus = os.cpus()
  const loadAvg = os.loadavg()
  const uptime = os.uptime()
  const days = Math.floor(uptime / 86400)
  const hours = Math.floor((uptime % 86400) / 3600)
  const minutes = Math.floor((uptime % 3600) / 60)

  // CPU 每核心使用率（模拟）
  const cpuUsage = cpus.map(cpu => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0)
    const idle = cpu.times.idle
    return Math.round(((total - idle) / total) * 100)
  })

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: cpus.length,
    cpuModel: cpus[0]?.model || 'Unknown',
    cpuUsage,
    loadAvg: loadAvg.map(l => l.toFixed(2)).join(', '),
    uptime: `${days}d ${hours}h ${minutes}m`,
    memory: {
      total: Math.round(totalMem / 1024 / 1024),
      used: Math.round(usedMem / 1024 / 1024),
      free: Math.round(freeMem / 1024 / 1024),
      percent: memPercent
    },
    user: os.userInfo().username
  }
}

// 会话管理（文件存储）
const SESSION_DIR = path.join(os.homedir(), '.claude-tui-sessions')
function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })
}
function saveSession(name: string): boolean {
  try {
    ensureSessionDir()
    const data = JSON.stringify({
      rows: tuiConfig.rows,
      cols: tuiConfig.cols,
      theme: tuiConfig.theme,
      fontSize: tuiConfig.fontSize,
      fontFamily: tuiConfig.fontFamily,
      cursor: tuiConfig.cursor,
      blink: tuiConfig.blink,
      layout: tuiConfig.layout
    }, null, 2)
    fs.writeFileSync(path.join(SESSION_DIR, `${name}.json`), data)
    return true
  } catch (e) {
    return false
  }
}
function loadSession(name: string): Partial<TuiPersistentConfig> | null {
  try {
    const file = path.join(SESSION_DIR, `${name}.json`)
    if (!fs.existsSync(file)) return null
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    return data
  } catch {
    return null
  }
}
function listSessions(): string[] {
  try {
    ensureSessionDir()
    return fs.readdirSync(SESSION_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
  } catch {
    return []
  }
}

// 生成 ASCII 仪表盘（监控用）
function generateMonitorDashboard(systemInfo: ReturnType<typeof getSystemInfo>) {
  const cpuBar = (percent: number) => {
    const full = Math.round(percent / 5)
    return '█'.repeat(full) + '░'.repeat(20 - full)
  }
  const memBar = cpuBar(systemInfo.memory.percent)

  let dashboard = '📊 系统实时监控\n\n'
  dashboard += `CPU 总使用率：${systemInfo.cpuUsage.reduce((a, b) => a + b, 0) / systemInfo.cpus}% 平均\n`
  dashboard += `负载：${systemInfo.loadAvg}\n\n`
  dashboard += `内存：${systemInfo.memory.used}MB / ${systemInfo.memory.total}MB (${systemInfo.memory.percent}%)\n`
  dashboard += `[${memBar}] ${systemInfo.memory.percent}%\n\n`
  dashboard += `每核心负载：\n`
  systemInfo.cpuUsage.forEach((usage, i) => {
    dashboard += `  Core ${i.toString().padStart(2)}: [${cpuBar(usage)}] ${usage}%\n`
  })
  dashboard += `\n⏱️  运行时间：${systemInfo.uptime}\n`
  dashboard += `💡 提示：运行 /tui monitor --watch 可进入动态监控模式（需终端支持）`
  return dashboard
}

// 终端诊断
function runDoctor(): string[] {
  const results: string[] = ['🔍 TUI 环境诊断报告', '']
  // 颜色支持
  const colorDepth = process.env.COLORTERM || (process.env.TERM === 'xterm-256color' ? '256' : '16')
  results.push(`✓ 颜色深度：${colorDepth} (${parseInt(colorDepth) >= 256 ? '真彩色支持' : '基础支持'})`)
  // 全屏环境
  const fullscreen = isFullscreenEnvEnabled()
  results.push(`${fullscreen ? '✓' : '✗'} 全屏 alternate screen：${fullscreen ? '可用' : '不可用（需设置 CLAUDE_CODE_NO_FLICKER=1）'}`)
  // 鼠标支持（检测环境变量或终端类型）
  const mouseSupport = process.env.TERM_PROGRAM?.includes('Apple_Terminal') || process.env.TERM?.includes('xterm') || process.env.TERM?.includes('tmux')
  results.push(`${mouseSupport ? '✓' : '⚠️'} 鼠标支持：${mouseSupport ? '已检测到' : '未知（尝试启用）'}`)
  // 字体兼容
  results.push(`✓ 当前字体：${tuiConfig.fontFamily}`)
  // 配置状态
  results.push(`\n当前 TUI 配置：`)
  results.push(`  主题：${tuiConfig.theme} ${tuiConfig.userThemeOverride ? '(用户覆盖)' : '(自动同步全局)'}`)
  results.push(`  分辨率：${tuiConfig.cols}x${tuiConfig.rows}`)
  results.push(`  光标：${tuiConfig.cursor} ${tuiConfig.blink ? '闪烁' : '静态'}`)
  return results
}

// ==================== 主命令处理 ====================
export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parts = args.trim().split(/\s+/)
  const operation = parts[0]?.toLowerCase() || ''
  const arg = parts.slice(1).join(' ')
  const globalTheme = context.options.theme || 'dark'
  const isFullscreen = isFullscreenEnvEnabled()
  const systemInfo = getSystemInfo()

  // 主题自动同步（仅当用户未覆盖时）
  if (!tuiConfig.userThemeOverride && tuiConfig.theme !== globalTheme) {
    updateConfig({ theme: globalTheme })
  }

  // 辅助：系统消息
  const systemMessage = (lines: string[]) => lines.join('\n')

  switch (operation) {
    // start / on ──────────────────────────────────────
    case 'start':
    case 'on':
      updateConfig({ active: true, mode: 'full' })
      onDone(systemMessage([
        'TUI 模式已启用（闪烁免模式）',
        '',
        `当前状态：${isFullscreen ? '已激活' : '未激活'}`,
        `主题：${tuiConfig.theme} ${THEMES[tuiConfig.theme] ? `🎨 ${tuiConfig.theme}` : ''}`,
        `分辨率：${tuiConfig.cols}x${tuiConfig.rows}`,
        `字体：${tuiConfig.fontSize}px ${tuiConfig.fontFamily}`,
        `布局：${tuiConfig.layout}`,
        '',
        '功能特性：',
        `- 闪烁免模式：${isFullscreen ? '✓ 运行中' : '请设置 CLAUDE_CODE_NO_FLICKER=1 启用'}`,
        `- 全屏终端：${isFullscreen ? '✓ 可用' : '不可用'}`,
        `- 鼠标支持：${isFullscreen ? '✓ 已启用' : '不可用'}`,
        `- 光标样式：${tuiConfig.cursor} ${tuiConfig.blink ? '(闪烁)' : '(静态)'}`,
        '',
        '系统信息：',
        `  主机名：${systemInfo.hostname}`,
        `  操作系统：${systemInfo.platform} ${systemInfo.release} (${systemInfo.arch})`,
        `  CPU：${systemInfo.cpuModel} (${systemInfo.cpus} 核心)`,
        `  内存：${systemInfo.memory.used}MB / ${systemInfo.memory.total}MB (${systemInfo.memory.percent}%)`,
        '',
        '新功能：/tui theme, /tui monitor, /tui session, /tui doctor'
      ]), { display: 'system' })
      break

    // stop / off / exit ───────────────────────────────
    case 'stop':
    case 'off':
    case 'exit':
      updateConfig({ active: false })
      onDone(systemMessage([
        'TUI 模式已禁用',
        '已切换到普通终端模式。',
        '重新启用：/tui start'
      ]), { display: 'system' })
      break

    // status / info ───────────────────────────────────
    case 'status':
    case 'info': {
      const envValue = process.env.CLAUDE_CODE_NO_FLICKER || '未设置'
      onDone(systemMessage([
        'TUI 状态',
        '',
        `全屏环境：${isFullscreen ? '✓ 启用' : '✗ 未启用'}`,
        `TUI 活动：${tuiConfig.active ? '运行中' : '已停止'}`,
        `主题：${tuiConfig.theme}${tuiConfig.userThemeOverride ? ' (已锁定)' : ' (跟随全局)'}`,
        `分辨率：${tuiConfig.cols}x${tuiConfig.rows}`,
        `字体：${tuiConfig.fontSize}px`,
        `光标：${tuiConfig.cursor} ${tuiConfig.blink ? '闪烁' : '静态'}`,
        `布局：${tuiConfig.layout}`,
        '',
        `环境变量：CLAUDE_CODE_NO_FLICKER=${envValue}`,
        `系统负载：${systemInfo.loadAvg}`,
        `内存占用：${systemInfo.memory.percent}%`,
        '',
        '会话数：' + listSessions().length,
        '运行 /tui doctor 进行诊断'
      ]), { display: 'system' })
      break
    }

    // config 配置管理（增强：支持更多设置）─────────────
    case 'config': {
      if (arg) {
        const [setting, ...values] = arg.split(/\s+/)
        const value = values.join(' ')
        let resultMsg = ''
        switch (setting) {
          case 'theme':
            if (THEMES[value]) {
              updateConfig({ theme: value, userThemeOverride: true })
              resultMsg = `主题已更改为：${value}`
            } else {
              resultMsg = `未知主题：${value}，可用主题：${Object.keys(THEMES).join(', ')}`
            }
            break
          case 'fontsize':
            const size = parseInt(value)
            if (!isNaN(size) && size >= 8 && size <= 24) {
              updateConfig({ fontSize: size })
              resultMsg = `字体大小已更改为：${size}px`
            } else {
              resultMsg = '错误：字体大小须在 8-24 之间'
            }
            break
          case 'rows':
            const rows = parseInt(value)
            if (!isNaN(rows) && rows >= 20 && rows <= 200) {
              updateConfig({ rows })
              resultMsg = `行数已更改为：${rows}`
            } else {
              resultMsg = '错误：行数须在 20-200'
            }
            break
          case 'cols':
            const cols = parseInt(value)
            if (!isNaN(cols) && cols >= 20 && cols <= 200) {
              updateConfig({ cols })
              resultMsg = `列数已更改为：${cols}`
            } else {
              resultMsg = '错误：列数须在 20-200'
            }
            break
          case 'cursor':
            if (value === 'block' || value === 'underline' || value === 'bar') {
              updateConfig({ cursor: value })
              resultMsg = `光标样式已更改为：${value}`
            } else {
              resultMsg = '错误：光标样式须为 block, underline 或 bar'
            }
            break
          case 'blink':
            if (value === 'true' || value === 'false') {
              updateConfig({ blink: value === 'true' })
              resultMsg = `光标闪烁已${value === 'true' ? '启用' : '禁用'}`
            } else {
              resultMsg = '错误：blink 须为 true 或 false'
            }
            break
          case 'layout':
            if (value === 'compact' || value === 'full') {
              updateConfig({ layout: value })
              resultMsg = `布局模式已更改为：${value}`
            } else {
              resultMsg = '错误：layout 须为 compact 或 full'
            }
            break
          default:
            resultMsg = `未知配置项：${setting}\n可用：theme, fontsize, rows, cols, cursor, blink, layout`
        }
        onDone(resultMsg, { display: 'system' })
      } else {
        // 显示当前配置
        onDone(systemMessage([
          'TUI 配置',
          `主题：${tuiConfig.theme} ${tuiConfig.userThemeOverride ? '(手动锁定)' : '(自动同步)'}`,
          `分辨率：${tuiConfig.cols}x${tuiConfig.rows}`,
          `字体：${tuiConfig.fontSize}px ${tuiConfig.fontFamily}`,
          `光标：${tuiConfig.cursor} ${tuiConfig.blink ? '闪烁' : '静态'}`,
          `布局：${tuiConfig.layout}`,
          `全屏环境：${isFullscreen ? '可用' : '不可用'}`,
          '',
          '修改示例：/tui config theme dracula'
        ]), { display: 'system' })
      }
      break
    }

    // theme 快捷切换（新增）──────────────────────────
    case 'theme': {
      const themeName = arg.trim()
      if (!themeName) {
        onDone(`当前主题：${tuiConfig.theme}\n可用主题：${Object.keys(THEMES).join(', ')}\n使用 /tui theme <name> 切换`, { display: 'system' })
      } else if (THEMES[themeName]) {
        updateConfig({ theme: themeName, userThemeOverride: true })
        onDone(`主题已切换为：${themeName} 🎨`, { display: 'system' })
      } else {
        onDone(`未知主题：${themeName}\n可用主题：${Object.keys(THEMES).join(', ')}`, { display: 'system' })
      }
      break
    }

    // monitor 监控面板（新增）────────────────────────
    case 'monitor': {
      const dashboard = generateMonitorDashboard(systemInfo)
      onDone(dashboard, { display: 'system' })
      break
    }

    // session 会话管理（新增）────────────────────────
    case 'session': {
      const subcmd = parts[1]?.toLowerCase()
      const sessionName = parts[2]
      if (subcmd === 'save' && sessionName) {
        if (saveSession(sessionName)) {
          onDone(`✅ 会话已保存：${sessionName}`, { display: 'system' })
        } else {
          onDone(`❌ 保存失败，请检查权限`, { display: 'system' })
        }
      } else if (subcmd === 'load' && sessionName) {
        const saved = loadSession(sessionName)
        if (saved) {
          updateConfig(saved)
          onDone(`✅ 已加载会话：${sessionName}\n当前配置：主题=${tuiConfig.theme}, ${tuiConfig.cols}x${tuiConfig.rows}`, { display: 'system' })
        } else {
          onDone(`❌ 会话不存在：${sessionName}`, { display: 'system' })
        }
      } else if (subcmd === 'list') {
        const sessions = listSessions()
        if (sessions.length) {
          onDone(`📁 已保存的会话：\n${sessions.map(s => `  - ${s}`).join('\n')}`, { display: 'system' })
        } else {
          onDone(`暂无会话，使用 /tui session save <name> 创建`, { display: 'system' })
        }
      } else {
        onDone(`用法：/tui session save|load|list [name]`, { display: 'system' })
      }
      break
    }

    // doctor 诊断（新增）────────────────────────────
    case 'doctor': {
      const report = runDoctor()
      onDone(report.join('\n'), { display: 'system' })
      break
    }

    // shortcuts 快捷键帮助（新增）────────────────────
    case 'shortcuts': {
      onDone(systemMessage([
        '⌨️ TUI 常用快捷键',
        '',
        'Ctrl+C   – 中断当前任务',
        'Ctrl+L   – 清屏',
        'Ctrl+U   – 删除光标前所有字符',
        'Ctrl+W   – 删除前一个单词',
        'Ctrl+R   – 历史命令搜索',
        '↑ / ↓    – 浏览命令历史',
        'Tab      – 自动补全',
        'Shift+鼠标滚轮 – 水平滚动',
        '',
        '更多请参考终端文档'
      ]), { display: 'system' })
      break
    }

    // clear ──────────────────────────────────────────
    case 'clear':
      onDone('\x1b[2J\x1b[H', { display: 'system' })  // 发送清屏转义序列
      break

    // sysinfo 详细系统信息（JSX 面板）────────────────
    case 'sysinfo':
      return (
        <div style={{ padding: '1rem' }}>
          <h2>📋 系统详细信息</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr><td><strong>主机名</strong></td><td>{systemInfo.hostname}</td></tr>
              <tr><td><strong>操作系统</strong></td><td>{systemInfo.platform} {systemInfo.release}</td></tr>
              <tr><td><strong>架构</strong></td><td>{systemInfo.arch}</td></tr>
              <tr><td><strong>CPU</strong></td><td>{systemInfo.cpuModel} ({systemInfo.cpus} 核心)</td></tr>
              <tr><td><strong>平均负载</strong></td><td>{systemInfo.loadAvg}</td></tr>
              <tr><td><strong>运行时间</strong></td><td>{systemInfo.uptime}</td></tr>
              <tr><td><strong>内存总量</strong></td><td>{systemInfo.memory.total} MB</td></tr>
              <tr><td><strong>已用内存</strong></td><td>{systemInfo.memory.used} MB ({systemInfo.memory.percent}%)</td></tr>
              <tr><td><strong>空闲内存</strong></td><td>{systemInfo.memory.free} MB</td></tr>
              <tr><td><strong>当前用户</strong></td><td>{systemInfo.user}</td></tr>
            </tbody>
          </table>
        </div>
      )

    // help 帮助面板（JSX）───────────────────────────
    case 'help':
      return (
        <div style={{ padding: '1rem' }}>
          <h2>/tui 命令参考</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem 1rem' }}>
            <span style={{ color: '#8b5cf6' }}>/tui start</span><span>启用 TUI 模式</span>
            <span style={{ color: '#8b5cf6' }}>/tui stop</span><span>禁用 TUI 模式</span>
            <span style={{ color: '#8b5cf6' }}>/tui status</span><span>显示状态与系统概要</span>
            <span style={{ color: '#8b5cf6' }}>/tui config [key] [value]</span><span>配置主题/字体/行列等</span>
            <span style={{ color: '#8b5cf6' }}>/tui theme &lt;name&gt;</span><span>快速切换主题（6种预设）</span>
            <span style={{ color: '#8b5cf6' }}>/tui monitor</span><span>系统实时监控仪表盘</span>
            <span style={{ color: '#8b5cf6' }}>/tui session save/load/list</span><span>配置会话持久化</span>
            <span style={{ color: '#8b5cf6' }}>/tui doctor</span><span>终端环境诊断</span>
            <span style={{ color: '#8b5cf6' }}>/tui shortcuts</span><span>快捷键列表</span>
            <span style={{ color: '#8b5cf6' }}>/tui sysinfo</span><span>详细系统信息面板</span>
            <span style={{ color: '#8b5cf6' }}>/tui clear</span><span>清屏</span>
            <span style={{ color: '#8b5cf6' }}>/tui help</span><span>显示本帮助</span>
          </div>
          <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#252525', borderRadius: '0.5rem' }}>
            💡 提示：主题预设包含 catppuccin-mocha, dracula, gruvbox-dark, nord 等
          </div>
        </div>
      )

    // 默认（无参数或未知命令）—— 信息面板 ─────────────────
    default: {
      const isUnknown = operation !== '' && !['start','on','stop','off','exit','status','info','config','theme','monitor','session','doctor','shortcuts','clear','sysinfo','help'].includes(operation)
      const themeColors = THEMES[tuiConfig.theme] || THEMES.dark
      return (
        <div style={{
          padding: '1rem',
          fontFamily: tuiConfig.fontFamily,
          fontSize: `${tuiConfig.fontSize}px`,
          color: themeColors.fg,
          backgroundColor: themeColors.bg,
          border: `1px solid ${themeColors.accent}`,
          borderRadius: '0.5rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>🎮 TUI 模式</h2>
            <span style={{ background: isFullscreen ? '#16a34a' : '#6b7280', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', color: 'white' }}>
              {isFullscreen ? '闪烁免模式' : '普通模式'}
            </span>
          </div>
          {isUnknown && <div style={{ color: '#f97316', marginBottom: '0.5rem' }}>⚠️ 未知命令：{operation}<br/>输入 /tui help 查看帮助</div>}
          <div><strong>状态：</strong> {tuiConfig.active ? (isFullscreen ? '全屏运行中' : '运行中') : '已停止'}</div>
          <div><strong>主题：</strong> {tuiConfig.theme} {tuiConfig.userThemeOverride && '🔒'}</div>
          <div><strong>分辨率：</strong> {tuiConfig.cols}x{tuiConfig.rows}</div>
          <div><strong>字体：</strong> {tuiConfig.fontSize}px</div>
          <div><strong>光标：</strong> {tuiConfig.cursor} {tuiConfig.blink ? '闪烁' : ''}</div>
          {tuiConfig.layout === 'full' && (
            <>
              <div><strong>系统：</strong> {systemInfo.hostname} | {systemInfo.cpus}核 | 内存 {systemInfo.memory.percent}%</div>
              <div><strong>负载：</strong> {systemInfo.loadAvg}</div>
            </>
          )}
          <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#252525', borderRadius: '0.5rem' }}>
            💡 新功能：/tui theme dracula, /tui monitor, /tui session save myconfig
          </div>
        </div>
      )
    }
  }
  return null
}

export default {
  name: 'tui',
  type: 'local-jsx',
  description: 'TUI 模式 - 闪烁免终端，支持主题/监控/会话/诊断',
  call: call
}