import { getGlobalConfig } from '../utils/config.js';
import { EYES, HATS, RARITIES, RARITY_WEIGHTS, SPECIES, STAT_NAMES, } from './types.js';
// Mulberry32 —— 小型种子伪随机数生成器，用于选择鸭子足够
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashString(s) {
    if (typeof Bun !== 'undefined') {
        return Number(BigInt(Bun.hash(s)) & 0xffffffffn);
    }
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
}
function rollRarity(rng) {
    const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
    let roll = rng() * total;
    for (const rarity of RARITIES) {
        roll -= RARITY_WEIGHTS[rarity];
        if (roll < 0)
            return rarity;
    }
    return 'common';
}
const RARITY_FLOOR = {
    common: 5,
    uncommon: 15,
    rare: 25,
    epic: 35,
    legendary: 50,
};
// 一个峰值属性，一个低谷属性，其余散布。稀有度提升基础值。
function rollStats(rng, rarity) {
    // 所有属性最大值设为 100
    const stats = {};
    for (const name of STAT_NAMES) {
        stats[name] = 100;
    }
    return stats;
}
const SALT = 'friend-2026-401';
function rollFrom(rng) {
    const rarity = rollRarity(rng);
    const bones = {
        rarity,
        species: pick(rng, SPECIES),
        eye: pick(rng, EYES),
        hat: rarity === 'legendary' ? 'crown' : rarity === 'common' ? 'none' : pick(rng, HATS),
        shiny: rng() < 0.01,
        stats: rollStats(rng, rarity),
    };
    return { bones, inspirationSeed: Math.floor(rng() * 1e9) };
}
// 从三个热路径调用（500ms 精灵帧、每次按键的 PromptInput,
// per-turn observer) with the same userId → cache the deterministic result.
let rollCache;
export function roll(userId) {
    const key = userId + SALT;
    if (rollCache?.key === key)
        return rollCache.value;
    const value = rollFrom(mulberry32(hashString(key)));
    rollCache = { key, value };
    return value;
}
export function rollWithSeed(seed) {
    return rollFrom(mulberry32(hashString(seed)));
}
export function generateSeed() {
    return `rehatch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export function companionUserId() {
    const config = getGlobalConfig();
    return config.oauthAccount?.accountUuid ?? config.userID ?? 'anon';
}
// 从种子或 userId 重新生成骨骼，与存储的灵魂合并。
export function getCompanion() {
    const stored = getGlobalConfig().companion;
    if (!stored)
        return undefined;
    const seed = stored.seed ?? companionUserId();
    const { bones } = rollWithSeed(seed);
    // 强制传说级别，带王冠 + 满属性
    bones.rarity = 'legendary';
    bones.hat = 'crown';
    for (const key in bones.stats) {
        bones.stats[key] = 100;
    }
    // bones last so stale bones fields in old-format configs get overridden
    return { ...stored, ...bones };
}
//# sourceMappingURL=companion.js.map