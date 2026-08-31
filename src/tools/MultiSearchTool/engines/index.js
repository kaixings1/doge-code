import * as duckduckgo from './duckduckgo.js';
import * as baidu from './baidu.js';
import * as bing from './bing.js';
const modules = [duckduckgo, baidu, bing];
const engines = modules.map((mod) => ({
    name: mod.name,
    displayName: mod.displayName,
    needsKey: mod.needsKey,
    envKey: mod.envKey,
    isAvailable: mod.isAvailable,
    search: mod.search,
}));
export default engines;
export function getAvailableEngines() {
    return engines.filter((e) => e.isAvailable());
}
export function getEngine(name) {
    return engines.find((e) => e.name === name);
}
