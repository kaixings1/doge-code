package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

/**
 * SessionScanner.probePublic 端到端测试（真实本地 HTTP server）。
 *
 * 为什么测这一层而非 LanScanner.scan：
 * LanScanner.scan 的端口段是 private 常量（5680..5690），测试必须占用这些真实
 * 端口才能被扫到 —— 而开发机上这些端口常被真 CLI 占用（BindException）。
 * 端口段覆盖正确与否，用纯断言读 PORTS 常量即可（见 LanScannerPortRangeTest）。
 *
 * 真正脆弱的是「probe → 解析 → port 穿过」这条：probePublic 是 internal，
 * 复用 SessionScanner 的解析（与服务端 session-info 契约一致）。这里用真实
 * HttpURLConnection 打本地 server，验证顺延端口 5686 能正确拿到。
 */
class SessionScannerProbeTest {

    private fun freePort(): Int {
        // 绑定 0 让 OS 选空闲端口，直接复用该 socket，避免 close 后 race
        val s = ServerSocket(0, 0, java.net.InetAddress.getByName("127.0.0.1"))
        val p = s.localPort
        s.close()
        return p
    }

    /** 起 server 在随机空闲端口，返回该端口号。 */
    private fun startServer(body: String): Pair<ServerSocket, Int> {
        val srv = ServerSocket(0, 0, java.net.InetAddress.getByName("127.0.0.1"))
        val port = srv.localPort
        // 用线程池：accept 循环与请求处理不能共用同一线程，否则处理任务永远排不上
        val executor = Executors.newFixedThreadPool(4)
        executor.submit {
            try {
                while (true) {
                    val sock: Socket = srv.accept() ?: break
                    executor.submit { handle(sock, body) }
                }
            } catch (_: Exception) {
            }
        }
        return srv to port
    }

    private fun handle(sock: Socket, body: String) {
        try {
            sock.getInputStream().bufferedReader().readLine() // 读掉请求行
            val out: OutputStream = sock.getOutputStream()
            val resp = "HTTP/1.1 200 OK\r\n" +
                "Content-Type: application/json\r\n" +
                "Content-Length: ${body.toByteArray().size}\r\n" +
                "Connection: close\r\n\r\n$body"
            out.write(resp.toByteArray())
            out.flush()
        } catch (_: Exception) {
        } finally {
            runCatching { sock.close() }
        }
    }

    @Test
    fun `顺延端口 5686 被探测并拿到正确 port`() {
        val body = """{"sessionId":"mobile-5686","port":5686,"label":"s5686","cwd":"/p",
            "interactive":true,"clients":0,"lastActivity":1700000000000}"""
        val (srv, port) = startServer(body)
        Thread.sleep(200) // 等 accept 线程就绪
        try {
            val s = SessionScanner.probePublic("127.0.0.1", port)
            assertTrue("应探测到会话", s != null)
            assertEquals(5686, s!!.port)
            assertEquals("mobile-5686", s.sessionId)
            assertEquals("s5686", s.label)
        } finally {
            runCatching { srv.close() }
        }
    }

    @Test
    fun `非 JSON 响应返回 null（不算会话）`() {
        val (srv, port) = startServer("plain text not json")
        Thread.sleep(200)
        try {
            assertNull(SessionScanner.probePublic("127.0.0.1", port))
        } finally {
            runCatching { srv.close() }
        }
    }

    @Test
    fun `无服务端口返回 null（不崩）`() {
        // 用一个确定无 server 的端口
        val port = freePort()
        Thread.sleep(50)
        assertNull(SessionScanner.probePublic("127.0.0.1", port))
    }

    @Test
    fun `HTTP 404 不算会话`() {
        val srv = ServerSocket(0, 0, java.net.InetAddress.getByName("127.0.0.1"))
        val port = srv.localPort
        val executor = Executors.newFixedThreadPool(4)
        executor.submit {
            try {
                while (true) {
                    val sock = srv.accept()
                    // 回 404，模拟「端口开了但不是 doge 桥接」
                    executor.submit {
                        try {
                            sock.getInputStream().bufferedReader().readLine()
                            val out = sock.getOutputStream()
                            val resp = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                            out.write(resp.toByteArray()); out.flush()
                        } catch (_: Exception) {
                        } finally { runCatching { sock.close() } }
                    }
                }
            } catch (_: Exception) {
            }
        }
        Thread.sleep(200)
        try {
            assertNull("404 不应算会话", SessionScanner.probePublic("127.0.0.1", port))
        } finally {
            runCatching { srv.close() }
            executor.shutdownNow()
        }
    }
}
