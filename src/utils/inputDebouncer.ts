/**
 * 输入防抖器：防止用户在短时间内重复提交相同内容
 *
 * 对应 OpenClaw inbound-debounce.ts：保护主查询循环免受
 * rapid-fire 输入（连击、重复粘贴、端口抖动）的影响
 */

export type DebounceConfig = {
	readonly windowMs: number  // 窗口期（毫秒），默认 1500ms
	readonly maxDupes: number  // 最大同内容重复计数，超过后仍放行
}

export type DebounceResult = {
	readonly dropped: boolean    // true = 被防抖丢弃，false = 放行
	readonly dupesSkipped: number  // 跳过的重复次数（若放行）
}

const DEFAULT_CONFIG: DebounceConfig = { windowMs: 1500, maxDupes: 3 }
let lastFingerprint = ''
let lastSeenAt = 0
let repeatCount = 0

export function resetDebounce(): void {
	lastFingerprint = ''
	lastSeenAt = 0
	repeatCount = 0
}

export function checkInputDebounce(
	input: string,
	config: DebounceConfig = DEFAULT_CONFIG,
): DebounceResult {
	if (typeof input !== 'string' || input.trim() === '') {
		return { dropped: false, dupesSkipped: 0 }
	}

	const now = Date.now()
	const normalized = input.trim()

	if (now - lastSeenAt > config.windowMs || normalized !== lastFingerprint) {
		lastFingerprint = normalized
		lastSeenAt = now
		repeatCount = 1
		return { dropped: false, dupesSkipped: 0 }
	}

	repeatCount++
	const dupesSkipped = repeatCount - 1
	const shouldDrop = repeatCount > config.maxDupes
	return { dropped: shouldDrop, dupesSkipped }
}

export function snapshotDebounceState() {
	return { fingerprint: lastFingerprint, count: repeatCount }
}
