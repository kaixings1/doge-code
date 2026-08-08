/**
 * feishuBridge.ts — 飞书桥接适配器
 *
 * 连接 FeishuBridge 与现有的 Bridge 系统。
 * 复用 MobileRequest/MobileResponse 协议。
 *
 * 环境变量：
 * - FEISHU_BRIDGE=1           启用
 * - FEISHU_APP_ID            飞书应用 ID
 * - FEISHU_APP_SECRET        飞书应用密钥
 * - FEISHU_WEBHOOK_PORT      Webhook 端口（默认 9901）
 * - FEISHU_WEBHOOK_URL       公网 Webhook URL（可选）
 */

import type { ReplBridgeHandle } from './replBridge.js'
import type { MobileRequest, MobileResponse } from './mobileProtocol.js'
import { FeishuBridge, setFeishuBridge, getFeishuBridge } from '../services/feishu/index.js'
import { isFeishuBridgeEnabled, getFeishuAppId, getFeishuAppSecret, getFeishuWebhookPort } from './bridgeConfig.js'
import { logForDebugging } from '../utils/debug.js'

let feishuBridgeInstance: FeishuBridge | null = null

/**
 * 检查飞书桥接是否可用
 */
export function isFeishuBridgeAvailable(): boolean {
  return isFeishuBridgeEnabled()
}

/**
 * 启动飞书桥接
 */
export async function startFeishuBridge(bridgeHandle: ReplBridgeHandle | null): Promise<FeishuBridge | null> {
  if (!isFeishuBridgeAvailable()) {
    logForDebugging('[feishu] 飞书桥接未启用（缺少 FEISHU_BRIDGE=1 或凭证）', { level: 'debug' })
    return null
  }

  const appId = getFeishuAppId()
  const appSecret = getFeishuAppSecret()

  if (!appId || !appSecret) {
    logForDebugging('[feishu] 缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET', { level: 'debug' })
    return null
  }

  try {
    feishuBridgeInstance = new FeishuBridge({
      appId,
      appSecret,
      port: getFeishuWebhookPort(),
      bridgeHandle,
      onResponse: async (response: MobileResponse) => {
        // 处理来自 Bridge 的响应，转发到飞书
        // 每个会话的响应由 FeishuBridge 内部处理
      },
    })

    await feishuBridgeInstance.init()
    setFeishuBridge(feishuBridgeInstance)

    logForDebugging('[feishu] 飞书桥接已启动', { level: 'debug' })
    console.log('✅ 飞书远程控制已连接')
    return feishuBridgeInstance
  } catch (err) {
    logForDebugging(`[feishu] 启动失败: ${err}`, { level: 'error' })
    console.error('❌ 飞书远程控制启动失败:', err)
    return null
  }
}

/**
 * 停止飞书桥接
 */
export async function stopFeishuBridge(): Promise<void> {
  if (feishuBridgeInstance) {
    await feishuBridgeInstance.shutdown()
    feishuBridgeInstance = null
    setFeishuBridge(null)
    logForDebugging('[feishu] 飞书桥接已停止', { level: 'debug' })
  }
}

/**
 * 获取飞书桥接实例
 */
export function getFeishuBridgeInstance(): FeishuBridge | null {
  return getFeishuBridge()
}
