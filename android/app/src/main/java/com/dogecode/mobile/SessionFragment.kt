package com.dogecode.mobile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import kotlin.concurrent.thread

/**
 * 会话页：列出发现的 CLI 会话，点选切换。
 *
 * 替代原来的 SessionPickerDialog（AlertDialog）。改独立页面后多出：
 * · 搜索过滤（会话多时按标签/路径找）
 * · 「当前」标记（弹窗时代无法表达，用户不知道现在连的是哪个）
 * · 可重复扫描（弹窗扫一次就关了）
 * · 空态给出完整排障引导（不再是弹窗里一段塞满的小字）
 *
 * 数据源仍是 [SessionScanner.scan]，其解析逻辑已有单测覆盖；
 * 过滤逻辑抽成 [filterSessions] 纯函数，同样可单测。
 */
class SessionFragment : Fragment() {

    /**
     * 点选会话后由 Activity 处理。
     *
     * 语义已从「直接切换」改为「打开详情页」—— 原来误点一下就切走了，
     * 想切回还得再扫一次端口段。详情页里再决定是否切换。
     */
    var onSessionPicked: ((SessionScanner.Session) -> Unit)? = null

    /**
     * 列表项上直接点「切换」时回调（一步切到该会话，不走详情页）。
     *
     * 与 [onSessionPicked] 分开：那个是「看详情」（重命名/复制地址/
     * 恢复命令），而切换是最高频的动作 —— 在几个会话间来回看时
     * 不该每次都走一遍详情页。
     */
    var onSessionSwitch: ((SessionScanner.Session) -> Unit)? = null

    /**
     * 扫描端口的范围（由 Activity 从偏好读取后注入）。
     *
     * 用回调而非让 Fragment 直接持有 ScanPortPrefs：与
     * [lanDiscoveryEnabled] 等保持一致 —— Fragment 只依赖宿主提供的
     * 行为，不关心它从哪读；也便于测试时替换成固定范围。
     */
    var scanPortRange: () -> Pair<Int, Int> = { PortScanRange.DEFAULT_START to PortScanRange.DEFAULT_END }

    /** 由 Activity 实现，供列表项点击时回调。 */
    interface Actions {
        fun onSessionOpen(session: SessionScanner.Session)
    }

    private lateinit var list: RecyclerView
    private lateinit var hint: TextView
    private lateinit var search: EditText
    private lateinit var adapter: SessionAdapter
    private lateinit var rescanBtn: Button

    /** 扫描中标志：防止连点起多个扫描池（每次扫描是 11 线程并发探测）。 */
    private var scanning = false

    /** 全量扫描结果；过滤只影响展示，不重新扫描。 */
    private var allSessions: List<SessionScanner.Session> = emptyList()

    /**
     * UDP 广播监听器（被动发现会话）。
     *
     * 与 [扫描][rescan] **并存**，不是替代关系：
     * · 广播快（毫秒级）但常被路由器拦（AP 隔离 / 组播过滤）
     * · 扫描慢（数秒）但更可靠
     * 两者结果由 [BeaconProtocol.merge] 合并，任一通路可用即可发现会话。
     */
    private var beaconListener: BeaconListener? = null

    /** 最近一次**扫描**得到的会话（广播结果另行保存，渲染时合并）。 */
    private var scannedSessions: List<SessionScanner.Session> = emptyList()

    /** 最近一次**广播**得到的会话。 */
    private var beaconSessions: List<SessionScanner.Session> = emptyList()

    /**
     * 广播发现会话后回调（供 Activity 实现「自动连接」策略）。
     *
     * 传的是**合并后**的完整列表而非仅广播结果 —— 自动连接的判据是
     * 「总共发现几个会话」，只数广播结果会漏掉扫描发现的那些。
     */
    var onBeaconDiscovered: ((List<SessionScanner.Session>) -> Unit)? = null

    /** 当前连接的端口，用于标「当前」。 */
    private var currentPort: Int? = null

