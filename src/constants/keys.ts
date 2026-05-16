import { isEnvTruthy } from '../utils/envUtils.js'

// 延迟读取以便全局设置中的 ENABLE_GROWTHBOOK_DEV（在模块加载后应用）被拾取。
// USER_TYPE 是构建时定义，因此是安全的。
export function getGrowthBookClientKey(): string {
  return process.env.USER_TYPE === 'ant'
    ? isEnvTruthy(process.env.ENABLE_GROWTHBOOK_DEV)
      ? 'sdk-yZQvlplybuXjYh6L'
      : 'sdk-xRVcrliHIlrg4og4'
    : 'sdk-zAZezfDKGoZuXXKe'
}
