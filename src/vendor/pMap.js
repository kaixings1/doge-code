/**
 * 精简版 p-map 替代实现
 * 只保留项目中使用的并发控制功能
 */
export async function pMap(iterable, mapper, options) {
    const concurrency = options?.concurrency ?? Number.POSITIVE_INFINITY;
    if (typeof mapper !== 'function') {
        throw new TypeError('Mapper function is required');
    }
    const result = [];
    let currentIndex = 0;
    const iterator = Symbol.iterator in iterable
        ? iterable[Symbol.iterator]()
        : iterable[Symbol.asyncIterator]();
    const next = async () => {
        const item = await iterator.next();
        if (item.done)
            return false;
        const index = currentIndex++;
        result[index] = await mapper(item.value, index);
        return true;
    };
    // 并发执行
    const runners = [];
    for (let i = 0; i < concurrency; i++) {
        runners.push((async () => {
            while (await next()) {
                /* continue */
            }
        })());
    }
    await Promise.all(runners);
    return result;
}
export default pMap;
