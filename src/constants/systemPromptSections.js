import { clearBetaHeaderLatches, clearSystemPromptSectionState, getSystemPromptSectionCache, setSystemPromptSectionCacheEntry, } from '../bootstrap/state.js';
/**
 * 创建记忆化的系统提示片段。
 * 计算一次，缓存至 /clear 或 /compact。
 */
export function systemPromptSection(name, compute) {
    return { name, compute, cacheBreak: false };
}
/**
 * 创建每次轮次重新计算的易变系统提示片段。
 * 当值变化时，这会破坏提示缓存。
 * 需要提供解释为何必须破坏缓存的理由。
 */
export function DANGEROUS_uncachedSystemPromptSection(name, compute, _reason) {
    return { name, compute, cacheBreak: true };
}
/**
 * 解析所有系统提示片段，返回提示字符串。
 */
export async function resolveSystemPromptSections(sections) {
    const cache = getSystemPromptSectionCache();
    return Promise.all(sections.map(async (s) => {
        if (!s.cacheBreak && cache.has(s.name)) {
            return cache.get(s.name) ?? null;
        }
        const value = await s.compute();
        setSystemPromptSectionCacheEntry(s.name, value);
        return value;
    }));
}
/**
 * 清除所有系统提示片段状态。在 /clear 和 /compact 时调用。
 * 同时重置 beta 头部锁存器，以便新对话对
 * AFK/快速模式/缓存编辑头部进行全新评估。
 */
export function clearSystemPromptSections() {
    clearSystemPromptSectionState();
    clearBetaHeaderLatches();
}
//# sourceMappingURL=systemPromptSections.js.map