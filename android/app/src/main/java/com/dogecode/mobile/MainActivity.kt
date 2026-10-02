package com.dogecode.mobile

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlin.concurrent.thread

/**
 * doge-code 手机客户端。
 *
 * 原生实现：直接用 OkHttp WebSocket 与移动桥接通信，不再用 WebView 包网页。
 * 相比 WebView 版多了：本地历史、断线自动重连、发送状态回执、消息通知、
 * 中断当前回合。对话逻辑仍全部在 CLI 侧，这里只是客户端。
 *
 * 协议与地址格式见 BridgeClient / src/bridge/mobileBridge.ts。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var prefs: SharedPreferences
    private lateinit var store: MessageStore
    private lateinit var adapter: ChatAdapter
    private lateinit var client: BridgeClient

    private lateinit var list: RecyclerView
    private lateinit var msgInput: EditText
    private lateinit var urlInput: EditText
    private lateinit var secretInput: EditText
    private lateinit var connPanel: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var dot: View
    private lateinit var sendBtn: ImageButton
    private lateinit var stopBtn: ImageButton

    /** 已发送但还没收到 queued 回执的消息 id → requestId */
    private val pending = mutableMapOf<String, String>()
    private var interactive = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        store = MessageStore(this)
        adapter = ChatAdapter()
        Notifications.ensureChannel(this)
        // Android 13+ 需运行时申请通知权限；拒绝也不影响主流程
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission("android.permission.POST_NOTIFICATIONS") !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 1001)
        }

        list = findViewById(R.id.list)
        msgInput = findViewById(R.id.msg_input)
        urlInput = findViewById(R.id.url_input)
        secretInput = findViewById(R.id.secret_input)
        connPanel = findViewById(R.id.conn_panel)
        statusText = findViewById(R.id.status)
        dot = findViewById(R.id.dot)
        sendBtn = findViewById(R.id.btn_send)
        stopBtn = findViewById(R.id.btn_stop)

        list.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
        list.adapter = adapter

        client = BridgeClient { ev -> onEvent(ev) }

        urlInput.setText(prefs.getString(KEY_URL, DEFAULT_URL))
        secretInput.setText(prefs.getString(KEY_SECRET, ""))

        findViewById<ImageButton>(R.id.btn_settings).setOnClickListener {
            connPanel.visibility = if (connPanel.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }
        findViewById<Button>(R.id.btn_connect).setOnClickListener {
            hideKeyboard()
            connPanel.visibility = View.GONE
            connectWith(urlInput.text.toString(), secretInput.text.toString())
        }
        findViewById<Button>(R.id.btn_clear).setOnClickListener {
            adapter.submit(emptyList())
            thread { store.clear() }
            Toast.makeText(this, "已清空本地记录", Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.btn_scan).setOnClickListener {
            val host = currentHost()
            val curPort = currentPort()
            SessionPickerDialog.show(this, host, curPort) { s ->
                // 切换会话：更新地址栏并重连
                val url = "http://$host:${s.port}"
                urlInput.setText(url)
                connectWith(url, secretInput.text.toString())
                append(ChatMessage.system("已切换到会话「${s.label}」（端口 ${s.port}）"))
                connPanel.visibility = View.GONE
            }
        }
        sendBtn.setOnClickListener { sendCurrent() }
        stopBtn.setOnClickListener { client.sendInterrupt() }

        msgInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) { sendCurrent(); true } else false
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (connPanel.visibility == View.VISIBLE) connPanel.visibility = View.GONE
                else finish()
            }
        })

        // 载入历史（IO 线程读文件，回主线程渲染）
        thread {
            val history = store.load()
            runOnUiThread {
                adapter.submit(history)
                if (history.isNotEmpty()) list.scrollToPosition(history.size - 1)
            }
        }

        // 已授权通知则直接连，否则先让用户点连接（避免无谓弹窗）
        if (prefs.getBoolean(KEY_AUTOCONNECT, true)) {
            connectWith(urlInput.text.toString(), secretInput.text.toString())
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        client.close()
        // 及时落盘，避免进程被杀丢消息
        val snapshot = adapter.snapshot()
        thread { store.save(snapshot) }
    }

    // ── 连接 ──

    private fun connectWith(rawUrl: String, secret: String) {
        val url = normalize(rawUrl)
        prefs.edit()
            .putString(KEY_URL, url)
            .putString(KEY_SECRET, secret)
            .putBoolean(KEY_AUTOCONNECT, true)
            .apply()
        urlInput.setText(url)

        client.close()
        setStatus(false, getString(R.string.status_connecting))
        client.connect(buildWsUrl(url, secret))
    }

    /**
     * 把 http(s)://host:port 形式转成 ws(s)://host:port/mobile/ws?...。
     * 服务端的 WS 端点固定为 /mobile/ws，密钥经 query 传（见 mobileBridge.ts:655）。
     */
    private fun buildWsUrl(httpUrl: String, secret: String): String {
        val ws = when {
            httpUrl.startsWith("https://") -> "wss://" + httpUrl.removePrefix("https://")
            httpUrl.startsWith("http://") -> "ws://" + httpUrl.removePrefix("http://")
            else -> "ws://$httpUrl"
        }.trimEnd('/')
        val sb = StringBuilder(ws).append("/mobile/ws")
            .append("?deviceId=android-app&deviceType=android")
        if (secret.isNotBlank()) sb.append("&secret=").append(java.net.URLEncoder.encode(secret, "UTF-8"))
        return sb.toString()
    }

    /** 取当前地址栏里的主机名；解析失败时回落到回环地址。 */
    private fun currentHost(): String {
        val u = normalize(urlInput.text.toString())
        return runCatching { java.net.URI(u).host }.getOrNull() ?: "127.0.0.1"
    }

    /** 取当前地址栏里的端口；解析失败时回落到默认端口。 */
    private fun currentPort(): Int {
        val u = normalize(urlInput.text.toString())
        val p = runCatching { java.net.URI(u).port }.getOrNull() ?: -1
        return if (p > 0) p else PORT
    }

    /** 归一化：允许只填 IP / IP:端口 / 完整 URL。 */
    private fun normalize(raw: String): String {
        var v = raw.trim()
        if (v.isEmpty()) return DEFAULT_URL
        if (!v.startsWith("http://") && !v.startsWith("https://")) v = "http://$v"
        val afterScheme = v.removePrefix("http://").removePrefix("https://")
        if (!afterScheme.contains(":")) v = "$v:$PORT"
        return v
    }

    // ── 事件处理（BridgeClient 已切回主线程） ──

    private fun onEvent(ev: BridgeClient.Event) {
        when (ev) {
            is BridgeClient.Event.Connected -> {
                interactive = ev.interactive
                if (ev.interactive) {
                    setStatus(true, getString(R.string.status_connected))
                } else {
                    setStatus(true, getString(R.string.status_noninteractive))
                    append(ChatMessage.system(
                        "⚠ 电脑上的 CLI 运行在非交互模式，消息只会入队、不会被处理。\n" +
                            "请在真实终端里运行 doge.exe（或 node scripts/start-mobile-bridge.mjs），" +
                            "不要用 -p 或重定向 stdin 的方式启动。",
                    ))
                }
            }
            is BridgeClient.Event.Disconnected -> setStatus(false, getString(R.string.status_disconnected))
            is BridgeClient.Event.Incoming -> append(
                ChatMessage(ChatMessage.newId(), ev.role, ev.text, System.currentTimeMillis()),
            )
            is BridgeClient.Event.Queued -> {
                val id = pending.entries.firstOrNull { it.value == ev.requestId }?.key
                if (id != null) {
                    adapter.updateStatus(id, ChatMessage.Status.QUEUED)
                    pending.remove(id)
                    persist()
                }
            }
            is BridgeClient.Event.Error -> append(ChatMessage.system("错误：${ev.message}"))
        }
    }

    private fun setStatus(ok: Boolean, label: String) {
        dot.setBackgroundResource(if (ok) R.drawable.dot_on else R.drawable.dot_off)
        statusText.text = label
        sendBtn.isEnabled = ok
        sendBtn.alpha = if (ok) 1f else 0.4f
    }

    private fun append(msg: ChatMessage) {
        val pos = adapter.append(msg)
        list.scrollToPosition(pos)
        persist()
        maybeNotify(msg)
    }

    private fun persist() {
        val snapshot = adapter.snapshot()
        thread { store.save(snapshot) }
    }

    // ── 发送 ──

    private fun sendCurrent() {
        val text = msgInput.text.toString().trim()
        if (text.isEmpty()) return
        if (!client.isConnected) {
            Toast.makeText(this, "未连接，请先在设置里连接", Toast.LENGTH_SHORT).show()
            return
        }
        val msg = ChatMessage.user(text)
        val reqId = ChatMessage.newId()
        pending[msg.id] = reqId

        val pos = adapter.append(msg)
        list.scrollToPosition(pos)
        msgInput.setText("")

        val ok = client.sendMessage(text, reqId)
        if (!ok) {
            adapter.updateStatus(msg.id, ChatMessage.Status.FAILED)
            pending.remove(msg.id)
        }
        persist()
    }

    private fun hideKeyboard() {
        val im = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        im.hideSoftInputFromWindow(msgInput.windowToken, 0)
    }

    /**
     * 助手回复到达时发系统通知。仅当 App 不在前台才提醒 ——
     * 用户正看着界面时再弹通知是打扰。
     */
    private fun maybeNotify(msg: ChatMessage) {
        if (msg.role != "assistant") return
        if (hasWindowFocus()) return
        Notifications.notifyAssistant(this, msg.text)
    }

    companion object {
        private const val PREFS = "doge_mobile"
        private const val KEY_URL = "last_url"
        private const val KEY_SECRET = "secret"
        private const val KEY_AUTOCONNECT = "autoconnect"

        private const val PORT = 5680

        /**
         * 默认地址。USB 反向转发（adb reverse）下手机访问 127.0.0.1:5680 即可，
         * 无需同 WiFi、无需放行防火墙，是本项目推荐的连接方式
         * （见 scripts/start-mobile-bridge.mjs）。
         */
        private val DEFAULT_URL = "http://127.0.0.1:$PORT"
    }
}
