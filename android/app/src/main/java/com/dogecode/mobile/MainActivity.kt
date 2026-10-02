package com.dogecode.mobile

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
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

    /**
     * 是否正在展示错误页。错误页用 loadDataWithBaseURL 加载，
     * 若 baseURL 不可达可能再次触发 onReceivedError —— 用此标记防重入，
     * 否则会陷入「错误 → 加载错误页 → 又出错」的循环。
     * 用户重试或导航到新地址时重置。
     */
    private var showingError = false

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

        webView.webViewClient = object : WebViewClient() {
            /**
             * 加载失败时显示可读的错误页，而不是 WebView 默认的
             * 「无法访问此页面 ERR_CONNECTION_REFUSED」。
             *
             * 这个失败态是本项目最常见的情形：桥接服务器随 CLI 进程存活，
             * CLI 一关，5680 就不再监听，手机侧立刻连不上。给出明确原因
             * 和重试按钮，比系统错误页有用得多。
             */
            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                // 只处理主文档失败；子资源（favicon 等）失败不应覆盖整页
                if (request?.isForMainFrame != true) return
                // 已在错误页上则忽略，避免 loadDataWithBaseURL 再次失败导致循环
                if (showingError) return
                val code = if (android.os.Build.VERSION.SDK_INT >= 23) error?.errorCode else null
                showErrorPage(code)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progress.visibility = View.GONE
            }

            /**
             * 错误页里的「重试」按钮是 location.href 跳转，不经过 navigateTo，
             * 若不在此重置 showingError，重试失败后就再也不会显示错误页了。
             */
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?,
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (!url.startsWith("data:")) {
                    showingError = false
                    urlInput.setText(url)
                }
                return false   // 交给 WebView 正常加载
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.progress = newProgress
                progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }
        }
        // 保留 WebView 的 WebSocket 能力（默认已支持，无需额外开关）
    }

    /** 用本地 HTML 渲染错误页：说明可能的三个原因 + 重试按钮。 */
    private fun showErrorPage(code: Int?) {
        showingError = true
        progress.visibility = View.GONE
        val target = prefs.getString(KEY_URL, DEFAULT_URL) ?: DEFAULT_URL
        val html = """
            <!DOCTYPE html><html lang="zh-CN"><head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              body{margin:0;height:100vh;display:flex;flex-direction:column;
                   justify-content:center;align-items:center;background:#1a1a1a;
                   color:#e8e8e8;font:15px/1.7 -apple-system,"Microsoft YaHei",sans-serif;
                   padding:24px;box-sizing:border-box;text-align:left}
              h2{font-size:17px;margin:0 0 4px;color:#f87171}
              .code{color:#888;font-size:12px;margin-bottom:18px}
              ul{padding-left:20px;margin:0 0 20px;color:#bbb}
              li{margin:6px 0}
              code{background:#2d2d2d;padding:1px 5px;border-radius:4px;color:#4ade80}
              button{background:#2563eb;color:#fff;border:0;border-radius:8px;
                     padding:11px 26px;font-size:15px;cursor:pointer}
              .url{color:#888;font-size:12px;margin-top:16px;word-break:break-all}
            </style></head><body>
            <h2>连不上 doge-code 对话服务</h2>
            <div class="code">${if (code != null) "错误码 $code" else "连接失败"}</div>
            <ul>
              <li>电脑上的 CLI 是否还在运行？<br>（桥接随 CLI 一起退出，关掉窗口就连不上）</li>
              <li>用的是 <code>5680</code> 端口吗？<br>（<code>5678</code> 是另一个服务，没有对话页面）</li>
              <li>USB 模式请确认已执行 <code>adb reverse tcp:5680 tcp:5680</code></li>
            </ul>
            <button onclick="location.href='$target'">重试</button>
            <div class="url">当前地址：$target</div>
            </body></html>
        """.trimIndent()
        webView.loadDataWithBaseURL(target, html, "text/html", "UTF-8", null)
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
        showingError = false   // 重新导航，退出错误页状态
        val url = normalize(raw)
        urlInput.setText(url)
        prefs.edit().putString(KEY_URL, url).apply()
        webView.loadUrl(url)
        Toast.makeText(this, "连接 $url", Toast.LENGTH_SHORT).show()
    }
}
