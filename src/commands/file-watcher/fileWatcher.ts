import type { LocalJSXCommandCall } from '../../types/command.js'
import fs from 'fs'
import path from 'path'

interface WatchEvent { type: string; file: string; time: string }

class FileWatcherService {
	private watcher: any = null
	private watching: string[] = []
	private events: WatchEvent[] = []

	start(dir: string): void {
		if (this.watcher) {
			console.log('File watcher already running')
			return
		}
		try {
			this.watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
				if (filename) {
					const event: WatchEvent = {
						type: eventType,
						file: filename,
						time: new Date().toISOString()
					}
					this.events.push(event)
					console.log(`[FileWatcher] ${eventType}: ${filename}`)
					if (this.events.length > 100) {
						this.events = this.events.slice(-100)
					}
				}
			})
			this.watching = [dir]
			console.log(`Started watching: ${dir}`)
		} catch (error) {
			console.error('Failed to start file watcher:', error)
		}
	}

	stop(): void {
		if (this.watcher) {
			this.watcher.close()
			this.watcher = null
			this.watching = []
			console.log('File watcher stopped')
		}
	}

	getStatus(): any {
		return {
			running: !!this.watcher,
			watching: this.watching,
			eventCount: this.events.length,
			recent: this.events.slice(-10)
		}
	}

	getHistory(limit: number = 20): WatchEvent[] {
		return this.events.slice(-limit).reverse()
	}

	clearEvents(): number {
		const count = this.events.length
		this.events = []
		return count
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
			'监控指定目录的文件变化，实时检测编辑和保存操作。',
			'用法:',
			' /file-watcher — 查看当前监听状态',
			' /file-watcher watch <dir> — 开始监听目录',
			' /file-watcher unwatch <dir> — 停止监听',
			' /file-watcher list — 列出监听的目录',
			' /file-watcher events — 查看最近事件',
			' /file-watcher clear-events — 清空事件日志',
		].join('\n') }
	}

	if (command === 'watch' && parts.length > 1) {
		const watchDir = path.resolve(cwd, parts[1])
		fileWatcher.start(watchDir)
		return { type: 'jsx', render: () => `开始监听目录: '${watchDir}'` }
	}

	if (command === 'unwatch' && parts.length > 1) {
		const watchDir = parts[1]
		fileWatcher.stop()
		return { type: 'jsx', render: () => `停止监听: '${watchDir}'` }
	}

	if (command === 'list') {
		const status = fileWatcher.getStatus()
		if (status.watching.length === 0) {
			return { type: 'jsx', render: () => '当前没有监听任何目录。使用 /file-watcher watch <目录> 开始监听。' }
		}
		return { type: 'jsx', render: () => `正在监听: ${status.watching.join(', ')}` }
	}

	if (command === 'events') {
		const history = fileWatcher.getHistory()
		if (history.length === 0) {
			return { type: 'jsx', render: () => '当前没有文件变化事件记录。' }
		}
		return { type: 'jsx', render: () => history.map(e => `[${e.time}] ${e.type}: ${e.file}`).join('\n') }
	}

	if (command === 'clear-events') {
		const count = fileWatcher.clearEvents()
		return { type: 'jsx', render: () => `事件日志已清空（共 ${count} 条）。` }
	}

	return { type: 'jsx', render: () => '文件监听器状态：未运行。使用 /file-watcher help 查看帮助。' }
}

export default {
	type: 'local-jsx',
	name: 'file-watcher',
	description: '监控目录文件变化，实时检测编辑和保存操作',
	supportsNonInteractive: true,
	load: () => Promise.resolve({ call }),
}
