package com.dogecode.mobile

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity

/**
 * doge-code 移动端外壳。
 *
 * 只用 WebView 封装 CLI 内置的对话页面（http://<host>:5680），
 * 不重写任何对话逻辑 —— 页面、WS、入站注入全部由 CLI 侧提供。
 *
 * 设计取舍：
 * - 保留一个可折叠的地址栏：局域网 IP 会变（DHCP），不能硬编码。
 * - 地址持久化到 SharedPreferences，装一次之后基本不用再改。
 * - 返回键优先让页面回退历史，到顶再退出 App（符合浏览器直觉）。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var urlInput: EditText
    private lateinit var bar: LinearLayout
    private lateinit var progress: ProgressBar
    private lateinit var prefs: SharedPreferences

    companion object {
        private const val PREFS = "doge_mobile"
        private const val KEY_URL = "last_url"

        /**
         * 默认地址。USB 反向转发（adb reverse）模式下手机访问 127.0.0.1:5680
         * 即可，无需同 WiFi、无需放行防火墙 —— 是本项目推荐的连接方式
         * （见 scripts/start-mobile-bridge.mjs）。
         * 走局域网时改为电脑的默认路由地址（如 192.168.0.106），在地址栏填一次即可。
         */
        private const val PORT = 5680
        private val DEFAULT_URL = "http://127.0.0.1:$PORT"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        webView = findViewById(R.id.webview)
        urlInput = findViewById(R.id.url_input)
        bar = findViewById(R.id.url_bar)
        progress = findViewById(R.id.progress)
        val reloadBtn: ImageButton = findViewById(R.id.btn_reload)
        val toggleBtn: ImageButton = findViewById(R.id.btn_toggle)

        setupWebView()

        reloadBtn.setOnClickListener { webView.reload() }
        toggleBtn.setOnClickListener {
            bar.visibility = if (bar.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }

        urlInput.setOnEditorActionListener { _, actionId, event ->
            val enter = actionId == EditorInfo.IME_ACTION_GO ||
                (event != null && event.keyCode == KeyEvent.KEYCODE_ENTER)
            if (enter) {
                navigateTo(urlInput.text.toString())
                true
            } else false
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        val startUrl = prefs.getString(KEY_URL, DEFAULT_URL) ?: DEFAULT_URL
        urlInput.setText(startUrl)
        webView.loadUrl(startUrl)
    }

    private fun setupWebView() {
        val s = webView.settings
        s.javaScriptEnabled = true          // 页面靠 JS 建 WebSocket
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.cacheMode = WebSettings.LOAD_DEFAULT
        // 明文 http/ws：与 manifest 的 usesCleartextTraffic 双保险
        s.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }
        }
        // 保留 WebView 的 WebSocket 能力（默认已支持，无需额外开关）
    }

    /** 归一化用户输入：允许只填 IP / IP:端口 / 完整 URL。 */
    private fun normalize(raw: String): String {
        var v = raw.trim()
        if (v.isEmpty()) return DEFAULT_URL
        if (!v.startsWith("http://") && !v.startsWith("https://")) v = "http://$v"
        // 只给了 IP、没给端口时补默认端口
        val afterScheme = v.removePrefix("http://").removePrefix("https://")
        if (!afterScheme.contains(":")) v = "$v:$PORT"
        return v
    }

    private fun navigateTo(raw: String) {
        val url = normalize(raw)
        urlInput.setText(url)
        prefs.edit().putString(KEY_URL, url).apply()
        webView.loadUrl(url)
        Toast.makeText(this, "连接 $url", Toast.LENGTH_SHORT).show()
    }
}
