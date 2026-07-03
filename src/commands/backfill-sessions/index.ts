// Backfill sessions - retrieve and restore historical session data
import type { Command, LocalCommandCall } from ' ../../types/command.js '
import fs from 'fs'
import path from 'path'

interface SessionMeta {
 id?: string
 title?: string
 createdAt?: string | number
 updatedAt?: string | number
 model?: string
 tags?: string[]
}

interface SessionInfo {
 name: string
 meta: SessionMeta
 isValid: boolean
 hasMessages: boolean
 sizeBytes: number
}

const call: LocalCommandCall = async (args: string, context) => {
 const _ctx = context || {}
 const action = (args || '').trim().toLowerCase()

 if (action === 'help' || action === '') {
 return { type: 'text' as const, value: [
 '💾 会话回填工具', '', '用法:',
 ' /backfill-sessions list',
 ' /backfill-sessions stats',
 ' /backfill-sessions search <keyword>',
 ' /backfill-sessions find-empty',
 ' /backfill-sessions cleanup',
 ].join(\n) }
 }
 if (action === 'list' || action === 'ls') return listSessions()
 if (action === 'stats' || action === 'st') return showStats()
 if (action.startsWith('search ')) {
 const kw = action.replace(/^search\s+/,'').trim()
 return searchSessions(kw)
 }
 if (action === 'find-empty' || action === 'empty') return findEmptySessions()
 if (action === 'cleanup' || action === 'clean') return cleanupSessions()
 return { type: 'text' as const, value: 'Unknown action.' }
}
function getDogeDir(): string {
 return path.join(process.env.HOME || process.env.USERPROFILE || '.', '.doge')
}

function scanSessionsDir(): SessionInfo[] {
 const sd = path.join(getDogeDir(), 'sessions')
 const res: SessionInfo[] = []
 if (!fs.existsSync(sd)) return res
 try {
 const entries = fs.readdirSync(sd, { withFileTypes: true })
 for (const e of entries) {
 if (!e.isDirectory()) continue
 const dp = path.join(sd, e.name)
 let meta: SessionMeta = {}
 let valid = false
 let hasMsg = false
 let sz = 0
 try {
 const mp = path.join(dp, 'meta.json')
 if (fs.existsSync(mp)) {
 const raw = fs.readFileSync(mp, 'utf-8')
 meta = JSON.parse(raw) as SessionMeta
 valid = !!(meta && meta.id)
 sz += Buffer.byteLength(raw, 'utf-8')
 }
 } catch { valid = false }
 try {
 const msp = path.join(dp, 'messages.json')
 if (fs.existsSync(msp)) {
 const mr = fs.readFileSync(msp, 'utf-8')
 hasMsg = mr.length > 0
 sz += Buffer.byteLength(mr, 'utf-8')
 }
 } catch { hasMsg = false }
 try {
 const ff = fs.readdirSync(dp)
 for (const fi of ff) {
 const fp = path.join(dp, fi)
 try { if (fs.statSync(fp).isFile()) sz += fs.statSync(fp).size } catch {}
 }
 } catch {}
 res.push({ name: e.name, meta, isValid: valid, hasMessages: hasMsg, sizeBytes: sz })
 }
 } catch {}
 return res
}

function fmtSize(b: number): string {
 if (b < 1024) return `${b} B`
 if (b < 1048576) return `${(b/1024).toFixed(1)} KB`
 return `${(b/1048576).toFixed(1)} MB`
}

