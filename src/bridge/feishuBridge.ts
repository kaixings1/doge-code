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

import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { ReplBridgeHandle } from './replBridge.js'
import type { MobileRequest, MobileResponse } from './mobileProtocol.js'
import { FeishuBridge, setFeishuBridge, getFeishuBridge } from '../services/feishu/index.js'
import { isFeishuBridgeEnabled } from './bridgeEnabled.js'
import { getFeishuAppId, getFeishuAppSecret, getFeishuWebhookPort } from './bridgeConfig.js'
import { logForDebugging } from '../utils/debug.js'

let feishuBridgeInstance: FeishuBridge | null = null

export function isFeishuBridgeAvailable(): boolean {
  return isFeishuBridgeEnabled()
}

export async function startFeishuBridge(bridgeHandle: ReplBridgeHandle | null): Promise<FeishuBridge | null> {
  if (!isFeishuBridgeAvailable()) {
    return null
  }

  const appId = getFeishuAppId()
  const appSecret = getFeishuAppSecret()

  if (!appId || !appSecret) {
    return null
  }

  if (feishuBridgeInstance) {
    return feishuBridgeInstance
  }

  try {
    feishuBridgeInstance = new FeishuBridge({
      appId,
      appSecret,
      port: getFeishuWebhookPort(),
      bridgeHandle,
      onInboundMessage: (msg: SDKMessage) => {
        feishuBridgeInstance?.handleSdkMessage(msg)
      },
    })

    await feishuBridgeInstance.init()
    setFeishuBridge(feishuBridgeInstance)
    logForDebugging('[feishu] 飞书桥接已启动', { level: 'debug' })
    return feishuBridgeInstance
  } catch (err) {
    logForDebugging(`[feishu] 启动失败: ${err}`, { level: 'error' })
    return null
  }
}

export async function stopFeishuBridge(): Promise<void> {
  if (feishuBridgeInstance) {
    await feishuBridgeInstance.shutdown()
    feishuBridgeInstance = null
    setFeishuBridge(null)
  }
}

export function getFeishuBridgeInstance(): FeishuBridge | null {
  return getFeishuBridge()
}
