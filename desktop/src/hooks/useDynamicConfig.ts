import React from 'react'
import { getDynamicConfig_BLOCKS_ON_INIT } from '../services/analytics/growthbook.js'

/**
 * React hook，用于动态配置值。
 * 初始返回默认值，获取到配置后更新。
 */
export function useDynamicConfig<T>(configName: string, defaultValue: T): T {
  const [configValue, setConfigValue] = React.useState<T>(defaultValue)

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      // 防止测试中使用此 hook 时挂起
      return
    }
    void getDynamicConfig_BLOCKS_ON_INIT<T>(configName, defaultValue).then(
      setConfigValue,
    )
  }, [configName, defaultValue])

  return configValue
}