function fmtDate(v: string | number | undefined): string {
 if (!v) return '未知'
 try {
 const d = new Date(typeof v === 'number' ? v : parseInt(v))
 if (isNaN(d.getTime())) return typeof v === 'string' ? v : '未知'
 return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
 } catch { return typeof v === 'string' ? v : '未知' }
}
function listSessions(): ReturnType<typeof call> {
 const ss = scanSessionsDir()
 if (ss.length === 0) return { type: 'text' as const, value: '未找到任何会话目录。' }
 const ls: string[] = [
 `${📂 会话列表 ('${ss.length} 个会话)}`,
 '',
 `${ '${名称}.padEnd(36) '${有效}.padEnd(6) '${消息}.padEnd(8) '${大小}.padEnd(8) '${标题}}`,
 `${ '${-}.repeat(36) '${-}.repeat(6) '${-}.repeat(8) '${-}.repeat(8) '${-}.repeat(30)}`,
 ]
 for (const s of ss) {
 const t = s.meta.title || '(无标题)'
 const mc = s.hasMessages ? '有' : '无'
 ls.push(`${ '${s.name.padEnd(36) '${(s.isValid ? '✹' : '❌').padEnd(6) '${mc.padEnd(8) '${fmtSize(s.sizeBytes).padEnd(8) '${t.substring(0, 30)}}`)
 }
 ls.push('')
 ls.push(`${总计: '${ss.length} 个会话, '${fmtSize(ss.reduce((a,s)=>a+s.sizeBytes,0))}`)
 return { type: 'text' as const, value: ls.join(\n) }
}
function showStats(): ReturnType<typeof call> {
 const ss = scanSessionsDir()
 if (ss.length === 0) return { type: 'text' as const, value: '未找到任何会话目录。' }
 const vc = ss.filter(s => s.isValid).length
 const ec = ss.filter(s => !s.meta.title).length
 const ts = ss.reduce((a, s) => a + s.sizeBytes, 0)
 const ms = new Set(ss.map(s => s.meta.model).filter(Boolean))
 const gr: Record<string, number> = {}
 for (const s of ss) {
 const p = s.name.charAt(0).toUpperCase()
 gr[p] = (gr[p] || 0) + 1
 }
 const sg = Object.entries(gr).sort((a, b) => a[0].localeCompare(b[0]))
 return {
 type: 'text' as const,
 value: [
 '📊 会话统计', '',
 `${ 总会话数: '${ss.length}`,
 `${ 有效会话: '${vc}`,
 `${ 无效/损坏: '${ss.length - vc}`,
 `${ 无标题会话: '${ec}`,
 `${ 总占用空间: '${fmtSize(ts)}`,
 `${ 使用模型: '${ms.size > 0 ? Array.from(ms).join(', ') : '未知}`,
 '', ' 按首字母分布:',
 ...sg.map(([l, c]) => `${ '${l}: '${c} 个}`),
 ].join(\n),
 }
}
function searchSessions(keyword: string): ReturnType<typeof call> {
 if (!keyword) return { type: 'text' as const, value: '请提供搜索关键词。\n用法: /backfill-sessions search <关键词>' }
 const ss = scanSessionsDir()
 const rs: SessionInfo[] = []
 const kw = keyword.toLowerCase()
 for (const s of ss) {
 const t = (s.meta.title || ).toLowerCase()
 const id = (s.meta.id || ).toLowerCase()
 const tg = (s.meta.tags || []).join(' ').toLowerCase()
 if (t.includes(kw) || id.includes(kw) || tg.includes(kw) || s.name.toLowerCase().includes(kw)) {
 rs.push(s)
 }
 }
 if (rs.length === 0) return { type: 'text' as const, value: `${未找到包含 '${keyword} 的会话。}' }
 const ls = [`${🔍 搜索结果: '${keyword} ('${rs.length} 个匹配)}`, '']
 for (const r of rs) {
 const t = r.meta.title || '(无标题)'
 const dt = fmtDate(r.meta.updatedAt)
 ls.push(`${ '${r.name} — '${t} ('${dt})}`)
 }
 return { type: 'text' as const, value: ls.join(\n) }
}
function findEmptySessions(): ReturnType<typeof call> {
 const ss = scanSessionsDir()
 const em = ss.filter(s => !s.meta.title || s.meta.title.trim() === '')
 if (em.length === 0) return { type: 'text' as const, value: '所有会话都有标题，无需清理。' }
 const ls = [`${📭 无标题会话 ('${em.length} 个)}`, '', ' 建议使用 /compact 重新命名这些会话。', '']
 for (const e of em) ls.push(`${ - '${e.name}`)
 return { type: 'text' as const, value: ls.join(\n) }
}

function cleanupSessions(): ReturnType<typeof call> {
 const ss = scanSessionsDir()
 const iv = ss.filter(s => !s.isValid)
 if (iv.length === 0) return { type: 'text' as const, value: '所有会话元数据都有效，无需清理。' }
 const ls = [`${🧹 清理报告}`, '', `${ 发现 '${iv.length} 个无效/损坏的会话元数据:}`, '']
 for (const v of iv) ls.push(`${ - '${v.name} (缺少有效 ID)}`)
 ls.push('', ' 建议: 手动检查这些会话目录，确认是否可以安全删除。')
 ls.push(' 注意: 为避免数据丢失，本命令不会自动删除任何文件。')
 return { type: 'text' as const, value: ls.join(\n) }
}

const backfillSessions = {
 type: 'local',
 name: 'backfill-sessions',
 description: '扫描并恢复历史会话数据到当前工作区',
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
} satisfies Command

export default backfillSessions
