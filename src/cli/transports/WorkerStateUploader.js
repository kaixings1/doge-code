import { sleep } from '../../utils/sleep.js';
export class WorkerStateUploader {
    constructor(config) {
        this.inflight = null;
        this.pending = null;
        this.closed = false;
        this.config = config;
    }
    /**
     * 将补丁排队到 PUT /worker。与任何现有的待处理补丁合并。
     * 即发即弃 — 调用者无需等待。
     */
    enqueue(patch) {
        if (this.closed)
            return;
        this.pending = this.pending ? coalescePatches(this.pending, patch) : patch;
        void this.drain();
    }
    close() {
        this.closed = true;
        this.pending = null;
    }
    async drain() {
        if (this.inflight || this.closed)
            return;
        if (!this.pending)
            return;
        const payload = this.pending;
        this.pending = null;
        this.inflight = this.sendWithRetry(payload).then(() => {
            this.inflight = null;
            if (this.pending && !this.closed) {
                void this.drain();
            }
        });
    }
    /** 使用指数退避无限重试，直到成功或 close()。 */
    async sendWithRetry(payload) {
        let current = payload;
        let failures = 0;
        while (!this.closed) {
            const ok = await this.config.send(current);
            if (ok)
                return;
            failures++;
            await sleep(this.retryDelay(failures));
            // Absorb any patches that arrived during the retry
            if (this.pending && !this.closed) {
                current = coalescePatches(current, this.pending);
                this.pending = null;
            }
        }
    }
    retryDelay(failures) {
        const exponential = Math.min(this.config.baseDelayMs * 2 ** (failures - 1), this.config.maxDelayMs);
        const jitter = Math.random() * this.config.jitterMs;
        return exponential + jitter;
    }
}
/**
 * 合并两个用于 PUT /worker 的补丁。
 *
 * 顶级键：overlay 替换 base（后值获胜）。
 * 元数据键（external_metadata, internal_metadata）：RFC 7396 合并
 * 深度一层 — overlay 的键被添加/覆盖，null 值保留用于服务端删除。
 */
function coalescePatches(base, overlay) {
    const merged = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        if ((key === 'external_metadata' || key === 'internal_metadata') &&
            merged[key] &&
            typeof merged[key] === 'object' &&
            typeof value === 'object' &&
            value !== null) {
            // RFC 7396 合并 — overlay 的键获胜，null 保留供服务端使用
            merged[key] = {
                ...merged[key],
                ...value,
            };
        }
        else {
            merged[key] = value;
        }
    }
    return merged;
}
