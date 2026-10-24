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
import {
  getFeishuAppId,
  getFeishuAppSecret,
  getFeishuBotOpenId,
  getFeishuEncryptKey,
  getFeishuVerificationToken,
  getFeishuWebhookPort,
} from './bridgeConfig.js'
import { logForDebugging } from '../utils/debug.js'
import {
  FeishuLongConnection,
  isFeishuLongConnectionMode,
} from '../services/feishu/feishuLongConnection.js'

let feishuBridgeInstance: FeishuBridge | null = null
let longConnection: FeishuLongConnection | null = null

/** 长连接实例（未启用时为 null），供 `/feishu` 命令展示配对码与绑定状态。 */
export function getFeishuLongConnection(): FeishuLongConnection | null {
  return longConnection
}

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
      verificationToken: getFeishuVerificationToken(),
      encryptKey: getFeishuEncryptKey(),
      bridgeHandle,
      onInboundMessage: (msg: SDKMessage) => {
        feishuBridgeInstance?.handleSdkMessage(msg)
      },
    })

    if (isFeishuLongConnectionMode()) {
      // 长连接模式：不监听本地端口，由 WSClient 主动连飞书。
      // 消息入口统一转给 FeishuBridge.handleLongConnectionMessage，
      // 与 webhook 走同一条 enqueue → 回复链路。
      feishuBridgeInstance.attachLongConnection()
      longConnection = new FeishuLongConnection({
        appId,
        appSecret,
        onText: async input => {
          await feishuBridgeInstance?.handleLongConnectionMessage(input)
        },
        onStateChange: (state, detail) => {
          logForDebugging(
            `[feishu:ws] 连接状态=${state}${detail ? ` (${detail})` : ''}`,
            { level: state === 'failed' ? 'error' : 'debug' },
          )
        },
      })
      await longConnection.start()
      setFeishuBridge(feishuBridgeInstance)
      logForDebugging(
        `[feishu] 长连接已启动｜配对码 ${longConnection.getPairingCode()}｜` +
          `已绑定 chat=${longConnection.getBindings().length}`,
        { level: 'debug' },
      )
      return feishuBridgeInstance
    }

    await feishuBridgeInstance.init()
    setFeishuBridge(feishuBridgeInstance)
    logForDebugging(
      `[feishu] 飞书桥接已启动 port=${getFeishuWebhookPort()} ` +
        `token=${getFeishuVerificationToken() ? '已配置' : '未配置'} ` +
        `encrypt=${getFeishuEncryptKey() ? '已配置' : '未配置'} ` +
        `botOpenId=${getFeishuBotOpenId() ? '已配置' : '未配置'}`,
      { level: 'debug' },
    )
    return feishuBridgeInstance
  } catch (err) {
    logForDebugging(`[feishu] 启动失败: ${err}`, { level: 'error' })
    return null
  }
}

export async function stopFeishuBridge(): Promise<void> {
  if (longConnection) {
    await longConnection.stop()
    longConnection = null
  }
  if (feishuBridgeInstance) {
    await feishuBridgeInstance.shutdown()
    feishuBridgeInstance = null
    setFeishuBridge(null)
  }
}

export function getFeishuBridgeInstance(): FeishuBridge | null {
  return getFeishuBridge()
}
