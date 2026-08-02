/**
 * /mobile-connect 命令 — 启动移动端连接会话
 *
 * 功能：
 * - 启动移动端桥接服务器（WebSocket + HTTP）
 * - 生成连接二维码供移动端 App 扫描
 * - 显示连接信息和状态
 * - 管理移动端会话生命周期
 */

import { c as _c } from "react/compiler-runtime"
import { toString as qrToString } from 'qrcode'
import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Box, Text } from '../../ink.js'
import { Pane } from '../../components/design-system/Pane.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { isMobileBridgeAvailable, initMobileBridge } from '../../bridge/mobileBridge.js'
import { getLocalBridgeUrl } from '../../bridge/bridgeConfig.js'
import { logForDebugging } from '../../utils/debug.js'

type Platform = 'ios' | 'android' | 'both'

interface ConnectInfo {
  sessionId: string
  wsUrl: string
  httpUrl: string
  qrCode: string
  status: 'waiting' | 'connected' | 'failed'
}

function MobileConnectScreen(t0) {
  const $ = _c(28)
  const {
    onDone
  } = t0
  const [platform, setPlatform] = useState("both")
  const [connectInfo, setConnectInfo] = useState<ConnectInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  let t1
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      const startConnection = async () => {
        try {
          const sessionId = `mobile-${Date.now()}`
          const bridgeUrl = getLocalBridgeUrl().replace(/^http/, 'ws')
          const wsUrl = `${bridgeUrl}/mobile/session-ingress/${sessionId}`
          const httpUrl = `${getLocalBridgeUrl().replace('5678', '5679')}/mobile/command`

          // 生成连接二维码
          const qrData = JSON.stringify({
            type: 'claude-code-mobile',
            sessionId,
            wsUrl,
            httpUrl,
            secret: '',
          })
          const qrCode = await qrToString(qrData, {
            type: 'utf8',
            errorCorrectionLevel: 'L',
          })

          setConnectInfo({
            sessionId,
            wsUrl,
            httpUrl,
            qrCode,
            status: 'waiting',
          })

          // 尝试启动桥接连接
          const bridge = await initMobileBridge({
            sessionId,
            onStateChange: (state) => {
              setConnectInfo(prev => prev ? { ...prev, status: state === 'ready' ? 'connected' : 'waiting' } : null)
            },
            onInboundMessage: (msg) => {
              logForDebugging(`[MobileBridge] inbound: ${msg.type}`)
            },
          })

          if (bridge) {
            setConnectInfo(prev => prev ? { ...prev, status: 'connected' } : null)
          } else {
            setError('无法启动移动端桥接连接')
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setError(msg)
        }
      }
      startConnection().catch(_temp)
    }
    $[0] = t1
  } else {
    t1 = $[0]
  }
  useEffect(t1, [])

  let t2
  if ($[1] !== onDone) {
    t2 = () => { onDone() }
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
        onDone()
        return
      }
      if (e.key === 'tab' || e.key === 'left' || e.key === 'right') {
        e.preventDefault()
        setPlatform(_temp2)
      }
    }
    $[3] = onDone
    $[4] = t4
  } else {
    t4 = $[4]
  }
  const handleKeyDown = t4

  let t5
  if ($[5] !== connectInfo) {
    t5 = connectInfo?.qrCode.split("\n").filter((l) => l.length > 0) ?? []
    $[5] = connectInfo
  } else {
    t5 = $[5]
  }
  const qrLines = t5

  let t6
  if ($[6] === Symbol.for("react.memo_cache_sentinel")) {
    t6 = <Text> </Text>
    $[6] = t6
  } else {
    t6 = $[6]
  }
  const spacer1 = t6

  let t7
  if ($[7] === Symbol.for("react.memo_cache_sentinel")) {
    t7 = <Text> </Text>
    $[7] = t7
  } else {
    t7 = $[7]
  }
  const spacer2 = t7

  let t8
  if ($[8] !== platform) {
    t8 = platform === "ios" ? <Text bold={true} underline={true}>iOS</Text> : <Text>iOS</Text>
    $[8] = platform
  } else {
    t8 = $[8]
  }

  let t9
  if ($[9] === Symbol.for("react.memo_cache_sentinel")) {
    t9 = <Text dimColor={true}>{" / "}</Text>
    $[9] = t9
  } else {
    t9 = $[9]
  }
  const slash = t9

  let t10
  if ($[10] !== platform) {
    t10 = platform === "android" ? <Text bold={true} underline={true}>Android</Text> : <Text>Android</Text>
    $[10] = platform
  } else {
    t10 = $[10]
  }
  const platformText = t10

  let t11
  if ($[11] !== t8 || $[12] !== slash || $[13] !== t10) {
    t11 = <Box flexDirection="row" gap={2}>{t8}{slash}{t10}</Box>
    $[11] = t8
    $[12] = slash
    $[13] = t10
  } else {
    t11 = $[11]
  }

  let t12
  if ($[14] !== t11) {
    t12 = <Text>{t11} <Text dimColor={true}>（Tab 切换，Esc 关闭）</Text></Text>
    $[14] = t11
  } else {
    t12 = $[14]
  }

  let t13
  if ($[15] !== error) {
    t13 = error ? <Text color="red">{error}</Text> : <Text> </Text>
    $[15] = error
  } else {
    t13 = $[15]
  }

  let t14
  if ($[16] !== connectInfo?.status) {
    t14 = connectInfo ? (
      <Text>
        状态: {connectInfo.status === 'connected' ? <Text color="green">已连接</Text> : connectInfo.status === 'waiting' ? <Text color="yellow">等待中...</Text> : <Text color="red">连接失败</Text>}
      </Text>
    ) : <Text> </Text>
    $[16] = connectInfo?.status
  } else {
    t14 = $[16]
  }

  let t15
  if ($[17] !== connectInfo?.sessionId) {
    t15 = connectInfo ? <Text dimColor={true}>会话: {connectInfo.sessionId}</Text> : <Text> </Text>
    $[17] = connectInfo?.sessionId
  } else {
    t15 = $[17]
  }

  let t16
  if ($[18] !== qrLines.length) {
    t16 = qrLines.map((line, i) => <Text key={i}>{line}</Text>)
    $[18] = qrLines.length
  } else {
    t16 = $[18]
  }

  let t17
  if ($[19] !== t12 || $[20] !== t13 || $[21] !== t14 || $[22] !== t15 || $[23] !== t16) {
    t17 = (
      <Pane>
        <Box flexDirection="column">
          <Text bold={true}>📱 移动端连接</Text>
          {t12}
          {t13}
          {t14}
          {t15}
          <Text>扫码或手动连接：</Text>
          {t16}
          <Text dimColor={true}>在移动端 Claude App 中选择"连接到桌面"并扫描二维码</Text>
        </Box>
      </Pane>
    )
    $[19] = t12
    $[20] = t13
    $[21] = t14
    $[22] = t15
    $[23] = t16
  } else {
    t17 = $[23]
  }

  let t18
  if ($[24] !== t17) {
    t18 = <Box flexDirection="column">{t17}</Box>
    $[24] = t17
  } else {
    t18 = $[24]
  }

  let t19
  if ($[25] !== t18) {
    t19 = <Pane>{t18}</Pane>
    $[25] = t18
  } else {
    t19 = $[25]
  }

  let t20
  if ($[26] !== handleKeyDown || $[27] !== t19) {
    t20 = <Box flexDirection="column" tabIndex={0} autoFocus={true} onKeyDown={handleKeyDown}>{t19}</Box>
    $[26] = handleKeyDown
    $[27] = t19
  } else {
    t20 = $[27]
  }

  return t20
}

function _temp2(prev) {
  return prev === "ios" ? "android" : prev === "android" ? "both" : "ios"
}

function _temp() {}

export async function call(onDone: LocalJSXCommandOnDone): Promise<React.ReactNode> {
  if (!isMobileBridgeAvailable()) {
    return <Text>移动端桥接不可用。请设置 CLAUDE_CODE_MOBILE_BRIDGE=1 或 CLAUDE_CODE_LOCAL_BRIDGE=1 后重试。</Text>
  }
  return <MobileConnectScreen onDone={onDone} />
}