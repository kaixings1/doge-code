package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * TUNNEL 模式拉取服务端配置的解析链测试。
 *
 * 背景：TUNNEL 模式下 [SessionScanner.fetchSessionInfo] 之前用 `http://host:port`
 * 直连，但隧道地址是 `wss://域名/mobile/ws`，解析出 domain + 443 后发起的
 * HTTP 直连不通（cloudflared 只暴露 wss + 同源 https）。修复后 TUNNEL 改走
 * `https://域名/mobile/session-info`，经隧道命中本地 server 的同名 HTTP 端点。
 *
 * 本测试不依赖网络：直接喂 TUNNEL 会收到的 JSON 响应体，验证 [SessionScanner.configFrom]
 * 能正确解析出 model/thinking/permission —— 证明整条解析链在拿到 JSON 后即补全三门。
 */
class TunnelConfigFetchTest {

    /** TUNNEL 服务端 `/mobile/session-info` 返回体（含嵌套 config 对象）。 */
    private fun tunnelResponseBody(model: String, thinking: Int, perm: String): String = """
        {
          "sessionId": "mobile-1700000000000",
          "resumeSessionId": "abc-123",
          "port": 6002,
          "cwd": "/home/user/project",
          "label": "我的会话",
          "config": {
            "model": "$model",
            "thinkingTokens": $thinking,
            "permissionMode": "$perm",
            "verbose": false,
            "sources": {
              "model": "mobile",
              "thinkingTokens": "default",
              "permissionMode": "settings"
            }
          }
        }
    """.trimIndent()

    @Test
    fun `configFrom 解析出 model thinking permission`() {
        val snap = SessionScanner.configFrom(
            tunnelResponseBody("claude-opus-4-6", 16384, "plan"),
        )
        assertEquals("claude-opus-4-6", snap?.model)
        assertEquals(16384, snap?.thinkingTokens)
        assertEquals("plan", snap?.permissionMode)
    }

    @Test
    fun `configFrom 缺失 config 返回 null`() {
        // 老服务端不支持 config 字段时，不应编造默认值
        assertNull(SessionScanner.configFrom("""{"sessionId":"x"}"""))
    }

    @Test
    fun `configFrom 空响应返回 null`() {
        assertNull(SessionScanner.configFrom(null))
        assertNull(SessionScanner.configFrom(""))
    }

    @Test
    fun `appMode 判定 TUNNEL 非云端自带`() {
        // sessionInfoUrl() 的分流依据：TUNNEL 走 https，LAN 走 http。
        // 这里仅确认 AppMode 分类正确（isCloudAgent 不含 TUNNEL）。
        assertTrue(!AppMode.TUNNEL.isCloudAgent)
        assertTrue(AppMode.LAN.isCloudAgent == false)
    }

    @Test
    fun `BridgeUrl 从 wss 地址取 host`() {
        // sessionInfoUrl() 在 TUNNEL 下用 BridgeUrl.hostOf(wss地址) 拼 https，
        // 必须能从 wss://域名/mobile/ws 正确取出域名。
        assertEquals(
            "aid-plane-aware-designer.trycloudflare.com",
            BridgeUrl.hostOf("wss://aid-plane-aware-designer.trycloudflare.com/mobile/ws"),
        )
    }
}