    /** 排序方式（由 LocalPrefs 提供初值）。 */
    private var sortOrder: String = SessionOrganizer.Order.PORT.key

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?,
    ): View = inflater.inflate(R.layout.fragment_sessions, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        list = view.findViewById(R.id.session_list)
        hint = view.findViewById(R.id.session_hint)
        search = view.findViewById(R.id.session_search)

        adapter = SessionAdapter(
            onPick = { s -> onSessionPicked?.invoke(s) },
            localSuffix = getString(R.string.session_local_host),
            onSwitch = { s -> onSessionSwitch?.invoke(s) },
        )
        list.layoutManager = LinearLayoutManager(requireContext())
        list.adapter = adapter

        rescanBtn = view.findViewById(R.id.btn_rescan)
        rescanBtn.setOnClickListener { rescan() }
        // 长按扫描按钮切换排序：不额外占竖向空间（手机上很宝贵），
        // 且「重新扫描」与「换个方式看列表」语义相近，放一起自然
        rescanBtn.setOnLongClickListener {
            showSortMenu()
            true
        }

        // 输入即过滤。会话数量不大，无需 debounce。
        search.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) = render()
        })

        rescan()

        // 补跑「视图就绪前收到的发现请求」。
        // 场景：Activity 在连接失败时调 triggerDiscovery，而此时本页
        // 可能还没创建过视图（用户从未点过「会话」tab）—— 那次请求
        // 被记在 scanOnViewReady 里，此处补跑，否则会被静默丢弃。
        if (scanOnViewReady) {
            scanOnViewReady = false
            triggerDiscovery()
        }
    }

    /**
     * 局域网扫描的最新进度（网段前缀, 第几轮）。
     *
     * 后台线程写、UI 线程读，仅存一对小值（引用赋值本身是原子的），
     * 不加锁 —— 读到上一轮的旧值最坏只是提示慢半拍，不影响正确性。
     */
    private var lanProgress: Pair<String, Int>? = null

    /**
     * 记录扫描进度（后台线程调用）。
     *
     * 只存值不碰控件：lay out 必须在 UI 线程改。
     */
    private fun reportLanProgress(prefix: String, round: Int) {
        lanProgress = prefix to round
    }

    /** 由 Activity 告知当前连接端口，用于渲染「当前」标记。 */
    fun setCurrentPort(port: Int?) {
        currentPort = port
        if (isAdded) render()
    }

    /**
     * 扫描目标：（主机, 当前端口）。
     *
     * 由 Activity 提供而非本 Fragment 自己读地址栏 —— 地址栏在设置页的
     * Fragment 里，两者互不可见。让 Activity 做这层协调：它天然是跨页
     * 状态的持有者。
     *
     * 未设置时回落 127.0.0.1（USB 反向转发场景）。
     *
     * 注意：现在它只决定「当前端口」与「用户显式指的那个主机」，
     * **不再是唯一的扫描范围** —— 局域网自动发现会额外扫本网段。
     */
    var scanTargetProvider: (() -> Pair<String, Int?>)? = null

    /** 提供历史里用过的其它主机（不含当前主机），供扫描时一并探测。 */
    var historyHostProvider: (() -> List<String>)? = null

    /**
     * 是否启用局域网自动发现。由偏好控制。
     *
     * 关掉它时只扫「当前主机 + 历史主机」—— 弱信号或大网段下，
     * 全子网探测会有可感的延迟与耗电，要允许用户关。
     */
    var lanDiscoveryEnabled: () -> Boolean = { true }

    /**
     * 重新扫描。
     *
     * 扫描范围分三段，按「命中概率」从高到低：
     *   1. 当前主机（用户上次连成功的那个，最可能还在）
     *   2. 历史主机（换过 WiFi / 换过电脑时留下的）
     *   3. 本机所在网段的候选 IP（局域网自动发现，免去手填 IP）
     *
     * 为什么不再是单一主机：此前扫不到时用户只能自己猜到 IP 填进地址栏，
     * 而「猜 IP」这件事本身就不该由用户做 —— 手机和电脑在同一网段，
     * 探测一遍就能找到。这正是「每次都要插 USB」的根因。
     *
     * 必须在后台线程 —— 扫描是阻塞 IO（每个主机 11 个端口并发探测）。
     */
    fun rescan() {
        // 防重复点击：每次扫描会起线程池，连点会起多个
        if (scanning) return
        scanning = true
        setScanButtonBusy(true)
        startWaitHint()

        val target = scanTargetProvider?.invoke() ?: ("127.0.0.1" to null)
        val currentHost = target.first.ifBlank { "127.0.0.1" }
        currentPort = target.second
        val historyHosts = historyHostProvider?.invoke().orEmpty()
        val useLan = lanDiscoveryEnabled()
        hint.text = getString(R.string.session_scan_hint)

        thread {
            // 直接主机（当前 + 历史）：精确探测，每个都扫端口段
            val direct = SubnetCandidates.merge(listOf(currentHost), historyHosts)
            val found = ArrayList<SessionScanner.Session>()
            // 用可配的端口范围：服务端的起始端口可被 CLAUDE_CODE_MOBILE_PORT
            // 指定、且被占用时会自动顺延，写死 5680-5690 会在用户改了起始
            // 端口后**永远扫不到**（服务明明起来了，手机上看不到）
            val (scanStart, scanEnd) = scanPortRange()
            for (h in direct) {
                found.addAll(SessionScanner.scan(h, scanStart, scanEnd))
            }

            // 局域网发现：扫本机网段里的候选 IP。
            // 跳过已在 direct 里的，避免对同一主机重复请求。
            if (useLan) {
                val lanTargets = LanScanner.candidates().filterNot { direct.contains(it) }
                if (lanTargets.isNotEmpty()) {
                    // 同样传入可配端口段 —— 否则局域网发现会固定在默认段，
                    // 用户改用 6000 起的主机永远扫不到（Direct 路径能扫到，
                    // LAN 路径扫不到，表现为「手动填能连、自动发现找不到」）
                    found.addAll(
                        LanScanner.scan(lanTargets, PortScanRange.portsOf(scanStart, scanEnd)) {
                            prefix, round ->
                            // 三层搜索的进度：让用户看到「正在搜哪个网段、第几轮」，
                            // 而不是对着一个不动的「正在搜索…」怀疑程序卡死
                            reportLanProgress(prefix, round)
                        }
                    )
                }
            }

            // 去重：同一 (host, port) 可能被 direct 与 lan 同时探到
            val deduped = found
                .distinctBy { it.host to it.port }
                .sortedWith(compareBy({ it.host }, { it.port }))

            activity?.runOnUiThread {
                if (!isAdded) return@runOnUiThread
                lanProgress = null
                // 存进 scannedSessions 而非 allSessions：渲染时要与广播
                // 结果合并（见 mergeAndRender），直接赋值会让广播发现
                // 的会话在扫描完成后消失
                scannedSessions = deduped
                scanning = false
                setScanButtonBusy(false)
                stopWaitHint()
                mergeAndRender()
            }
        }
    }

    /**
     * 开始监听广播。
     *
     * 只在页面可见时跑：长期持有 MulticastSocket 会占住网卡与电源，
     * 且网络切换后旧 socket 已失效，需要重建。
     */
    private fun startBeacon() {
        if (beaconListener != null) return
        val l = BeaconListener { sessions ->
            beaconSessions = sessions
            activity?.runOnUiThread {
                if (isAdded) {
                    mergeAndRender()
                    onBeaconDiscovered?.invoke(sessions)
                }
            }
        }
        l.start()
        beaconListener = l
    }

    private fun stopBeacon() {
        beaconListener?.stop()
        beaconListener = null
        // 清空广播结果：再见时它们可能已失效（电脑休眠/换网）
        beaconSessions = emptyList()
    }

    /**
     * 合并广播与扫描结果并渲染。
     *
     * 抽成一处：两条发现通路都会触发渲染，若各自实现合并逻辑，
     * 必然出现「广播刷新后扫描结果丢了」这类问题。
     */
    private fun mergeAndRender() {
        allSessions = BeaconProtocol.merge(beaconSessions, scannedSessions)
        render()
    }

    override fun onResume() {
        super.onResume()
        startBeacon()
    }

    override fun onPause() {
        super.onPause()
        // 离开页面即停：省电，且避免网络切换后拿到失效的 socket
        stopBeacon()
        stopWaitHint()
    }

    override fun onDestroyView() {
        stopBeacon()
        stopWaitHint()
        super.onDestroyView()
    }

    /**
     * 扫描期间的等待提示。
     *
     * ## 为什么需要（基于实测）
     *
     * 实测 **CLI 启动到首条广播需 13.3 秒**（加载 7487 个模块）。
     * 用户重启 CLI 后盯着手机等待时，若界面毫无反馈，13 秒足够让人
     * 判定「又没生效」并放弃。明确说出「要等十几秒」用户才愿意等。
     *
     * 用周期性刷新而非一次性提示：文案随等待时长变化
     *（前 15 秒为 CLI 开脱，之后转为网络排查建议）。
     */
    private fun startWaitHint() {
        stopWaitHint()
        val startedAt = System.currentTimeMillis()
        val hint = hintText ?: return
        waitHintTask = object : Runnable {
            override fun run() {
                if (!scanning) return
                val elapsed = System.currentTimeMillis() - startedAt
                val text = ConnectionHint.waitingHint(elapsed) ?: return
                // 接上三层搜索的进度：让用户看到搜索**确实在推进**
                //（换网段 / 换轮次），而不是对着一行不动的字怀疑卡死
                val progress = lanProgress?.let { (prefix, round) ->
                    "\n正在搜 $prefix.0/24 · 第 $round 轮"
                }.orEmpty()
                hint.text = text + progress
                hint.visibility = View.VISIBLE
                hint.postDelayed(this, WAIT_HINT_REFRESH_MS)
            }
        }
        hint.postDelayed(waitHintTask!!, WAIT_HINT_REFRESH_MS)
    }

    /** 停止等待提示并隐藏。扫描结束、离开页面时必须调用。 */
    private fun stopWaitHint() {
        waitHintTask?.let { hintText?.removeCallbacks(it) }
        waitHintTask = null
        hintText?.visibility = View.GONE
    }

    /** 等待提示的刷新间隔（与文案变化节奏匹配，无需更频繁）。 */
    private val WAIT_HINT_REFRESH_MS = 2_000L

    private var waitHintTask: Runnable? = null

    /** 会话页的提示文案控件（懒查找，避免侵入 Views 数据类）。 */
    private val hintText: android.widget.TextView?
        get() = view?.findViewById(R.id.session_hint)

    /**
     * 由 Activity 主动触发的会话发现（广播 + 扫描）。
     *
     * **修掉的真实缺陷**：此前发现只在 `onResume` 跑 —— App 启动后
     * 停在「对话」页时，广播监听与扫描**根本不会启动**。用户拔掉 USB
     * 重开 App 时，明明局域网里有会话却一直连不上。
     *
     * 抽成公开方法供 Activity 在「连接连续失败」时调用。
     * 已扫描中则跳过（避免并发扫描互相干扰）。
     */
    fun triggerDiscovery() {
        if (scanning) return
        // 视图尚未就绪（Fragment 未创建视图，或已销毁）时记下请求，
        // 待 onViewCreated 后补跑 —— 否则请求被静默丢弃
        if (view == null) {
            scanOnViewReady = true
            return
        }
        startBeacon()
        rescan()
    }

    /** 视图就绪前收到的发现请求（onViewCreated 后补跑）。 */
    private var scanOnViewReady = false

    /** 弹出排序方式选择。 */
    private fun showSortMenu() {
        val orders = SessionOrganizer.Order.entries
        val labels = orders.map {
            when (it) {
                SessionOrganizer.Order.PORT -> getString(R.string.sort_by_port)
                SessionOrganizer.Order.LABEL -> getString(R.string.sort_by_label)
                SessionOrganizer.Order.ACTIVITY -> getString(R.string.sort_by_activity)
            }
        }.toTypedArray()
        android.app.AlertDialog.Builder(requireContext())
            .setTitle(R.string.session_sort_title)
            .setItems(labels) { _, which ->
                sortOrder = orders[which].key
                render()
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /**
     * 扫描期间禁用按钮并改文案。
     *
     * 不禁用的话用户会连点，每次起一个 11 线程的探测池 ——
     * 而扫描本身要几秒，连点会让结果错乱（后发的先返回）。
     */
    private fun setScanButtonBusy(busy: Boolean) {
        rescanBtn.isEnabled = !busy
        rescanBtn.text = getString(if (busy) R.string.session_scanning else R.string.rescan_sessions)
    }

    /**
     * 渲染：先按搜索词过滤，再交给 adapter。
     *
     * 过滤用 [filterSessions] 纯函数 —— 抽出来是为了可单测。
     * 过滤逻辑看着简单，但「空查询应返回全部」与「大小写不敏感」
     * 这两点最容易写错（写成 startsWith 或区分大小写，用户会以为列表空了）。
     */
    private fun render() {
        val filtered = filterSessions(allSessions, search.text?.toString().orEmpty())
        // 分组与排序由 SessionOrganizer 做（纯逻辑已单测），此处只取结果
        adapter.submitGroups(
            SessionOrganizer.group(filtered, SessionOrganizer.Order.from(sortOrder)),
            currentPort,
        )
        hint.text = when {
            allSessions.isEmpty() -> getString(R.string.session_empty)
            filtered.isEmpty() -> getString(R.string.session_no_match)
            else -> getString(R.string.session_found, filtered.size)
        }
        // 空列表时按钮文案改为引导 —— 用户此时最需要的是「怎么才能看到会话」，
        // 而不是一个含义不明的「重新扫描」
        if (!scanning) {
            rescanBtn.text = getString(
                if (allSessions.isEmpty()) R.string.session_scan_now else R.string.rescan_sessions,
            )
        }
    }

    companion object {
        /**
         * 按关键词过滤会话。纯函数，可单测。
         *
         * @param query 空白或空串时返回全部（不是返回空列表 —— 那会让
         *   用户一进页面就看到「未发现会话」，以为服务端没起）
         */
        fun filterSessions(
            sessions: List<SessionScanner.Session>,
            query: String,
        ): List<SessionScanner.Session> {
            val q = query.trim()
            if (q.isEmpty()) return sessions
            val lower = q.lowercase()
            return sessions.filter {
                it.label.lowercase().contains(lower) ||
                    it.cwd.lowercase().contains(lower) ||
                    it.port.toString().contains(lower)
            }
        }
    }
}
