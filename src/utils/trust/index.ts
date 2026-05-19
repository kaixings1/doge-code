import { getGlobalConfig, saveGlobalConfig } from '../config.js'
import { checkHasTrustDialogAccepted } from '../config.js'

/**
 * 检查当前目录是否被用户信任
 * 
 * @returns 目录是否可信
 */
export async function isDirectoryTrusted(): Promise<boolean> {
  // 首先检查是否已接受信任对话框
  if (!checkHasTrustDialogAccepted()) {
    return false
  }

  // 检查当前目录是否在可信目录列表中
  const config = getGlobalConfig()
  const cwd = process.cwd()
  
  // 如果没有可信目录配置，默认为可信（向后兼容）
  if (!config.trustedDirectories) {
    return true
  }

  // 检查当前目录是否在可信目录列表中
  const isTrusted = config.trustedDirectories.some((dir: string) => {
    // 支持相对路径和绝对路径匹配
    const normalizedDir = dir.replace(/\\/g, '/')
    const normalizedCwd = cwd.replace(/\\/g, '/')
    return normalizedCwd === normalizedDir || normalizedCwd.startsWith(normalizedDir + '/')
  })

  return isTrusted
}

/**
 * 添加目录到可信目录列表
 * 
 * @param directory - 要添加的目录路径
 * @returns 是否添加成功
 */
export async function addTrustedDirectory(directory: string): Promise<boolean> {
  try {
    const config = getGlobalConfig()
    
    if (!config.trustedDirectories) {
      config.trustedDirectories = []
    }
    
    // 避免重复添加
    if (!config.trustedDirectories.includes(directory)) {
      config.trustedDirectories.push(directory)
      await saveGlobalConfig(config)
    }
    
    return true
  } catch (error) {
    console.error('添加可信目录失败:', error)
    return false
  }
}

/**
 * 从可信目录列表中移除目录
 * 
 * @param directory - 要移除的目录路径
 * @returns 是否移除成功
 */
export async function removeTrustedDirectory(directory: string): Promise<boolean> {
  try {
    const config = getGlobalConfig()
    
    if (config.trustedDirectories) {
      config.trustedDirectories = config.trustedDirectories.filter(
        (dir: string) => dir !== directory
      )
      await saveGlobalConfig(config)
    }
    
    return true
  } catch (error) {
    console.error('移除可信目录失败:', error)
    return false
  }
}

/**
 * 获取所有可信目录
 */
export function getTrustedDirectories(): string[] {
  const config = getGlobalConfig()
  return config.trustedDirectories || []
}
