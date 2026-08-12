/**
 * 精简版 p-map 替代实现
 * 只保留项目中使用的并发控制功能
 */
export async function pMap<T, R>(
  iterable: Iterable<T> | AsyncIterable<T>,
  mapper: (element: T, index: number) => R | Promise<R>,
  options?: { concurrency?: number },
): Promise<R[]> {
  const concurrency = options?.concurrency ?? Number.POSITIVE_INFINITY
  if (typeof mapper !== 'function') {
    throw new TypeError('Mapper function is required')
  }
  const result: R[] = []
  let currentIndex = 0
  const iterator =
    Symbol.iterator in iterable
      ? (iterable as Iterable<T>)[Symbol.iterator]()
      : (iterable as AsyncIterable<T>)[Symbol.asyncIterator]()

  const next = async (): Promise<boolean> => {
    const item = await (iterator as AsyncIterator<T>).next()
    if (item.done) return false
    const index = currentIndex++
    result[index] = await mapper(item.value, index)
    return true
  }

  // 并发执行
  const runners: Promise<void>[] = []
  for (let i = 0; i < concurrency; i++) {
    runners.push(
      (async () => {
        while (await next()) {
          /* continue */
        }
      })(),
    )
  }
  await Promise.all(runners)
  return result
}

export default pMap
