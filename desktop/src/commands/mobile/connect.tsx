/**
 * /mobile-connect 命令 — 启动移动端连接服务器
 *
 * 功能：
 * - 启动移动端桥接服务器（WebSocket + HTTP）
 * - 生成二维码供移动端 App 扫描，扫描后自动下载 App 并连接
 * - 显示连接信息和状态
 * - 管理移动端会话生命周期
 *
 * 使用环境变量：
 * - CLAUDE_CODE_MOBILE_BRIDGE=1: 启用移动端桥接
 * - CLAUDE_CODE_MOBILE_SECRET=<key>: 共享密钥用于认证
 * - CLAUDE_CODE_LOCAL_BRIDGE=1: 本地桥接模式（自动启用移动端）
 */

import { c as _c } from "react/compiler-runtime"
import { toString as qrToString } from 'qrcode'
import * as React from 'react'
import { useEffect, useState } from 'react'
import { Box, Text } from '../../ink.js'
import { Pane } from '../../components/design-system/Pane.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { isMobileBridgeAvailable, MobileBridgeServer, getMobileBridgeUrl } from '../../bridge/mobileBridge.js'
import { getMobileSessionManager } from '../../bridge/mobileSession.js'
import { logForDebugging } from '../../utils/debug.js'

interface ConnectInfo {
  sessionId: string
  wsUrl: string
  httpUrl: string
  connectUrl: string
  qrCode: string
  iosUrl: string
  androidUrl: string
  status: 'starting' | 'ready' | 'connected' | 'failed'
  clientCount: number
}

const PLATFORMS = {
  ios: { url: 'https://apps.apple.com/app/claude-by-anthropic/id6473753684' },
  android: { url: 'https://play.google.com/store/apps/details?id=com.anthropic.claude' },
}

