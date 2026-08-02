/**
 * /mobile-connect 命令 — 启动移动端连接会话（非 JSX 版本）
 *
 * 功能：
 * - 启动移动端桥接服务器（WebSocket + HTTP）
 * - 生成连接二维码供移动端 App 扫描
 * - 显示连接信息和状态
 * - 管理移动端会话生命周期
 */

import type { Command } from '../../commands.js'
import { isMobileBridgeAvailable, initMobileBridge } from '../../bridge/mobileBridge.js'
import { getLocalBridgeUrl } from '../../bridge/bridgeConfig.js'
import { qrToString } from 'qrcode'

const mobileConnectCommand: Command = {
  type: 'local-jsx',
  name: 'mobile-connect',
  aliases: ['/mobile-connect', '/mobile', '/connect-mobile'],
  description: '启动移动端连接会话，生成二维码供手机 App 扫描',
  load: () => import('./connect.tsx'),
} satisfies Command

export default mobileConnectCommand