import type { LocalJSXCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

interface WatchEvent { type: string; file: string; time: string }

// 系统关键目录黑名单 - 防止误监听系统目录
const BLACKLISTED_DIRS = new Set([
	process.env.HOMEDRIVE || 'C:',
	process.env.WINDIR || 'C:/Windows',
	process.env.PROGRAMFILES || 'C:/Program Files',
])

// 判断路径是否在黑名单中
function isPathBlacklisted(dir: string): { blocked: boolean; reason: string } {
	const resolved = path.resolve(dir)
	for (const blocked of BLACKLISTED_DIRS) {
		if (resolved.startsWith(blocked)) {
			return { blocked: true, reason: `禁止监听系统关键目录: ${blocked}` }
		}
	}
	return { blocked: false, reason: '' }
}

class FileWatcherService {
	private watcher: any = null
	private watching: string[] = []
	private events: WatchEvent[] = []
	private maxEvents: number = 1000 // 增加事件保留数量

	constructor(maxEvents?: number) {
		if (maxEvents) this.maxEvents = maxEvents
	}

	// 验证并解析监听路径
	private resolveAndValidate(dir: string, cwd: string): string | null {
		// 检查是否为相对路径，如果是则基于 cwd 解析
		const resolved = path.resolve(cwd, dir)

		// 检查目录是否存在
		try {
			const stats = fs.statSync(resolved)
			if (!stats.isDirectory()) {
				console.error(`不是目录: ${resolved}`)
				return null
			}
		} catch (e) {
			console.error(`目录不存在或无法访问: ${resolved}`)
			return null
		}

		// 检查黑名单
		const blacklistCheck = isPathBlacklisted(resolved)
		if (blacklistCheck.blocked) {
			console.error(blacklistCheck.reason)
			return null
		}

		return resolved
	}

	start(dir: string, cwd: string = process.cwd()): boolean {
		// 验证路径
		const resolvedDir = this.resolveAndValidate(dir, cwd)
		if (!resolvedDir) {
			return false
		}

		// 检查是否已经在监听
		if (this.watching.includes(resolvedDir)) {
			console.log(`已经在监听: ${resolvedDir}`)
			return false
		}

		if (this.watcher) {
			console.log('File watcher already running')
			return false
		}

		try {
			this.watcher = fs.watch(resolvedDir, { recursive: true }, (eventType, filename) => {
				if (filename) {
					const event: WatchEvent = {
						type: eventType,
						file: filename,
						time: new Date().toISOString()
					}
					this.events.push(event)
					console.log(`[FileWatcher] ${eventType}: ${filename}`)
					if (this.events.length > this.maxEvents) {
						this.events = this.events.slice(-this.maxEvents)
					}
				}
			})
			this.watching.push(resolvedDir)
			console.log(`Started watching: ${resolvedDir}`)
			return true
		} catch (error) {
			console.error('Failed to start file watcher:', error)
			return false
		}
	}

	stop(dir?: string): void {
		if (this.watcher) {
			this.watcher.close()
			this.watcher = null
			this.watching = []
			console.log('File watcher stopped')
		} else if (dir) {
			const idx = this.watching.indexOf(dir)
			if (idx >= 0) {
				this.watching.splice(idx, 1)
				console.log(`Removed from watch list: ${dir}`)
			}
		}
	}

	getStatus(): any {
		return {
			running: !!this.watcher,
			watching: this.watching,
			eventCount: this.events.length,
			maxEvents: this.maxEvents,
			recent: this.events.slice(-10)
		}
	}

	getHistory(limit: number = 20): WatchEvent[] {
		if (limit <= 0 || limit > this.maxEvents) {
			return []
		}
		return this.events.slice(-limit).reverse()
	}

	clearEvents(): number {
		const count = this.events.length
		this.events = []
		return count
	}

	// 获取按文件类型统计的事件
	getStatsByType(): Record<string, number> {
		const stats: Record<string, number> = {}
		for (const event of this.events) {
			stats[event.type] = (stats[event.type] || 0) + 1
		}
		return stats
	}
}

const fileWatcher = new FileWatcherService()

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
	const appState = context?.getAppState?.() || {}
	const cwd = appState.cwd || process.cwd()
	const parts = args?.trim().split(/\s+/) || []
	const command = parts[0]?.toLowerCase() || 'status'

	if (command === 'help' || command === '') {
		return { type: 'jsx', render: () => [
			'📂 文件监听器', '',
			'监控指定目录的文件变化，实时检测编辑和保存操作。', '',
			'📖 用法: ',
			' /file-watcher              — 查看当前监听状态',
			' /file-watcher watch <dir>  — 开始监听目录',
			' /file-watcher unwatch      — 停止所有监听',
			' /file-watcher list         — 列出监听的目录',
			' /file-watcher events [n]   — 查看最近 n 个事件（默认 20）',
			' /file-watcher clear-events — 清空事件日志',
			' /file-watcher stats        — 查看事件统计', '',
			'注意:',
			' • 监听目录必须先存在',
			' • 不支持监听系统关键目录（如 C:/Windows）',
		].join('\n') }
	}

	if (command === 'watch' && parts.length > 1) {
		const watchDir = parts[1]
		const success = fileWatcher.start(watchDir, cwd)
		return { type: 'jsx', render: () => success
			? `开始监听目录: '${path.resolve(cwd, watchDir)}'`
			: `监听失败，请检查目录是否存在且不在黑名单中。` }
	}

	if (command === 'unwatch') {
		fileWatcher.stop()
		return { type: 'jsx', render: () => '⏹️ 已停止所有文件监听。' }
	}

	if (command === 'list') {
		const status = fileWatcher.getStatus()
		if (status.watching.length === 0) {
			return { type: 'jsx', render: () => '当前没有监听任何目录。使用 /file-watcher watch <目录> 开始监听。' }
		}
		return { type: 'jsx', render: () => `正在监听 ${status.watching.length} 个目录:\n` + status.watching.map(d => `- ${d}`).join('\n') }
	}

	if (command === 'events') {
		const limit = parts[1] ? Math.max(1, Math.min(parseInt(parts[1]) || 20, 1000)) : 20
		const history = fileWatcher.getHistory(limit)
		if (history.length === 0) {
			return { type: 'jsx', render: () => '当前没有文件变化事件记录。' }
		}
		return { type: 'jsx', render: () => `最近 ${history.length} 个事件:\n` + history.map(e => `[${e.time}] ${e.type}: ${e.file}`).join('\n') }
	}

	if (command === 'clear-events') {
		const count = fileWatcher.clearEvents()
		return { type: 'jsx', render: () => `事件日志已清空（共 ${count} 条）。` }
	}

	if (command === 'stats') {
		const stats = fileWatcher.getStatus()
		const typeStats = fileWatcher.getStatsByType()
		const typeInfo = Object.entries(typeStats).map(([k, v]) => `${k}: ${v}`).join('\n')
		return { type: 'jsx', render: () => `📊 事件统计:\n- 正在监听: ${stats.watching.length} 个目录\n- 总事件数: ${stats.eventCount}\n- 最大保留: ${stats.maxEvents}\n\n事件类型分布:\n${typeInfo || '暂无数据'}` }
	}

	return { type: 'jsx', render: () => '文件监听器状态：未运行。使用 /file-watcher help 查看帮助。' }
}