function MobileConnectScreen(t0) {
  const $ = _c(38)
  const { onDone } = t0
  const [connectInfo, setConnectInfo] = useState<ConnectInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [server, setServer] = useState<MobileBridgeServer | null>(null)

  let t1
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      const startServer = async () => {
        try {
          const sessionId = `mobile-${Date.now()}`
          const wsUrl = `${getMobileBridgeUrl().replace(/^http/, 'ws')}/mobile/ws?deviceId=claude-code&deviceType=desktop`
          const httpUrl = `${getMobileBridgeUrl()}/mobile/command`
          const bridgeSecret = process.env.CLAUDE_CODE_MOBILE_SECRET ?? ''

          setConnectInfo({
            sessionId,
            wsUrl,
            httpUrl,
            connectUrl: '',
            qrCode: '',
            iosUrl: PLATFORMS.ios.url,
            androidUrl: PLATFORMS.android.url,
            status: 'starting',
            clientCount: 0,
          })

          // 启动移动端桥接服务器
          const mobileServer = new MobileBridgeServer({ sessionId, port: 5680 })
          await mobileServer.start()

          if (!mobileServer.isServerRunning()) {
            setError('移动端桥接服务器启动失败')
            setConnectInfo(prev => prev ? { ...prev, status: 'failed' } : null)
            return
          }

          setServer(mobileServer)

          // 生成二维码 — 包含连接 URL + 下载链接
          // 格式: claude://mobile-bridge?sessionId=...&wsUrl=...&iosUrl=...&androidUrl=...
          const connectUrl = `claude://mobile-bridge?sessionId=${encodeURIComponent(sessionId)}&wsUrl=${encodeURIComponent(wsUrl)}&httpUrl=${encodeURIComponent(httpUrl)}&secret=${encodeURIComponent(bridgeSecret)}&iosUrl=${encodeURIComponent(PLATFORMS.ios.url)}&androidUrl=${encodeURIComponent(PLATFORMS.android.url)}`

          const qrCode = await qrToString(connectUrl, {
            type: 'utf8',
            errorCorrectionLevel: 'L',
          })

          setConnectInfo(prev => prev ? {
            ...prev,
            connectUrl,
            qrCode,
            status: 'ready',
          } : null)

          logForDebugging(`[MobileConnect] 服务器已启动，等待移动端连接...`)

          // 定期更新客户端数量
          const interval = setInterval(() => {
            setConnectInfo(prev => prev ? {
              ...prev,
              clientCount: mobileServer.getClientCount(),
            } : null)
          }, 1000)

          // 清理函数
          return () => {
            clearInterval(interval)
            mobileServer.stop().catch(() => {})
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
          setConnectInfo(prev => prev ? { ...prev, status: 'failed' } : null)
        }
      }

      const cleanup = startServer()
      return () => {
        cleanup?.then(fn => fn?.())
      }
    }
    $[0] = t1
  } else {
    t1 = $[0]
  }
  useEffect(t1, [])

  // 清理服务器
  useEffect(() => {
    return () => {
      if (server) {
        server.stop().catch(() => {})
      }
    }
  }, [server])

  let t2
  if ($[1] !== onDone) {
    t2 = () => {
      if (server) {
        server.stop().catch(() => {})
      }
      onDone()
    }
    $[1] = onDone
  } else {
    t2 = $[1]
  }
  const handleClose = t2

  let t3
  if ($[2] !== handleClose) {
    t3 = { context: "Confirmation" }
    $[2] = t3
  } else {
    t3 = $[2]
  }
  useKeybinding("confirm:no", handleClose, t3)

  let t4
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = (e) => {
      if (e.key === 'q' || e.ctrl && e.key === 'c') {
        e.preventDefault()
        handleClose()
        return
      }
    }
    $[3] = t4
  } else {
    t4 = $[3]
  }
  const handleKeyDown = t4

  // QR 码行
  let t5
  if ($[4] !== connectInfo?.qrCode) {
    t5 = connectInfo?.qrCode ? connectInfo.qrCode.split("\n").filter(l => l.length > 0).map((line, i) => <Text key={i}>{line}</Text>) : []
    $[4] = connectInfo?.qrCode
  } else {
    t5 = $[4]
  }
  const qrLines = t5

  // 状态文本
  let t6
  if ($[5] !== connectInfo?.status) {
    const statusText = connectInfo?.status === 'connected' ? '已连接' :
      connectInfo?.status === 'ready' ? '等待中' :
      connectInfo?.status === 'starting' ? '启动中...' :
      connectInfo?.status === 'failed' ? '失败' : '...'
    const color = connectInfo?.status === 'connected' ? 'green' :
      connectInfo?.status === 'failed' ? 'red' :
      connectInfo?.status === 'starting' ? 'yellow' : 'yellow'
    t6 = <Text color={color}>{statusText}</Text>
    $[5] = connectInfo?.status
  } else {
    t6 = $[5]
  }

  let t7
  if ($[6] !== connectInfo?.clientCount) {
    t7 = <Text>已连接设备: {connectInfo?.clientCount ?? 0}</Text>
    $[6] = connectInfo?.clientCount
  } else {
    t7 = $[6]
  }

  let t8
  if ($[7] !== connectInfo?.sessionId) {
    t8 = <Text>会话 ID: {connectInfo?.sessionId ?? ''}</Text>
    $[7] = connectInfo?.sessionId
  } else {
    t8 = $[7]
  }

  let t9
  if ($[8] !== connectInfo?.wsUrl) {
    t9 = <Text>WebSocket: {connectInfo?.wsUrl ?? ''}</Text>
    $[8] = connectInfo?.wsUrl
  } else {
    t9 = $[8]
  }

  let t10
  if ($[9] !== connectInfo?.httpUrl) {
    t10 = <Text>HTTP: {connectInfo?.httpUrl ?? ''}</Text>
    $[9] = connectInfo?.httpUrl
  } else {
    t10 = $[9]
  }

  let t11
  if ($[10] !== connectInfo?.connectUrl) {
    t11 = <Text dimColor={true}>{connectInfo?.connectUrl ?? ''}</Text>
    $[10] = connectInfo?.connectUrl
  } else {
    t11 = $[10]
  }

  let t12
  if ($[11] !== connectInfo?.iosUrl) {
    t12 = <Text dimColor={true}>iOS 下载: {connectInfo?.iosUrl ?? ''}</Text>
    $[11] = connectInfo?.iosUrl
  } else {
    t12 = $[11]
  }

  let t13
  if ($[12] !== connectInfo?.androidUrl) {
    t13 = <Text dimColor={true}>Android 下载: {connectInfo?.androidUrl ?? ''}</Text>
    $[12] = connectInfo?.androidUrl
  } else {
    t13 = $[12]
  }

  let t14
  if ($[13] !== error) {
    t14 = error ? <Text color="red">{error}</Text> : <Text> </Text>
    $[13] = error
  } else {
    t14 = $[13]
  }

  let t15
  if ($[14] !== qrLines.length) {
    t15 = qrLines.length > 0 ? (
      <Box flexDirection="column">
        {qrLines}
      </Box>
    ) : <Text>二维码加载中...</Text>
    $[14] = qrLines.length
  } else {
    t15 = $[14]
  }

  let t16
  if ($[15] !== t6 || $[16] !== t14 || $[17] !== t7 || $[18] !== t8 || $[19] !== t9 || $[20] !== t10 || $[21] !== t11 || $[22] !== t12 || $[23] !== t13 || $[24] !== t15 || $[25] !== handleKeyDown) {
    t16 = (
      <Pane>
        <Box flexDirection="column">
          <Text bold={true}>📱 移动端连接</Text>
          {t14}
          <Text>状态: {t6}</Text>
          {t7}
          {t8}
          {t9}
          {t10}
          <Text>二维码 — 扫描后自动下载 Claude App 并连接：</Text>
          {t15}
          <Text dimColor={true}>链接（可复制到手机浏览器）:</Text>
          {t11}
          {t12}
          {t13}
          <Text dimColor={true}>按 Esc 或 Q 关闭</Text>
        </Box>
      </Pane>
    )
    $[15] = t6
    $[16] = t14
    $[17] = t7
    $[18] = t8
    $[19] = t9
    $[20] = t10
    $[21] = t11
    $[22] = t12
    $[23] = t13
    $[24] = t15
    $[25] = handleKeyDown
    $[26] = t16
    $[27] = t16
  } else {
    t16 = $[26]
  }

  let t17
  if ($[28] !== handleKeyDown || $[29] !== t16) {
    t17 = <Box flexDirection="column" tabIndex={0} autoFocus={true} onKeyDown={handleKeyDown}>{t16}</Box>
    $[28] = handleKeyDown
    $[29] = t16
  } else {
    t17 = $[29]
  }

  return t17
}

export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  if (!isMobileBridgeAvailable()) {
    return (
      <Box flexDirection="column">
        <Text>移动端桥接不可用。请设置环境变量：</Text>
        <Text>  Windows: set CLAUDE_CODE_MOBILE_BRIDGE=1 && claude /mobile-connect</Text>
        <Text>  macOS/Linux: export CLAUDE_CODE_MOBILE_BRIDGE=1 && claude /mobile-connect</Text>
      </Box>
    )
  }
  return <MobileConnectScreen onDone={onDone} />
}