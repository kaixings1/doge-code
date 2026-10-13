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
class MainActivity : AppCompatActivity(),
    SettingsFragment.Actions,
    DiagnosticsFragment.Host,
    ConfigFragment.Host,
    SessionDetailFragment.Host,
    SessionFragment.Actions {

    private lateinit var prefs: SharedPreferences
    private lateinit var adapter: ChatAdapter

    /**
     * 真·并行连接：所有会话各自一条连接（key → 连接单元）。
     *
     * ## 与旧实现的区别
     *
     * 改造前是单个 `client`/`store` 字段，切换会话 = 关旧连新（见
     * switchToSession 旧实现），同一时刻只能连一个 CLI。现在列表里的
     * 每个会话各持一条长连接，后台持续收推送，切换只是改 [activeKey]。
     *
     * ## 并发安全
     *
     * 所有 BridgeClient 的事件回调都切回主线程（见 BridgeClient 类注释），
     * 故本 map 只在主线程读写，无需加锁。
     */
    private val connections = LinkedHashMap<String, SessionConn>()

    /**
     * 当前活动会话的 key（null = 尚未选定任何远端会话）。
     *
     * 「活动」决定两件事：① 哪个会话的 store 内容渲染到对话列表；
     * ② 发送/中断/编辑走哪个 backend。其余会话照常收消息，但不碰 UI。
     */
    private var activeKey: String? = null

    /** 僵死连接回收定时器（防卡死）。见 [startConnectionSweeper]。 */
    private var sweeperHandler: android.os.Handler? = null
    private var sweeperRunnable: Runnable? = null

    /**
     * 活动会话的连接单元（无则 null）。
     *
     * 用 getter 而非缓存字段：activeKey 会在切换时变，缓存字段容易忘记同步。
     */
    private val activeConn: SessionConn?
        get() = activeKey?.let { connections[it] }

    /**
     * 是否有**任意**会话已连上。
     *
     * 真·并行下「连上了吗」不能再问单条连接：自动连接/失败统计的语义是
     *「这台手机上是否已有可用的远端通道」，故任一连接在线即为真。
     * 旧代码的 `client.isConnected` 全替换为本属性。
     */
    private val anyConnected: Boolean
        get() = connections.values.any { it.connected }

    private lateinit var list: RecyclerView
    private lateinit var msgInput: EditText
    private lateinit var urlInput: EditText
    private lateinit var secretInput: EditText
    private lateinit var statusText: TextView
    private lateinit var dot: View
    private lateinit var sendBtn: ImageButton
    private lateinit var stopBtn: ImageButton
    private lateinit var progress: View

    /** 应用锁解锁结果回调（系统锁屏凭据界面返回）。 */
    private lateinit var appLockLauncher: androidx.activity.result.ActivityResultLauncher<android.content.Intent>

    /**
     * 敏感操作（run_command）事中确认的结果回调。
     *
     * 与 [appLockLauncher] 复用同一系统界面（设备锁屏凭据），但语义不同：
     * 前者是「打开 App 的门禁」，本者是「执行某条命令的当场确认」。
     * 用独立 launcher 而非复用，是因为二者回调逻辑不同且可能并发。
     */
    private lateinit var approvalLauncher: androidx.activity.result.ActivityResultLauncher<android.content.Intent>

    /** 当前待确认动作的回调（由 [ApprovalCoordinator.Prompt] 设置）。 */
    private var pendingApproval: ((Boolean) -> Unit)? = null

    /** 事中确认协调器（懒建，绑定本 Activity 的 launcher）。 */
    private val approvalCoordinator: ApprovalCoordinator by lazy {
        ApprovalCoordinator(prompt = ApprovalCoordinator.Prompt { action, onResult ->
            // 必须在 UI 线程弹窗；worker 线程调用时 post 过去。
            val posted = android.os.Handler(android.os.Looper.getMainLooper()).post {
                askDeviceCredential(action, onResult)
            }
            posted
        })
    }

    /** 已发送但还没收到 queued 回执的消息 id → requestId */
    private val pending = mutableMapOf<String, String>()

    /** 批量选择模式下的选中 id 集合（唯一事实来源，见 BatchSelection）。 */
    private var selectedIds: Set<String> = emptySet()
    /**
     * 已发出、等待服务端回推去重的 requestId 集合。
     *
     * 旧去重依赖「本地存在文本相同且仍 SENDING 的 user 消息」，但 queued
     * 回执几乎必然先于 user 回推到达（回推要等 enqueue→消息落地→推送 effect），
     * 届时状态已转 QUEUED，旧判据失效 → 自己发的消息被重复渲染一次。
     *
     * 现改为精确匹配：手机发出的消息在 enqueue 时把 requestId 作为 uuid 透传，
     * 服务端推送回所有手机时带回该 uuid（sourceRequestId）。命中本集合即说明
     * 是「自己刚发、被回推」的那条，去重并从集合移除。
     * 不再受 queued 回执到达时序影响。
     */
    private val sentReqIds = mutableSetOf<String>()
    private var interactive = true

    /** 当前会话标签，用于通知标题区分来源（多会话并存时必需）。 */
    private var sessionLabel: String? = null

    /**
     * 待处理的权限对话框：requestId → Dialog。
     *
     * 需要按 requestId 索引，因为服务端可能撤销某个请求
     * （本地终端先批准了），此时要精确关掉那一个而不是全部。
     * 用 Map 而非单个引用：多设备/多次请求可能并存。
     */
    private val permissionDialogs = mutableMapOf<String, android.app.AlertDialog>()

    /** 工具活动区控件。 */
    private lateinit var activityPanel: android.view.View
    private lateinit var activityText: TextView

    /**
     * 流式增量累积的预览文本。
     *
     * 定稿消息（Incoming assistant）到达时必须清空 —— 定稿是权威版本。
     * 增量可能因节流/断线丢失，若不清空会永久停留在残缺文本上，
     * 用户看到的内容比实际少且无从修复。
     */
    private val streamingBuffer = StringBuilder()

    /** 上一次收到的增量 seq，用于识别跳号（中间丢了片段）。 */
    private var lastDeltaSeq = 0

    /** 活动区保留的行数上限；超出的丢弃最旧的，避免长任务刷屏。 */
    private val activityLines = ArrayDeque<String>()

    /** 子代理终止按钮（活动区里，有子代理在跑时才显示）。 */
    private lateinit var agentStopBtn: ImageButton

    /**
     * 输入手段：图片附件（拍照/相册）与语音输入。
     *
     * 已从本类抽出（约 120 行）—— 只依赖 Context 与 startActivityForResult，
     * 不碰对话页控件，是边界清晰的第二块。
     */
    private lateinit var inputActions: InputActions

    /** 草稿持久化（独立类，逻辑与边界已单测）。 */
    private lateinit var draftStore: DraftStore

    /** 本地偏好（纯客户端设置，见 LocalPrefs）。 */
    private lateinit var localPrefs: LocalPrefs

    /**
     * 扫描端口范围（自由数值型偏好，与 LocalPrefs 分开存放）。
     *
     * 独立一个存储的原因见 ScanPortPrefs 的说明：LocalPrefs 是枚举型，
     * 它的 set() 会拒绝预定义列表外的值，装不下 1..65535 的端口。
     */
    private lateinit var scanPortPrefs: ScanPortPrefs
    private lateinit var ipRangePrefs: IpRangePrefs

    /**
     * 双指缩放的倍率存储（自由数值型，与枚举型的 LocalPrefs 分开）。
     *
     * 与「字号」预设的关系：最终字号 = 预设档 × 捏合倍率。
     * 分开存才不会互相覆盖 —— 用户捏到 1.5 后又去设置里选「大」，
     * 应当得到 1.2 × 1.5 而不是丢失其中一个。
     */
    private lateinit var pinchZoomPrefs: PinchZoomPrefs

    /**
     * 捏合过程中的**临时**倍率（尚未落盘）。
     *
     * 为什么需要：`onScale` 一次手势触发几十次，每次都读 SharedPreferences
     * 是无谓开销。用内存变量承载过程值，手势结束（onScaleEnd）才写盘。
     */
    private var pinchZoomPrefsLive: Float? = null

    /**
     * 工作模式存储（远端 / 本地）。
     *
     * 独立于 LocalPrefs：模式是应用级状态而非「偏好」，且它的变更会
     * 触发整套 UI 重建（隐藏连接相关入口），与普通偏好「改完重绘」不同。
     */
    private lateinit var appModePrefs: AppModePrefs

    /**
     * 当前工作模式（启动时从 [appModePrefs] 读入）。
     *
     * 默认 LAN —— 与升级前行为一致（原 REMOTE = 连电脑）。云端自带
     * 后端（[localBackend]）仅在 CLOUD 模式使用；LAN/TUNNEL 都走
     * [remoteBackend]（连电脑 CLI），区别只在地址来源。
     */
    private var appMode: AppMode = AppMode.LAN

    /** 本地模式的存储（工作区 + Provider 配置）。 */
    private lateinit var localStore: LocalPrefsStore

    /** 已知会话落库（多会话管理）：连接成功时记录，会话页据此列出三模式会话。 */
    private lateinit var knownSessions: KnownSessionStore

    /**
     * 本地模式后端。
     *
     * 与远端连接单元并存：两者都实现了 [AgentBackend]，
     * 但事件都汇到同一个 `onEvent` —— UI 不区分模式。
     */
    private lateinit var localBackend: LocalAgentBackend

    /**
     * 当前模式对应的后端 —— 发送/中断/编辑**只走这里**。
     *
     * 为什么要这个单一入口：发送路径在 MainActivity 里有 4 处
     *（正常发送、带图发送、失败重试、编辑重发）。若各处自己判模式，
     * 漏改一处就会表现为「本地模式下那个入口点了没反应」——
     * 而这类 bug 只在特定操作路径上出现，极难发现。
     *
     * 远端侧指向**活动会话**的 backend（多会话并行下，发消息只发给
     * 当前正在看的那条连接）。
     */
    private val activeBackend: AgentBackend
        get() = if (appMode.isCloudAgent) localBackend
        else activeConn?.backend ?: NO_BACKEND

    /**
     * 「无活动会话」时的占位后端（**不能抛异常**）。
     *
     * ## 为什么必须存在（否则崩溃）
     *
     * 真·并行改造前 `client` 是常驻单例，`activeBackend.isReady` 一定有值。
     * 现在远端模式下若尚未选定/连上任何会话，`activeConn` 为 null ——
     * 若此处直接 `error(...)`，那么用户只要在没连会话时点一下「发送」
     * （sendCurrent 里 `if (!activeBackend.isReady)`）就会抛
     * IllegalStateException 崩溃。这类「未连接时的日常点击」是最常见的
     * 路径，不能崩。
     *
     * 改用占位后端：`isReady=false` 让既有的「未连接，请先在设置里连接」
     * 守卫自然生效；send/interrupt 等返回 false（no-op），不产生副作用。
     */
    private val NO_BACKEND: AgentBackend = object : AgentBackend {
        override val isReady: Boolean get() = false
        override var onEvent: ((BridgeClient.Event) -> Unit)? = null
        override fun send(text: String, requestId: String): Boolean = false
        override fun interrupt() {}
        override fun editMessage(newText: String, requestId: String): Boolean = false
        override fun close() {}
    }

    /**
     * 活动会话的远端后端（供仅远端路径使用的接口，如 setConfig/renameSession）。
     *
     * 与 [activeBackend] 的区别：那个返回 [AgentBackend]（两种后端共用），
     * 这个明确要求远端后端 —— 因为 setConfig/renameSession 是远端专属能力
     *（本地模式没有「远端配置」概念）。未连接活动会话时为 null。
     */
    private val activeRemoteBackend: RemoteAgentBackend?
        get() = activeConn?.takeIf { it.connected }?.backend

    /**
     * 活动连接的 [BridgeClient]（旧代码的 `client.xxx` 兼容别名）。
     *
     * 语义 = 「当前活动会话那条连接的 client」。无活动会话/未连接时 null。
     * 用于 isConnected / lastDiagnosis / setConfig 等远端专属查询；
     * 写操作（setConfig/renameSession）在未连接时本就是 no-op（旧代码
     * 有 `if (!client.isConnected) return` 守卫），保持同样的判空语义。
     */
    private val client: BridgeClient?
        get() = activeConn?.takeIf { it.connected }?.backend?.bridge

    /**
     * 活动会话的历史存储（兼容旧代码的 `store.xxx` 引用）。
     *
     * ## 为什么是 getter 而非字段
     *
     * 改造前 `store` 是单例字段。现在每个会话各持一个 [MessageStore]
     * （见 [SessionConn] 的注释：共享实例会让后台会话写错历史文件）。
     * 保留 `store` 这个名字作为「**当前界面所显示的那份历史**」的别名：
     * · CLOUD 模式 → 本地历史 [localMsgStore]（云端没有远端会话）
     * · 远端模式 → 活动会话的 store
     *
     * 这样绝大多数旧引用（append 落盘、清空、加载）无需改动，语义也正确。
     * 无活动会话的远端模式返回 null，调用方须判空（用 [storeOrNull]）。
     */
    private val store: MessageStore?
        get() = if (appMode.isCloudAgent) localMsgStore else activeConn?.store

    /**
     * 本地/云端模式的历史存储。
     *
     * 与远端会话的历史分开：本地模式的 sessionKey 由工作区决定
     *（`local-<dir>-<hash>`），换工作区换历史文件（见 refreshSessionScope）。
     * 这个实例永远存在（用户可能从不用云端模式，但持有它开销可忽略）。
     */
    private lateinit var localMsgStore: MessageStore

    /**
     * 任务完成的语音播报（见 VoiceAnnouncer）。
     *
     * 与通知分开：通知只在 App 不在前台时弹（见 maybeNotify 的 hasWindowFocus
     * 早退），而按用户要求语音**前台后台都播报** —— 正因如此它不能塞进
     * maybeNotify 里，否则前台时会被一起早退掉。
     */
    private lateinit var voiceAnnouncer: VoiceAnnouncer

    /** 连接失败历史（线 C2）。 */
    private lateinit var diagnosisLog: DiagnosisLog

    /** 当前配置的值来源（线 C3）。 */
    private var configSourceLabels: ConfigSourceLabels = ConfigSourceLabels.empty()

    /**
     * 高频读取的两个偏好，缓存在字段里。
     *
     * 为什么缓存：`append` 与 `onStreamDelta` 每条消息都调用，
     * 每次都读 SharedPreferences 是无谓开销（增量可达每秒几十次）。
     * 在 applyLocalPrefs 里同步更新。
     */
    private var autoScrollPrefsCache = true
    private var streamPrefsCache = true

    /**
     * 设置类弹窗（远程配置/地址历史/诊断/重命名/导出）。
     *
     * 已从本类抽出（约 250 行）—— 这些功能只依赖 Context 与少量状态，
     * 不碰对话页控件，是边界最清晰、风险最低的一刀。
     */
    private lateinit var settingsActions: SettingsActions

    // ── 多页结构（任务 #21）──
    private var chatFragment: ChatFragment? = null
    private var sessionFragment: SessionFragment? = null
    private var settingsFragment: SettingsFragment? = null
    private lateinit var tabSessions: TextView
    private lateinit var tabChat: TextView
    private lateinit var tabSettings: TextView

    /** 当前 tab（返回键行为需要知道在哪个页）。 */
    private var currentTab = TAB_INDEX_CHAT

    /** 冷启动的初始化是否已完成（保证 onStart 里的自动连接只跑一次）。 */
    private var coldStartDone = false

    // ── 对话搜索状态 ──
    /** 当前查询命中的消息下标（升序）。 */
    private var matchIndices: List<Int> = emptyList()

    /** 当前停留的命中位置。 */
    private var currentMatch: Int = -1

    /** 搜索栏是否展开。 */
    private var searchVisible = false

    /**
     * 未看到的新消息条数（用于右下角悬浮提示）。
     *
     * 只在「用户不在底部」时累加 —— 已在底部说明正看着新内容。
     * 滚到底部或点提示时清零。
     */
    private var unseenCount = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 必须在 setContentView **之前**设主题 —— 这是 Android 的硬要求，
        // 之后调用不会生效（窗口已按旧主题创建）
        applyThemePref()
        setContentView(R.layout.activity_main)

        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        // 本地/云端模式的历史（远端会话的历史由各自的 SessionConn 持有）
        localMsgStore = MessageStore(this)
        draftStore = DraftStore(this)
        localPrefs = LocalPrefs(this)
        scanPortPrefs = ScanPortPrefs(this)
        ipRangePrefs = IpRangePrefs(this)
        pinchZoomPrefs = PinchZoomPrefs(this)
        appModePrefs = AppModePrefs(this)
        localStore = LocalPrefsStore(this)
        knownSessions = KnownSessionStore(this)
        diagnosisLog = DiagnosisLog(this)
        settingsActions = SettingsActions(this, settingsHost)
        // 应用锁解锁结果的回调：必须在调用 setupAppLockGate 前注册好
        // （ActivityResultLauncher 只能在初始化期注册一次）。
        appLockLauncher = registerForActivityResult(
            androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult(),
        ) { result ->
            // RESULT_OK = 用户成功解锁；否则（取消/失败）不解锁就退出 App
            if (result.resultCode == android.app.Activity.RESULT_OK) {
                removeAppLockOverlay()
            } else {
                finish()
            }
        }
        // 敏感操作事中确认的结果回调
        approvalLauncher = registerForActivityResult(
            androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult(),
        ) { result ->
            val cb = pendingApproval
            pendingApproval = null
            cb?.invoke(result.resultCode == android.app.Activity.RESULT_OK)
        }
        // 应用锁门禁（设备锁屏凭据）：必须在任何内容可见前拦截。
        // 做法是先盖一层全屏遮罩，解锁成功才移除 —— 这样下面的初始化
        // （setupFragments 等）照常执行，但用户看不到内容直到解锁。
        // 设备没设锁屏凭据或开关关闭时立即移除遮罩，零感知。
        setupAppLockGate()


        // 提前创建 TTS 引擎（初始化是异步的且较慢）：若等到第一次播报才建，
        // 那条播报常因引擎未就绪被吞掉。放在 onCreate 让它在用户连接、
        // 发消息这段时间里就绪。VoiceAnnouncer 内部对未就绪请求排队兜底。
        voiceAnnouncer = VoiceAnnouncer(this)

        inputActions = InputActions(this, object : InputActions.Host {
            override fun appendSystem(text: String) = this@MainActivity.append(ChatMessage.system(text))

            override fun appendToInput(text: String) {
                msgInput.setText(text)
                msgInput.setSelection(text.length)
                draftStore.save(text)
            }

            override fun currentInput(): String = msgInput.text.toString()
        })
        adapter = ChatAdapter()
        // 冷启动时立即应用偏好 —— 否则要等用户进设置页改一次才生效
        adapter.applyOptions(buildDisplayOptions())
        autoScrollPrefsCache = localPrefs.getBool(LocalPrefs.KEY_AUTO_SCROLL)
        streamPrefsCache = localPrefs.getBool(LocalPrefs.KEY_STREAMING)
        Notifications.ensureChannel(this)
        // Android 13+ 需运行时申请通知权限；拒绝也不影响主流程
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission("android.permission.POST_NOTIFICATIONS") !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf("android.permission.POST_NOTIFICATIONS"), 1001)
        }

        // 顶栏与底部导航在容器布局里，三个 tab 共享
        statusText = findViewById(R.id.status)
        dot = findViewById(R.id.dot)
        progress = findViewById(R.id.progress)
        // 状态栏点击的语义按当前状态分流：
        // · 未连接 → 立即重连。这是用户点它的**唯一动机**。
        //   此前没有任何手动重连入口：连败后客户端会停止重连（manualClose），
        //   用户只能杀进程重启 App —— 实测确认过（App 日志里再没有一条
        //   BridgeClient 输出，点界面也没反应）。
        // · 已连接 → 进诊断页看详情（原行为）。
        statusText.setOnClickListener { onStatusTapped() }
        dot.setOnClickListener { onStatusTapped() }

        // 顶栏搜索：目标是对话内容，故先切到对话页再展开搜索栏
        findViewById<android.widget.ImageButton>(R.id.btn_chat_search).setOnClickListener {
            if (currentTab != TAB_INDEX_CHAT) selectTab(TAB_INDEX_CHAT)
            toggleChatSearch(!searchVisible)
        }

        // 远端连接**不再**在此预创建：真·并行下每个会话各有一条连接，
        // 由 connectWith / ensureConnection 按需建立（见 SessionConn）。
        // 此前预建单个 client 是因为「同一时刻只有一条连接」；现在这个前提
        // 已不成立，预建反而会留下一条连不上任何地址的空连接。

        // 读取工作模式（默认 LAN，与升级前行为一致：原 REMOTE = 连电脑）。
        appMode = appModePrefs.get()

        // 本地模式后端：延迟创建（用户可能从不用本地模式，
        // 提前建会白白占用线程池与 KeyStore 访问）。
        // 注意 onEvent 走同一个处理方法 —— 两种模式的事件在 UI 处汇合，
        // 这是双模式架构「共享 UI」的关键
        localBackend = buildLocalBackend()
        // 冷启动时按当前模式与工作区切换一次历史文件（本地模式此前从未
        // 调过 useSession，永远落在 history-default.json —— 见 refreshSessionScope）
        refreshSessionScope()

        setupFragments()
        setupBottomNav()
        setupBackNavigation()

        // 注意：自动连接**不在这里**触发。
        // 实测证明 onCreate 阶段 Fragment 的 onViewCreated 不会执行
        //（内容视图尚未 attach 到窗口），此时 urlInput/msgInput 仍是未初始化
        // 的 lateinit —— 一访问就崩。改为在 onStart 里做（见下）。
    }

    /**
     * Activity 进入可见时，保证 Fragment 视图已就绪后再做依赖它们的事。
     *
     * 为什么不在 onCreate：
     * 实测（探针日志）证明 `commitNow()` 在 onCreate 阶段只把 Fragment 加进
     * FragmentManager，**不触发** onCreateView/onViewCreated ——
     * 于是 Activity 的 urlInput/msgInput 等字段永远拿不到值，
     * 第 168 行的自动连接一访问 lateinit 就崩。
     *
     * onStart 时 Fragment 视图必然已创建（Fragment 生命周期不会晚于
     * Activity 的 onStart），这是可靠的时机。
     *
     * 用 once 标志保证只执行一次 —— onStart 可能被多次调用（Activity
     * 从后台返回），而自动连接应当只在冷启动时发生一次。
     */
    /**
     * 应用锁门禁。
     *
     * 先盖全屏遮罩挡住下面的内容；再判是否需解锁：
     * · 不需锁（关 / 设备没设锁屏凭据）→ 立即移除遮罩，App 正常显示。
     * · 需锁 → 弹出系统解锁界面（指纹/人脸/PIN/图案/密码，由系统决定）：
     *   成功移除遮罩显示内容（见 appLockLauncher 回调）；
     *   失败/取消 → finish()，不解锁就不让看（避免「按返回就绕过锁」）。
     *
     * 遮罩用 window 最上层 View：盖在所有内容之上，解锁前用户看不到
     * 对话/历史/配置。
     */
    private var appLockOverlay: android.view.View? = null

    private fun setupAppLockGate() {
        val prefOn = localPrefs.getBool(LocalPrefs.KEY_APP_LOCK)
        // isKeyguardSecure 可能在某些设备上抛异常，按「不支持」降级，绝不卡死
        val hasCredential = runCatching {
            val km = getSystemService(android.content.Context.KEYGUARD_SERVICE)
                as android.app.KeyguardManager
            km.isKeyguardSecure
        }.getOrDefault(false)

        // 不需要锁（默认关闭 / 设备未设凭据）：完全不创建遮罩，零风险。
        // 原实现先 addContentView 纯黑遮罩、紧接着立即 removeView —— 但 onCreate
        // 阶段 window 尚未 attach，`removeView` 会抛异常被吞掉，遮罩**永久残留**
        // → 整块 App 纯黑（见 2026-10-11 黑屏事故）。不创建即无此竞态。
        if (!AppLock.shouldLock(prefOn, hasCredential)) return

        // 需要锁：创建纯黑遮罩盖住内容，再弹系统解锁界面。
        val overlay = android.view.View(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            isClickable = true // 拦截一切点击，防止遮罩下内容被误触
            isFocusable = true
        }
        val params = android.view.WindowManager.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
        )
        appLockOverlay = overlay
        // 延迟到 window 真正 attach 后再 add：此时 removeView 也才安全
        // （见 onAttachedToWindow 兜底）。
        window.decorView.post { runCatching { window.addContentView(overlay, params) } }

        val km = getSystemService(android.content.Context.KEYGUARD_SERVICE)
            as android.app.KeyguardManager
        val intent = km.createConfirmDeviceCredentialIntent(
            getString(R.string.app_lock_title),
            null,
        )
        if (intent == null) {
            // 极端情况下 intent 为 null（系统未提供解锁界面）→ 不拦，避免卡死
            removeAppLockOverlay()
            return
        }
        appLockLauncher.launch(intent)
    }

    /** 移除应用锁遮罩（解锁成功后，或兜底下）。 */
    private fun removeAppLockOverlay() {
        appLockOverlay?.let {
            runCatching { windowManager.removeView(it) }
            appLockOverlay = null
        }
    }

    /**
     * 兜底：window attach 完成后，若因任何路径（如解锁取消/finish 前）
     * 仍有遮罩残留，立即移除 —— 防止黑屏卡死。
     */
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // 仅在确实不需要锁、却因时序残留了遮罩时清理；需要锁时遮罩由
        // 解锁回调控制，此处不动。
        val prefOn = localPrefs.getBool(LocalPrefs.KEY_APP_LOCK)
        val hasCredential = runCatching {
            (getSystemService(android.content.Context.KEYGUARD_SERVICE)
                as android.app.KeyguardManager).isKeyguardSecure
        }.getOrDefault(false)
        if (!AppLock.shouldLock(prefOn, hasCredential)) removeAppLockOverlay()
    }

    override fun onStart() {
        super.onStart()
        if (coldStartDone) return
        coldStartDone = true

        // 视图就绪后恢复草稿（此前在 bindChatViews 里做过，这里再兜一次：
        // 若 Fragment 回调因任何原因未触发，至少有默认值不崩）
        if (::msgInput.isInitialized) {
            msgInput.setText(draftStore.load())
        }
        if (::urlInput.isInitialized && prefs.getBoolean(KEY_AUTOCONNECT, true)) {
            connectWith(urlInput.text.toString(), secretInput.text.toString())
        }
        startConnectionSweeper()
    }

    /**
     * 定期回收僵死的后台连接（防卡死）。
     *
     * ## 为什么需要
     *
     * 用户要求「列表里所有会话都保持连接、不设上限」。若一条会话长期
     * 失效（电脑关机、隧道子域过期），它的 [BridgeClient] 会一直按退避
     * 重试、占内存、刷日志。连接数随已知会话增长而不清理 → 最终拖慢甚至
     * 卡死 App。这正是用户说的「不可以卡死」要防的场景。
     *
     * ## 判据在 [SessionRouter.shouldRecycle]（已单测覆盖）
     *
     * 只回收**非活动 + 未连接 + 超静默阈值**的连接：正在看的、还连着的
     * 一律不动，避免抽掉用户正在用的会话。
     *
     * ## 周期选 60 秒
     *
     * 比静默阈值（5 分钟）小一个量级，保证僵死连接在阈值到达后的一分钟内
     * 被清掉；又不至于频繁扫（map 很小，扫描开销可忽略）。
     */
    private fun startConnectionSweeper() {
        stopConnectionSweeper()
        val h = android.os.Handler(android.os.Looper.getMainLooper())
        val runnable = object : Runnable {
            override fun run() {
                sweepIdleConnections()
                h.postDelayed(this, SWEEP_INTERVAL_MS)
            }
        }
        sweeperHandler = h
        sweeperRunnable = runnable
        h.postDelayed(runnable, SWEEP_INTERVAL_MS)
    }

    /** 停止回收定时器（onDestroy 调用），避免泄漏 Handler 与 Activity。 */
    private fun stopConnectionSweeper() {
        val runnable = sweeperRunnable ?: return
        sweeperHandler?.removeCallbacks(runnable)
        sweeperRunnable = null
        sweeperHandler = null
    }

    /** 执行一次回收扫描：关闭所有符合回收判据的连接。 */
    private fun sweepIdleConnections() {
        val now = System.currentTimeMillis()
        val dead = connections.values.filter { c ->
            SessionRouter.shouldRecycle(
                isActive = c.key == activeKey,
                connected = c.connected,
                userClosed = c.userClosed,
                lastActivityAt = c.lastActivityAt,
                now = now,
                idleRecycleMs = SessionRouter.DEFAULT_IDLE_RECYCLE_MS,
            )
        }
        for (c in dead) {
            runCatching { c.close() }
            connections.remove(c.key)
        }
    }

    /**
     * SettingsActions 的宿主实现。
     *
     * 用接口而非让 SettingsActions 直接持有 MainActivity：
     * 否则等于没拆，只是把耦合挪了个地方。
     */
    private val settingsHost = object : SettingsActions.Host {
        override fun loadHostHistory(): List<String> = this@MainActivity.loadHostHistory()

        override fun rememberHost(url: String) = this@MainActivity.rememberHost(url)

        override fun clearHostHistory() {
            this@MainActivity.prefs.edit().remove(KEY_HOSTS).apply()
        }

        override fun currentSessionLabel(): String? = sessionLabel

        override fun onSessionLabelChanged(label: String) {
            sessionLabel = label
        }

        override fun isConnected(): Boolean = this@MainActivity.client?.isConnected == true

        override fun sendConfig(key: String, value: Any?, label: String) {
            // 远端配置只作用于**活动会话**的连接：配置随连接走，
            // 非活动会话的配置不在本界面展示，也无从修改（避免改错对象）。
            val c = client ?: return
            if (key == "renameSession") {
                // 重命名走专用 WS 动作，不是 setConfig
                c.renameSession(value as String, ChatMessage.newId())
                return
            }
            c.setConfig(key, value, ChatMessage.newId())
            append(ChatMessage.system("已请求：$label"))
        }

        override fun appendSystem(text: String) = this@MainActivity.append(ChatMessage.system(text))

        override fun localHistory(): List<ChatMessage> = adapter.snapshot()

        override fun currentAddress(): String = urlInput.text.toString()

        override fun currentSecret(): String = secretInput.text.toString()

        override fun connectionStatusText(): String = statusText.text.toString()

        override fun lastFailure(): BridgeClient.Diagnosis? = client?.lastDiagnosis

        override fun retryConnect(url: String, secret: String) = this@MainActivity.connectWith(url, secret)
    }

    // ── 二级页面导航 ──

    /**
     * 打开一个二级页面。
     *
     * 用 add + addToBackStack（而非 replace）：
     * · 主 tab 的 Fragment 被 hide 而非销毁，返回时状态原样恢复
     * · 返回键由 FragmentManager 自动处理（弹出栈顶即回退）
     *
     * 不用 Navigation 组件：本工程的二级页面是固定的四个，
     * 引入 nav graph 与 safeargs 的收益不抵依赖成本。
     */
    private fun openPage(fragment: androidx.fragment.app.Fragment, tag: String) {
        val fm = supportFragmentManager
        if (fm.findFragmentByTag(tag) != null) return
        val tx = fm.beginTransaction()
        // 隐藏当前可见的主 tab
        chatFragment?.let { if (!it.isHidden) tx.hide(it) }
        sessionFragment?.let { if (!it.isHidden) tx.hide(it) }
        settingsFragment?.let { if (!it.isHidden) tx.hide(it) }
        tx.add(R.id.content, fragment, tag)
        tx.addToBackStack(tag)
        tx.commit()
    }

    /** 当前是否在二级页面上（返回键行为需要判断）。 */
    private fun inSubPage(): Boolean =
        supportFragmentManager.backStackEntryCount > 0

    // ── DiagnosticsFragment.Host ──

    override fun diagStatusText(): String = buildString {
        append("地址        ").append(savedAddress()).append('\n')
        append("状态        ").append(statusText.text).append('\n')
        append("密钥        ")
        append(if (secretInput.text.isNullOrBlank()) "未设置（服务端不做认证）" else "已设置")
        append('\n')
        append("客户端      ").append(if (client?.isConnected == true) "已连接" else "未连接")
    }

    /** 失败历史的展示文本（最多显示 [MAX_SHOWN] 条）。 */
    override fun diagHistoryText(): String {
        val records = diagnosisLog.load()
        if (records.isEmpty()) return "暂无失败记录"
        val shown = records.take(MAX_HISTORY_SHOWN)
        return shown.joinToString("\n") { r ->
            val t = java.text.SimpleDateFormat("MM-dd HH:mm:ss", java.util.Locale.getDefault())
                .format(java.util.Date(r.at))
            val code = if (r.httpCode != null) " [HTTP ${r.httpCode}]" else ""
            "$t$code\n  ${r.reason}\n  @ ${r.address}"
        }
    }

    override fun diagHistorySummary(): String = diagnosisLog.summaryLabel()

    override fun diagClearHistory() {
        diagnosisLog.clear()
    }

    override fun diagFailureText(): String {
        val d = client?.lastDiagnosis
            ?: return "暂无失败记录。\n若连接不正常，请对照下方的常见原因排查。"
        return buildString {
            append("原因        ").append(d.reason).append('\n')
            if (d.httpCode != null) append("HTTP 码     ").append(d.httpCode).append('\n')
            append("已重试      ").append(d.attempts).append(" 次")
        }
    }

    override fun diagReport(): String = buildString {
        append("=== doge-code 手机端诊断报告 ===\n")
        append(diagStatusText()).append("\n\n")
        append(diagFailureText()).append("\n")
    }

    override fun diagRetry() {
        connectWith(savedAddress(), secretInput.text.toString())
    }

    override fun diagUseUsb() {
        val usb = "http://127.0.0.1:$PORT"
        if (::urlInput.isInitialized) urlInput.setText(usb)
        connectWith(usb, secretInput.text.toString())
    }

    override fun diagClearFailure() {
        client?.clearDiagnosis()
        append(ChatMessage.system(getString(R.string.diag_cleared)))
    }

    // ── ConfigFragment.Host ──

    override fun configConnected(): Boolean = client?.isConnected == true

    override fun configApply(key: String, value: Any?, label: String) {
        client?.setConfig(key, value, ChatMessage.newId())
        append(ChatMessage.system("已请求：$label"))
    }

    // ── SessionDetailFragment.Host ──

    override fun detailSwitch(session: SessionScanner.Session) {
        switchToSession(session)
    }

    override fun detailRename(session: SessionScanner.Session) {
        // 重命名作用于**当前连接的**会话（服务端只有一个进程内标签），
        // 若目标不是当前会话，先切过去再改 —— 否则会改错对象
        if (session.port != currentPort()) {
            switchToSession(session)
        }
        settingsActions.promptRenameSession()
    }

    /**
     * 构造该会话可用的连接地址。
     *
     * 用 `currentHost()`（当前连接的主机名）而非会话自己的字段 ——
     * 会话的 `cwd` 是工作目录**路径**，拿它当主机名会拼出
     * `http://D:\proj:5680` 这种必然连不上的地址（原实现就是这样）。
     *
     * 地址构造**只在这一处**：调用方（详情页）只负责写剪贴板。
     * 此前详情页自己也拼了一份，两份不一致导致用户复制到错的地址。
     */
    override fun detailAddress(session: SessionScanner.Session): String =
        "http://${currentHost()}:${session.port}"

    // ── SessionFragment.Actions ──

    override fun onSessionOpen(session: SessionScanner.Session) {
        val f = SessionDetailFragment()
        f.bind(session, session.port == currentPort())
        openPage(f, "detail-${session.port}")
    }

    // ── SettingsFragment 的动作实现 ──
    //
    // 这些原本是 onCreate 里散落的匿名 setOnClickListener。收拢到此处的
    // 好处：设置页的每个按钮行为都能一眼看全，且 Fragment 不必知道
    // Activity 的内部方法名（只依赖 Actions 接口）。

    override fun onConnect(url: String, secret: String) {
        hideKeyboard()
        connectWith(url, secret)
    }

    override fun onScanSessions() {
        selectTab(TAB_INDEX_SESSIONS)
    }

    override fun onPickHost() {
        settingsActions.showHostHistory()
    }

    /**
     * 一键把地址框填成 **Tailscale 地址**（固定名，任意网络可用）。
     *
     * ## 为什么需要
     *
     * Tailscale 的主机名（如 `tp-kaixings`）比 IP 好记且**永不变**，
     * 但手打容易错。这里从**已知会话**里找出 Tailscale 地址（100.x 段），
     * 直接把它填进地址框 —— 用户点一下即可，不必记忆主机名。
     *
     * ## 找不到时
     *
     * 尚未连过任何会话、或对端不在 Tailscale 上时，给明确指引
     * （先扫描一次会话，或确认电脑装了 Tailscale），而不是静默失败。
     */
    override fun onFillTailscaleAddress() {
        // 已知会话里找第一个 Tailscale 地址。
        // 两种形态都认（服务端两种都会下发，见 listLanIps）：
        //  - `http://100.x.x.x:port`（Tailscale IP）
        //  - `http://<主机名>:port`（MagicDNS 短名，更好记 —— 优先用它）
        val candidates = knownSessions.list().flatMap { it.addresses } +
            connections.values.map { it.address }
        // 优先 MagicDNS 短名（如 `tp-kaixings`，最好记），其次 Tailscale IP。
        val magicDns = candidates.firstOrNull { a ->
            a.startsWith("http://") && run {
                val h = BridgeUrl.hostOf(a)
                h.isNotBlank() && h != "localhost" && h != "127.0.0.1" &&
                    !h.matches(Regex("""\d+\.\d+\.\d+\.\d+"""))
            }
        }
        val tsIp = candidates.firstOrNull { a ->
            a.startsWith("http://") && BridgeUrl.hostOf(a).startsWith("100.")
        }
        val tailscaleAddr = magicDns ?: tsIp

        if (tailscaleAddr == null) {
            Toast.makeText(
                this,
                "未找到 Tailscale 地址：请先「会话」页扫描一次（或确认电脑与手机都已登录 Tailscale）",
                Toast.LENGTH_LONG,
            ).show()
            return
        }
        urlInput.setText(tailscaleAddr)
        Toast.makeText(this, "已填入 Tailscale 地址，点「连接」即可", Toast.LENGTH_SHORT).show()
    }

    override fun onRemoteConfig() {
        openPage(ConfigFragment(), "config")
    }

    /**
     * 内联选项被选中（设置页）。
     *
     * 与弹窗版本的区别：这里不关闭任何东西 —— 内联展开的意义就在于
     * 保留现场，用户能对着刚改的值确认。反馈通过追加系统消息给出。
     */
    override fun onConfigValue(key: String, value: Any?, label: String) {
        val c = client
        if (c == null || !c.isConnected) {
            Toast.makeText(this, "未连接", Toast.LENGTH_SHORT).show()
            return
        }
        c.setConfig(key, value, ChatMessage.newId())
        append(ChatMessage.system("已请求：$label"))
    }

    override fun onRenameSession() {
        settingsActions.promptRenameSession()
    }

    override fun onExportHistory() {
        settingsActions.exportHistory()
    }

    override fun onClearHistory() {
        adapter.submit(emptyList())
        val s = store
        thread { s?.clear() }
        // 本地模式：历史清了，累计用量一并清零（/cost 是「会话级」统计）；
        // 待办清单也清（新会话新计划）
        if (appMode.isCloudAgent) {
            localBackend.resetUsage()
            LocalTools.clearTodos()
        }
        Toast.makeText(this, "已清空本地记录", Toast.LENGTH_SHORT).show()
    }

    override fun onShowDiagnostics() {
        openPage(DiagnosticsFragment(), "diagnostics")
    }

    override fun onShowAbout() {
        openPage(AboutFragment(), "about")
    }

    override fun onShowHistory() {
        // 用 tag 复用：openPage 里 findFragmentByTag 非 null 时不重复 add，
        // 故从二级页返回后再进会拿到旧实例 —— 需要它刷新
        val existing = supportFragmentManager.findFragmentByTag("history") as? HistoryFragment
        if (existing != null) {
            supportFragmentManager.popBackStack("history", 0)
            existing.refresh()
            return
        }
        openPage(HistoryFragment(), "history")
    }

    override fun onPrefToggle(key: String, on: Boolean) {
        // 本地偏好：写入后立即生效（消费方各自读 LocalPrefs）
        localPrefs.setBool(key, on)
        applyLocalPrefs()
    }

    override fun onPrefChoice(key: String, value: String) {
        val changed = localPrefs.get(key) != value
        localPrefs.set(key, value)
        applyLocalPrefs()
        // 主题只在 onCreate 生效 —— 改了要重建 Activity 才能看到效果。
        // 不重建的话用户会以为「选了没反应」。
        if (key == LocalPrefs.KEY_THEME && changed) {
            recreate()
        }
    }

    override fun onShowPendingPermissions() {
        val pending = PermissionDecisionStore.all(this)
        if (pending.isEmpty()) {
            Toast.makeText(this, R.string.pending_permissions_empty, Toast.LENGTH_SHORT).show()
            return
        }
        val lines = pending.joinToString("\n") { p ->
            "· ${p.behavior} ← ${p.source.ifBlank { "未知来源" }}"
        }
        android.app.AlertDialog.Builder(this)
            .setTitle(getString(R.string.pending_permissions) + "（${pending.size}）")
            .setMessage(lines + "\n\n这些决定会在下次连接成功后自动补发。")
            .setPositiveButton("清空") { _, _ ->
                PermissionDecisionStore.clear(this)
                Toast.makeText(
                    this,
                    getString(R.string.pending_permissions_cleared, pending.size),
                    Toast.LENGTH_SHORT,
                ).show()
            }
            .setNegativeButton("关闭", null)
            .show()
    }

    /**
     * 打开「逐条授权规则」管理页。
     *
     * 列出 [PermissionRules.KNOWN_TOOL_NAMES] 的每类工具，每行三选一：
     * 总是允许 / 总是拒绝 / 每次询问（默认）。点选即写入 SharedPreferences，
     * 下次权限请求由 [onPermissionRequested] 的闸门按规则自动裁决。
     *
     * 用内联展开而非 AlertDialog.setItems：要展示「工具名 + 当前选中策略」
     * 的对照，且每行有三个独立选项可点，列表单选无法满足。
     */
    /** dip → px（权限规则对话框等动态构建 UI 用）。 */
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    override fun onShowPermissionRules() {
        val list = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(dp(14), dp(8), dp(14), dp(8))
        }
        PermissionRules.allRulesWithDefaults(this).forEach { rule ->
            list.addView(buildRuleRow(rule.toolName))
        }
        android.app.AlertDialog.Builder(this)
            .setTitle(R.string.permission_rules)
            .setView(android.widget.ScrollView(this).apply { addView(list) })
            .setNegativeButton("关闭", null)
            .show()
    }

    /** 构建一条工具规则行：工具名 + 三个策略 chip。 */
    private fun buildRuleRow(toolName: String): android.view.View {
        val ctx = this
        val row = android.widget.LinearLayout(ctx).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(0, dp(6), 0, dp(6))
        }
        val nameView = android.widget.TextView(ctx).apply {
            text = toolName
            textSize = 13f
            setTextColor(0xFFE8E8E8.toInt())
        }
        row.addView(nameView)

        val chips = mutableListOf<android.widget.TextView>()
        val options = listOf(
            Triple(PermissionRules.POLICY_ALWAYS_ALLOW, "总是允许", 0xFF6BD66B.toInt()),
            Triple(PermissionRules.POLICY_ALWAYS_DENY, "总是拒绝", 0xFFFF6B6B.toInt()),
            Triple(PermissionRules.POLICY_ASK, "每次询问", 0xFFCCCCCC.toInt()),
        )
        val bar = android.widget.LinearLayout(ctx).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            setPadding(0, dp(4), 0, 0)
        }
        val refresh = {
            val cur = PermissionRules.getPolicy(ctx, toolName)
            chips.forEach { chip ->
                val on = chip.tag == cur
                chip.setBackgroundResource(if (on) R.drawable.chip_bg_on else R.drawable.chip_bg)
            }
        }
        options.forEach { (value, label, _) ->
            val chip = android.widget.TextView(ctx).apply {
                text = label
                tag = value
                textSize = 12f
                setPadding(dp(12), dp(6), dp(12), dp(6))
                setBackgroundResource(R.drawable.chip_bg)
                setTextColor(0xFFCCCCCC.toInt())
                val lp = android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                    android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                )
                lp.setMargins(0, 0, dp(8), 0)
                layoutParams = lp
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    PermissionRules.setPolicy(ctx, toolName, value)
                    refresh()
                }
            }
            chips.add(chip)
            bar.addView(chip)
        }
        row.addView(bar)
        refresh()
        return row
    }

    /**
     * 按「主题」偏好设置主题。必须在 setContentView 前调用。
     *
     * 三种取值：
     * · light  → 浅色主题
     * · system → 跟随系统（这里按系统是否为深色决定）
     * · dark / 其它 → 默认深色主题（也是改造前的观感）
     */
    private fun applyThemePref() {
        val theme = LocalPrefs(this).get(LocalPrefs.KEY_THEME)
        val useLight = when (theme) {
            "light" -> true
            "system" -> (resources.configuration.uiMode and
                android.content.res.Configuration.UI_MODE_NIGHT_MASK) !=
                android.content.res.Configuration.UI_MODE_NIGHT_YES
            else -> false
        }
        setTheme(if (useLight) R.style.Theme_DogeMobile_Light else R.style.Theme_DogeMobile)
    }

    /**
     * 把本地偏好应用到界面上。
     *
     * 本项目多数偏好影响的是「渲染细节」（字号/密度/颜色），
     * 完整应用需要重建视图；此处先做能立即生效的部分（通知相关），
     * 其余在下一轮深化时接入（见规划文档线 A）。
     */
    private fun applyLocalPrefs() {
        // 渲染类偏好交给 Adapter（它持有渲染参数，改后重绘）
        adapter.applyOptions(buildDisplayOptions())
        autoScrollPrefsCache = localPrefs.getBool(LocalPrefs.KEY_AUTO_SCROLL)
        streamPrefsCache = localPrefs.getBool(LocalPrefs.KEY_STREAMING)
        // 通知类偏好无需重建视图：下次 notify 时读取即可，故不在此处理。
        // 唯一例外是渠道级的声音设置 —— 它建在渠道上，改不了，
        // 只能影响之后新建的通知（已在 Notifications 里按次读取）。
    }

    /**
     * 从本地偏好构造渲染参数。
     *
     * 这是**偏好 → 界面**的唯一转换点：所有渲染类偏好在这一处映射，
     * 而不是散落到 Adapter 各处读 SharedPreferences。
     */
    private fun buildDisplayOptions(): ChatAdapter.DisplayOptions =
        ChatAdapter.DisplayOptions(
            markdown = localPrefs.getBool(LocalPrefs.KEY_MARKDOWN),
            codeHighlight = localPrefs.getBool(LocalPrefs.KEY_CODE_HIGHLIGHT),
            // 最终字号 = 预设档 × 捏合倍率。
            // 两者分开存（见 PinchZoom）：改预设不影响已捏的倍率，
            // 捏合也不覆盖用户选的档位。
            fontScale = PinchZoom.finalScale(
                presetFactor = PinchZoom.presetFactor(localPrefs.get(LocalPrefs.KEY_FONT_SCALE)),
                // 捏合过程中用临时值（避免每次都读盘）；结束后落盘并清空
                pinchFactor = pinchZoomPrefsLive ?: pinchZoomPrefs.factor(),
            ),
            compact = localPrefs.get(LocalPrefs.KEY_DENSITY) == "compact",
            relativeTime = localPrefs.get(LocalPrefs.KEY_TIME_FORMAT) == "relative",
        )

    override fun onRememberSecretChanged(remember: Boolean) {
        prefs.edit().putBoolean(KEY_REMEMBER_SECRET, remember).apply()
        // 取消勾选时立刻抹掉已存的密钥 —— 否则用户以为「不记住」了，
        // 实际上旧的还躺在磁盘上，下次连接照样能免密
        if (!remember) prefs.edit().remove(KEY_SECRET).apply()
    }

    // ── Fragment 与底部导航 ──

    private fun setupFragments() {
        val fm = supportFragmentManager
        chatFragment = fm.findFragmentByTag(TAG_CHAT) as? ChatFragment ?: ChatFragment().also {
            fm.beginTransaction().add(R.id.content, it, TAG_CHAT).commitNow()
        }
        // 键盘顶起输入框（Android 15 边到边下 adjustResize 已失效，必须自己避让）
        chatFragment!!.keyboardPanEnabled = {
            localPrefs.getBool(LocalPrefs.KEY_KEYBOARD_PAN)
        }
        sessionFragment = fm.findFragmentByTag(TAG_SESSIONS) as? SessionFragment
            ?: SessionFragment().also {
                fm.beginTransaction().add(R.id.content, it, TAG_SESSIONS).commitNow()
            }
        settingsFragment = fm.findFragmentByTag(TAG_SETTINGS) as? SettingsFragment
            ?: SettingsFragment().also {
                fm.beginTransaction().add(R.id.content, it, TAG_SETTINGS).commitNow()
            }

        // 对话页：控件就绪后赋值回 Activity 字段。
        // 控件仍由 Activity 持有是因为 40 多个业务方法共用它们；
        // 任务 #22 抽类时再逐步迁到各协调类里。
        chatFragment!!.onChatViewsReady = { v ->
            list = v.list
            msgInput = v.msgInput
            sendBtn = v.sendBtn
            stopBtn = v.stopBtn
            activityPanel = v.activityPanel
            activityText = v.activityText
            agentStopBtn = v.agentStopBtn
            bindChatViews()

            // 双指缩放：注入初值 + 接线回调。
            // 每次视图重建都要重设（Fragment view 会被销毁重建）。
            chatFragment!!.pinchFactor = pinchZoomPrefs.factor()
            // 捏合过程中实时重绘（不写盘）
            chatFragment!!.onPinchZoomLive = { factor ->
                pinchZoomPrefsLive = factor
                adapter.applyOptions(buildDisplayOptions())
            }
            // 手势结束才持久化（一次手势只写一次盘）
            chatFragment!!.onPinchZoom = { factor ->
                pinchZoomPrefs.setFactor(factor)
                // 清空临时值：此后以落盘值为准（避免两处状态长期并存）
                pinchZoomPrefsLive = null
                adapter.applyOptions(buildDisplayOptions())
            }

            // 每次视图重建都要重挂 adapter：Fragment view 销毁重建后，
            // 原来挂在旧 RecyclerView 上的 adapter 不会自动跟过来
            list.layoutManager = LinearLayoutManager(this).apply { stackFromEnd = true }
            list.adapter = adapter
            // 空态视图须在每次视图重建时重挂（Fragment view 重建后旧引用失效）
            adapter.bindEmptyView(v.emptyHint)
            adapter.submit(store?.load().orEmpty())
            if (adapter.itemCount > 0) list.scrollToPosition(adapter.itemCount - 1)

            // 批量选择模式：点击消息切换选中（由 adapter 在选择模式下转发）
            adapter.onSelectionClick = { toggleSelection(it) }
            // 批量操作栏按钮（仅在选择模式时显示，故每次视图重建都重挂）
            v.batchSelectAll.setOnClickListener { batchToggleAll() }
            v.batchCopy.setOnClickListener { batchCopySelected() }
            v.batchDelete.setOnClickListener { batchDeleteSelected() }
            v.batchCancel.setOnClickListener { exitSelectionMode() }
            // 视图重建后若仍处于选择模式，恢复操作栏（否则退出后重建会丢 UI 态）
            if (selectedIds.isNotEmpty()) showBatchBar()
        }

        // 设置页：地址/密钥输入框需要被 Activity 读取（连接、诊断要用）
        //
        // 注意这里**不触发自动连接** —— 连接会 append 系统消息，那条路径
        // 依赖对话页的 list/adapter 已就绪。两个 Fragment 的回调触发顺序
        // 由 add 顺序决定，靠它保证前置条件太脆弱。
        // 改为 setupFragments() 返回后由 onCreate 统一发起（那时两个
        // Fragment 的视图都已完成 onViewCreated）。
        settingsFragment!!.onSettingsViewsReady = { url, secret ->
            urlInput = url
            secretInput = secret
            // 地址按当前模式取（每模式各存一份，见 savedAddress）。
            url.setText(savedAddress())
            secret.setText(prefs.getString(KEY_SECRET, ""))
        }

        // 设置页的「工作模式 + 本地配置」面板。
        // 模式切换后要重建界面状态（顶栏按钮、状态文案等），故传回调。
        settingsFragment!!.bindLocalPanel(
            LocalConfigPanel(
                fragment = settingsFragment!!,
                store = localStore,
                modePrefs = appModePrefs,
                onModeChanged = { mode ->
                    appMode = mode
                    // 地址按模式分存：切模式时地址框切换成该模式上次用的地址，
                    // 避免把 LAN 的 IP 带进隧道框（或反之）导致用户每次重填。
                    if (::urlInput.isInitialized) {
                        urlInput.setText(savedAddress())
                    }
                    // 切到云端模式时，顶栏不再显示「未连接」（云端无连接概念）
                    applyModeToUi()
                    // 进入云端模式时重建 localBackend（云端后端独立于远端）。
                    if (mode.isCloudAgent) {
                        runCatching { localBackend.close() }
                        localBackend = buildLocalBackend()
                    }
                },
                skillStore = SkillStore(this),
            ).also { panel ->
                // 工作区切换（M4 多工作区）：历史按工作区隔离（M1），
                // 换工作区必须换历史文件并重建本地后端（lazy 缓存会钉住旧历史）
                panel.onWorkspaceSwitched = {
                    // 顶栏状态里的工作区名要跟着变
                    applyModeToUi()
                }
            },
        )

        // 会话页：扫描目标由 Activity 提供（地址栏在设置页，Fragment 间互不可见）
        // 扫描目标直接读持久化的地址，**不**依赖 urlInput 控件。
        //
        // 为什么：本方法（setupFragments）在 onCreate 里执行，而 Fragment 的
        // onViewCreated 要等到 onStart 才跑 —— 那时 urlInput 可能还没被
        // 设置页回调赋值。若这里读 urlInput 就会崩（实测过）。
        //
        // 地址的权威来源本来就是 SharedPreferences（urlInput 只是它的显示副本），
        // 直接读它既打破循环依赖，也避免「界面还没就绪就没有扫描目标」的怪状态。
        sessionFragment!!.scanTargetProvider = { savedAddress() to savedPort() }
        // 已知会话（三模式，落库而来）——合并进会话列表，补齐扫描/广播
        // 够不到的 TUNNEL/户外场景。按地址解析出 host/port 供分组与切换。
        sessionFragment!!.knownSessionsProvider = {
            knownSessions.list().mapNotNull { it.toSessionOrNull() }
        }
        // 历史里用过的其它主机（换电脑 / 换 WiFi 时留下的）一并探测。
        // 只取主机名而非完整 URL —— 扫描要的是 host，端口由 SessionScanner
        // 扫 5680-5690 全段决定。
        sessionFragment!!.historyHostProvider = {
            loadHostHistory()
                .map { BridgeUrl.hostOf(it) }
                .filter { it.isNotBlank() }
        }
        // 局域网自动发现开关（可在设置里关掉，弱信号下省电）
        sessionFragment!!.lanDiscoveryEnabled = {
            localPrefs.getBool(LocalPrefs.KEY_LAN_DISCOVERY)
        }
        // 扫描端口范围：与「服务端自动顺延端口」成对 —— 写死范围会让
        // 用户改了起始端口后永久扫不到会话
        sessionFragment!!.scanPortRange = { scanPortPrefs.range() }
        // 主机号范围（默认 100-130）：收窄候选数以在 deadline 内扫完，
        // 直接缓解「762 个候选扫不完 → 漏报」
        sessionFragment!!.ipRange = { ipRangePrefs.range() }
        // 优先网段：从当前连接地址推出（手机能连的那个），排到候选最前，
        // 避免它被 deadline 截断（真机实测的漏报正因本机网段落在末尾）
        sessionFragment!!.preferredSubnet = {
            // 优先用连接地址的网段（用户上一次连成功/正在连的那个）。
            // 但 savedHost 在 USB 场景下是 127.0.0.1，回环网段毫无意义
            //（真机实测踩过：优先网段=127.0 → 排序完全失效）。
            // 故回环/无效时回落到本机第一个非回环 IPv4 的网段。
            val host = runCatching { savedHost() }.getOrDefault("")
            val fromSaved = subnetPrefixOf(host)
            if (fromSaved != null && !host.startsWith("127.")) {
                fromSaved
            } else {
                val local = runCatching {
                    LanScanner.localIpv4()
                        .map { SubnetCandidates.ipOf(it) }
                        .firstOrNull { it.isNotBlank() && !it.startsWith("127.") && !it.startsWith("169.254.") }
                }.getOrNull()
                subnetPrefixOf(local.orEmpty()).orEmpty()
            }
        }
        // 点列表项 → 进详情页（而非直接切换）
        sessionFragment!!.onSessionPicked = { s -> onSessionOpen(s) }
        // 列表项上直接「切换」：一步到位。
        // 跳转对话页、更新当前端口、提示已切换都由 switchToSession 内部
        // 完成（既有实现已包含），此处不重复 —— 重复会导致将来改一处漏一处。
        sessionFragment!!.onSessionSwitch = { s -> switchToSession(s) }

        // 自动连接：广播/扫描发现会话后按策略决定是否自动连。
        // 策略见 AutoConnect（只有一个候选才连；多个让用户选）。
        sessionFragment!!.onBeaconDiscovered = label@{ sessions ->
            // 自动记住广播里的隧道地址（服务端起 --tunnel 时才有）：
            // 手机在同一 WiFi 收到即落盘到 TUNNEL 模式地址，出门切流量直接用，
            // 不必手输那个每次重启都变的随机子域。
            rememberTunnelUrlFrom(sessions)
            // 连接韧性：当前是回环地址且已多次失败 → 它已失效（USB 拔掉/转发丢失），
            // 不再重试它，而是切到发现的局域网会话（见 ConnectionStrategy）。
            // 这是用户痛点「拔 USB 后卡死在 127.0.0.1」的核心修复：
            // 原逻辑发现到局域网会话后不会主动切走失效回环地址。
            val savedHost = savedHost()
            if (ConnectionStrategy.isLikelyDeadLoopback(savedHost) &&
                consecutiveConnectFailures >= 2 && !anyConnected && !userDisconnected
            ) {
                when (val d = ConnectionStrategy.decide(savedHost, savedPort(), sessions, consecutiveConnectFailures)) {
                    is ConnectionStrategy.Decision.SwitchTo -> {
                        switchToSession(d.session)
                        return@label
                    }
                    is ConnectionStrategy.Decision.ChooseFrom -> {
                        Toast.makeText(
                            this,
                            AutoConnect.multiSessionHint(d.sessions.size),
                            Toast.LENGTH_SHORT,
                        ).show()
                        return@label
                    }
                    is ConnectionStrategy.Decision.RetrySaved -> { /* 落到下方 AutoConnect */ }
                }
            }

            val decision = AutoConnect.shouldConnect(
                enabled = localPrefs.getBool(LocalPrefs.KEY_AUTO_CONNECT),
                candidates = sessions,
                alreadyConnected = anyConnected,
                userDisconnected = userDisconnected,
                currentPort = savedPort(),
            )
            when (decision) {
                is AutoConnect.Decision.Connect -> switchToSession(decision.session)
                is AutoConnect.Decision.Skip -> {
                    // 多会话时不静默：提示用户去列表里选。
                    // 只对「多会话」提示 —— 其他跳过原因（已连接、用户断开）
                    // 是预期行为，弹提示反而烦人
                    if (sessions.size > 1 && !anyConnected && !userDisconnected) {
                        Toast.makeText(
                            this,
                            AutoConnect.multiSessionHint(sessions.size),
                            Toast.LENGTH_SHORT,
                        ).show()
                    }
                }
            }
        }
    }

    /**
     * 用户是否手动断开过。
     *
     * **必须记住**：自动连接的判据之一是「用户没主动断开」——
     * 否则用户断开后，下次广播又把它连回来，用户会以为断不开。
     * 在新一轮主动连接（用户点了连接/切换会话）时重置。
     */
    private var userDisconnected = false

    /**
     * 连接失败的统一处理：计数、提示可操作原因、触发会话发现。
     *
     * ## 为什么要「触发会话发现」
     *
     * 这是修掉的一个真实缺陷：**自动发现只在「会话」页跑**
     *（`SessionFragment.onResume`）。App 启动后停在「对话」页时，
     * 广播监听与扫描**根本不会启动** —— 用户拔掉 USB 后重开 App，
     * 一直连不上，而手机上其实早就该发现局域网里的会话了。
     *
     * 现在：连续失败达阈值就主动让会话页跑一次发现（它会连上唯一的
     * 会话，见 AutoConnect）。
     */
    private fun onConnectionFailed() {
        // 仅统计「非手动断开」的失败：用户主动断开不算故障
        if (anyConnected) return
        consecutiveConnectFailures++
        if (!ConnectionHint.shouldSuggestDiscovery(consecutiveConnectFailures)) return
        if (failureHintShown) return
        failureHintShown = true

        val address = savedAddress()
        ConnectionHint.hintFor(address, consecutiveConnectFailures)?.let { hint ->
            append(ChatMessage.system(hint))
        }
        // 让会话页跑一次发现（广播 + 扫描）。切过去会让用户看到过程，
        // 但也打断他当前操作 —— 故只触发发现，不切页
        sessionFragment?.triggerDiscovery()
    }

    /** 连续连接失败次数（成功连接后清零）。 */
    private var consecutiveConnectFailures = 0

    /** 本次失败序列是否已提示过（避免反复刷同一条提示）。 */
    private var failureHintShown = false

    /**
     * 按当前模式刷新顶栏状态与发送按钮可用性。
     *
     * 本地模式没有「连接」概念，若沿用远端的状态文案（「未连接，重连中…」）
     * 会让用户以为出了问题 —— 而实际只是选了本地模式。
     */
    private fun applyModeToUi() {
        // 会话隔离：模式变化时切换历史文件并重建本地后端。
        // **必须在早退之前调** —— 早退（key 未变）正是它的去重手段。
        refreshSessionScope()

        if (appMode.isCloudAgent) {
            val cfg = localStore.providerConfig()
            val ready = cfg.isUsable
            // 云端模式没有「连接」概念：文案直接说明配置状态，
            // 而不是沿用远端的「未连接，重连中…」（那会让用户以为出故障）
            val label = if (ready) {
                "云端模式（${cfg.model.ifBlank { "默认模型" }}）"
            } else {
                "云端模式（未配置 API，去设置里填）"
            }
            setStatus(ready, label)
        }
        // 局域网/隧道模式不做额外处理：连接事件（onEvent 里的 Connected/
        // Disconnected）本来就会调 setStatus 刷新，重复设置反而可能
        // 覆盖掉更准确的实时状态
    }

    /**
     * 当前模式应使用的会话历史标识。
     *
     * 远端：`主机_端口`（同 [MessageStore.keyFor]）；本地：按工作区
     *（同 [MessageStore.keyForLocal]）。两者前缀不同，**永不撞名**。
     */
    private fun currentScopeKey(): String =
        if (appMode.isCloudAgent) {
            MessageStore.keyForLocal(localStore.resolvedWorkspace().absolutePath)
        } else {
            MessageStore.keyFor(savedHost(), savedPort())
        }

    /** 上次已生效的会话标识（去重，避免每次 applyModeToUi 都重载历史）。 */
    private var activeScopeKey: String? = null

    /**
     * 按当前模式 + 当前目标切换历史文件，并重建本地后端。
     *
     * ## 为什么必须做
     *
     * `MessageStore` 的文件名由 `useSession(key)` 决定，而此前**只有远端
     * connectTo 路径**会调它。本地模式从不调 → 永远落在构造默认值
     * `history-default.json`，后果：① 与远端历史串味；② 换工作区不换历史。
     *
     * ## 为什么去重
     *
     * [applyModeToUi] 是高频入口（状态刷新、模式切换、配置改动都会调）。
     * 不去重会在每次调用时都「读盘 + 重建后端 + 刷新列表」—— 明显卡顿。
     * 只在 key 真正变化时执行。
     *
     * ## 为什么重建 localBackend
     *
     * `LocalAgentBackend.history` 是 `by lazy` 缓存的（见该类注释）——
     * 换历史文件后必须换实例，否则新会话的历史永远不会被读进来。
     */
    private fun refreshSessionScope() {
        val key = currentScopeKey()
        if (key == activeScopeKey) return
        activeScopeKey = key

        // 云端模式：本地历史按工作区切文件（[localMsgStore] 独立持有）。
        // 远端模式**不再**在这里切 store —— 每个会话各持独立的 MessageStore
        // 实例（见 SessionConn），切活动会话时会整体换 adapter 的内容，
        // 无需改写共享 store 的文件指针。
        if (appMode.isCloudAgent) {
            localMsgStore.useSession(key)
            // 云端后端持有历史缓存，换 scope 后必须重建（否则 lazy 已缓存旧历史）
            runCatching { localBackend.close() }
            localBackend = buildLocalBackend()
        }
        reloadHistoryIntoAdapter()
    }

    /**
     * 弹出设备锁屏凭据界面，请用户对某条命令做**事中确认**。
     *
     * 复用 [android.app.KeyguardManager.createConfirmDeviceCredentialIntent]
     * （与应用锁同一系统界面，覆盖指纹/PIN/图案/密码，纯 framework API）。
     *
     * 无法弹出（设备未设锁屏凭据 / 系统未提供界面）时**回调 false**
     * ——保守拒绝，绝不放行未经确认的敏感命令。
     */
    private fun askDeviceCredential(action: String, onResult: (Boolean) -> Unit) {
        val km = getSystemService(android.content.Context.KEYGUARD_SERVICE)
            as android.app.KeyguardManager
        val intent = runCatching {
            km.createConfirmDeviceCredentialIntent(getString(R.string.approve_title), action)
        }.getOrNull()
        if (intent == null) {
            // 未设锁屏凭据或系统无此界面 → 无法确认 → 拒绝
            onResult(false)
            return
        }
        pendingApproval = onResult
        runCatching { approvalLauncher.launch(intent) }.onFailure {
            pendingApproval = null
            onResult(false)
        }
    }

    /** 构造本地后端（含历史持久化 + 本地偏好接线）。 */
    private fun buildLocalBackend(): LocalAgentBackend {
        val prefs = LocalPrefs(this)
        return LocalAgentBackend(
            workspace = localStore.resolvedWorkspace(),
            configProvider = { localStore.providerConfig() },
            androidContext = this,
            approval = approvalCoordinator,
            skillStore = SkillStore(this),
            historyStore = object : LocalAgentBackend.HistoryStore {
                override fun load(): List<ChatMsg> = localMsgStore.loadLocalHistory()
                override fun save(messages: List<ChatMsg>) = localMsgStore.saveLocalHistory(messages)
            },
            localPrefs = object : LocalAgentBackend.LocalPrefsReader {
                override fun maxSteps(): Int =
                    prefs.get(LocalPrefs.KEY_LOCAL_MAX_STEPS).toIntOrNull()
                        ?: AgentLoop.DEFAULT_MAX_STEPS
                override fun temperature(): Double? {
                    val v = prefs.get(LocalPrefs.KEY_LOCAL_TEMPERATURE)
                    return if (v == "default") null else v.toDoubleOrNull()
                }
            },
        ).also { it.onEvent = { ev -> onEvent(LOCAL_KEY, ev) } }
    }

    /**
     * 把当前历史文件的内容读进列表。
     *
     * 本地模式的历史是 OpenAI 格式（[ChatMsg]），需经 [LocalHistoryCodec]
     * 转成 UI 格式；远端历史本就是 [ChatMessage]（服务端推送的形态）。
     *
     * **视图未就绪时只切文件、不渲染**：冷启动路径（`onCreate`）里
     * `list` 尚未由 [setupFragments] 赋值，此处碰它会碰 lateinit 崩溃 ——
     * 这正是本仓库踩过的坑（见 `onCreate` 里关于 `commitNow` 的注释）。
     * 视图稍后由 `bindChatViews` 负责首次渲染，无需此处代劳。
     */
    private fun reloadHistoryIntoAdapter() {
        if (!::adapter.isInitialized || !::list.isInitialized) return
        thread {
            val messages: List<ChatMessage> =
                if (appMode.isCloudAgent) {
                    LocalHistoryCodec.toChatMessages(localMsgStore.loadLocalHistory())
                } else {
                    store?.load().orEmpty()
                }
            runOnUiThread {
                adapter.submit(messages)
                if (messages.isNotEmpty()) list.scrollToPosition(messages.size - 1)
            }
        }
    }

    /**
     * 返回键行为。
     *
     * 多页结构下的自然语义：不在对话页时，先回对话页；已在对话页才退出。
     * 比原来的「关掉连接面板否则退出」更符合直觉 —— 用户切到设置页后
     * 按返回，期望是回到上个页面而非退出 App。
     */
    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // 二级页面优先：先弹栈回退到主 tab
                if (inSubPage()) {
                    supportFragmentManager.popBackStack()
                    return
                }
                if (currentTab != TAB_INDEX_CHAT) {
                    selectTab(TAB_INDEX_CHAT)
                } else {
                    finish()
                }
            }
        })
    }

    private fun setupBottomNav() {
        tabSessions = findViewById(R.id.tab_sessions)
        tabChat = findViewById(R.id.tab_chat)
        tabSettings = findViewById(R.id.tab_settings)
        tabSessions.setOnClickListener { selectTab(TAB_INDEX_SESSIONS) }
        tabChat.setOnClickListener { selectTab(TAB_INDEX_CHAT) }
        tabSettings.setOnClickListener { selectTab(TAB_INDEX_SETTINGS) }
        selectTab(TAB_INDEX_CHAT)
    }

    /**
     * 切 tab。用 show/hide 而非 replace：
     * · 保活视图，对话页的滚动位置不会丢
     * · 更重要：client 的 onEvent 回调持有控件引用，视图被销毁后会空引用崩溃
     */
    private fun selectTab(index: Int) {
        val fm = supportFragmentManager
        val tx = fm.beginTransaction()
        tx.hide(chatFragment!!)
        tx.hide(sessionFragment!!)
        tx.hide(settingsFragment!!)
        when (index) {
            TAB_INDEX_SESSIONS -> {
                tx.show(sessionFragment!!)
                // 切到会话页时自动重扫一次：用户来这里通常就是想看有哪些会话
                sessionFragment!!.setCurrentPort(currentPort())
                sessionFragment!!.rescan()
            }
            TAB_INDEX_SETTINGS -> tx.show(settingsFragment!!)
            else -> tx.show(chatFragment!!)
        }
        tx.commit()
        currentTab = index
        updateTabStyles(index)
    }

    private fun updateTabStyles(selected: Int) {
        val tabs = listOf(tabSessions to TAB_INDEX_SESSIONS, tabChat to TAB_INDEX_CHAT, tabSettings to TAB_INDEX_SETTINGS)
        tabs.forEach { (tv, idx) ->
            val on = idx == selected
            tv.setTextColor(if (on) 0xFF4ADE80.toInt() else 0xFF888888.toInt())
            tv.setTypeface(null, if (on) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
        }
    }

    /**
     * 切到指定会话并跳到对话页（真·并行版）。
     *
     * 与旧实现的关键区别：**不关闭其它会话的连接**。旧版每次切换都
     * `client.close()` 再 `connect()`，等于杀一条连一条；现在只把
     * 目标会话设为活动，其它会话的连接保持不变、继续收推送。
     */
    private fun switchToSession(s: SessionScanner.Session) {
        // 隧道/云端模式下，会话入口是它自己的 `wss://<子域>/mobile/ws`
        //（cloudflared 只暴露 wss + 同源 https，`http://子域:端口` 连不通）。
        // 原先一律用 `host:port` 拼 http，隧道模式下切换必然失败 ——
        // 这正是「切换模式后切不了会话」的直接原因。
        val tunnel = if (appMode == AppMode.LAN) null else tunnelUrlFor(s)
        // LAN/USB 模式下用**该会话自己的 host**，而非地址栏里的 currentHost()。
        // 修掉的真实缺陷：urlInput 里残留的是上一次连过的 host（例如 USB
        // reverse 场景下的 127.0.0.1），而用户此时想切的是一个局域网会话
        // （host 为 192.168.x.x）——用 currentHost() 会拼出
        // `http://127.0.0.1:<会话端口>`，连到手机自己、必然 ConnectException，
        // 表现为「在会话页点切换没反应」。会话的 host 由扫描/落库填入，
        // 才是目标主机的权威来源；仅当它为空（老数据）才回落 currentHost()。
        val host = s.host.ifBlank { currentHost() }
        val url = tunnel ?: "http://${host}:${s.port}"
        val secret = secretInput.text.toString()
        // 确保目标会话有连接（已有则复用，不打断其它会话）
        val key = ensureConnection(url, secret)
        connections[key]?.label = s.label
        activateSession(key, persistAddress = true)
        append(ChatMessage.system("已切换到会话「${s.label}」（${if (tunnel != null) "隧道" else "端口 ${s.port}"}）"))
        selectTab(TAB_INDEX_CHAT)
    }

    /** 绑定对话页的事件监听。视图重建时会重跑，故必须是幂等的。 */
    private fun bindChatViews() {
        // 草稿恢复：Activity 重建（旋屏/被回收）时输入框内容默认会丢，
        // 用户打了一半的长需求就白打了
        msgInput.setText(draftStore.load())

        sendBtn.setOnClickListener { sendCurrent() }
        stopBtn.setOnClickListener { activeBackend.interrupt() }
        findViewById<ImageButton>(R.id.btn_voice).setOnClickListener { inputActions.startVoiceInput() }
        // 低频操作收进「更多」溢出菜单 —— 输入栏只留最常用的三个按钮，
        // 把宽度还给输入框（详见 fragment_chat.xml 里输入栏的说明）
        findViewById<ImageButton>(R.id.btn_more).setOnClickListener { showMoreActions() }
        findViewById<ImageButton>(R.id.btn_scroll_bottom).setOnClickListener {
            if (adapter.itemCount > 0) list.scrollToPosition(adapter.itemCount - 1)
            clearUnseen()
        }
        // 未读提示：点击滚到底部并清除
        findViewById<TextView>(R.id.btn_unseen).setOnClickListener {
            if (adapter.itemCount > 0) list.scrollToPosition(adapter.itemCount - 1)
            clearUnseen()
        }
        bindScrollListener()

        // 长按弹操作菜单（原来是直接复制，太粗 —— 用户可能想引用或删）
        adapter.onLongPress = { m -> showMessageMenu(m) }
        // 点击失败消息重发（失败状态本身就是可重试的信号）
        adapter.onRetry = { m -> retry(m) }
        // 工具气泡标题行点击折叠/展开 —— 折叠态随历史持久化，重建后不丢
        adapter.onToolToggle = { id ->
            adapter.toggleTool(id)
            persist()
        }
        // 回合分组组头点击折叠/展开 —— 同样持久化（存在组首成员上）
        adapter.onGroupToggle = { firstMemberId ->
            adapter.toggleGroup(firstMemberId)
            persist()
        }
        // 点击缩略图看大图
        adapter.onImageClick = { base64, _ -> showImageFullscreen(base64) }

        // 草稿随输入实时保存（SharedPreferences apply 是异步落盘，很轻）
        msgInput.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                saveDraft(s?.toString().orEmpty())
            }
        })
        // 回车键行为：发送 或 换行，由偏好在运行时决定。
        //
        // 关键：输入框是 `textMultiLine`，键盘显示的是**换行键**，
        // 因此 `IME_ACTION_SEND` **永远不会触发** —— 此前依赖它的那段
        // 监听器是死代码（用户按回车只会换行，必须点发送按钮）。
        //
        // 正确的做法是对「换行」这个 action 拦截：想发送就吞掉换行并发出，
        // 想换行就放行（返回 false 让系统插入换行）。
        msgInput.setOnKeyListener { _, keyCode, event ->
            if (keyCode != android.view.KeyEvent.KEYCODE_ENTER) return@setOnKeyListener false
            if (event.action != android.view.KeyEvent.ACTION_DOWN) return@setOnKeyListener false
            if (EnterKey.shouldSend(
                    localPrefs.getBool(LocalPrefs.KEY_ENTER_SENDS),
                    event.isShiftPressed,
                )
            ) {
                sendCurrent()
                true
            } else {
                false
            }
        }
        // 软键盘的换行键走 editor action 路径（多数输入法不发 KeyEvent）
        msgInput.setOnEditorActionListener { _, actionId, event ->
            if (!EnterKey.isEnterKey(
                    actionId,
                    event?.keyCode ?: 0,
                )
            ) {
                return@setOnEditorActionListener false
            }
            if (EnterKey.shouldSend(
                    localPrefs.getBool(LocalPrefs.KEY_ENTER_SENDS),
                    event?.isShiftPressed == true,
                )
            ) {
                sendCurrent()
                true
            } else {
                false
            }
        }
        bindChatSearch()
        // 应用当前模式到顶栏（本地模式启动后不该显示远端的「未连接」）
        applyModeToUi()
    }

    /**
     * 接线搜索栏。
     *
     * 视图重建时会重跑，故必须幂等 —— 监听器都是**替换**而非追加
     * （setOnClickListener / addTextChangedListener 需先清旧的）。
     */
    private fun bindChatSearch() {
        val v = chatFragment?.currentViews() ?: return

        // 重建时清掉旧监听：Fragment 视图销毁重建后，旧监听器会持有
        // 已失效的 View 引用，且 addTextChangedListener 会**累积**
        val old = v.searchInput.tag
        if (old is android.text.TextWatcher) {
            v.searchInput.removeTextChangedListener(old)
        }
        val watcher = object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                runSearch(s?.toString().orEmpty())
            }
        }
        v.searchInput.tag = watcher
        v.searchInput.addTextChangedListener(watcher)

        v.searchPrev.setOnClickListener { jumpMatch(-1) }
        v.searchNext.setOnClickListener { jumpMatch(1) }
        v.searchClose.setOnClickListener { toggleChatSearch(false) }
    }

    /** 展开/收起搜索栏。收起时清空状态，避免下次打开还高亮着旧结果。 */
    private fun toggleChatSearch(show: Boolean) {
        val v = chatFragment?.currentViews() ?: return
        searchVisible = show
        v.searchBar.visibility = if (show) View.VISIBLE else View.GONE
        if (show) {
            v.searchInput.requestFocus()
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showSoftInput(v.searchInput, InputMethodManager.SHOW_IMPLICIT)
        } else {
            v.searchInput.setText("")
            matchIndices = emptyList()
            currentMatch = -1
            v.searchCount.text = ""
        }
    }

    /** 执行搜索。 */
    private fun runSearch(query: String) {
        val v = chatFragment?.currentViews() ?: return
        matchIndices = ChatSearch.findMatches(adapter.snapshot(), query)
        currentMatch = matchIndices.firstOrNull() ?: -1
        v.searchCount.text = ChatSearch.countLabel(
            matchIndices,
            currentMatch,
            getString(R.string.search_no_match),
        )
        if (currentMatch >= 0) list.scrollToPosition(currentMatch)
    }

    /** 跳到上一个/下一个命中。 */
    private fun jumpMatch(direction: Int) {
        val v = chatFragment?.currentViews() ?: return
        val next = ChatSearch.nextIndex(matchIndices, currentMatch, direction) ?: return
        currentMatch = next
        v.searchCount.text = ChatSearch.countLabel(
            matchIndices,
            currentMatch,
            getString(R.string.search_no_match),
        )
        // 用 scrollToPosition 而非 smoothScroll：命中可能相距很远，
        // 平滑滚动会滚很久，用户以为卡住了
        list.scrollToPosition(next)
    }

    /**
     * 通知点击拉起（或已有实例被重新唤醒）时进入。
     *
     * 通知栏的「批准/拒绝」按钮点下后，Receiver 会把 App 拉起来
     * （后台启动受限时失败，但决定已落盘，下次冷启动会补发）。
     * 走到这里说明 App 在运行，可以立即冲刷队列。
     */
    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == PermissionActionReceiver.ACTION_FLUSH_PERMISSION) {
            flushPendingPermissions()
        }
        // 通知点击带来的会话切换（真·并行多会话导航）：
        // 用户点「修CI 有新回复」的通知，应切到那条会话看内容。
        val key = intent.getStringExtra(Notifications.EXTRA_SESSION_KEY)
        if (!key.isNullOrBlank() && connections.containsKey(key)) {
            activateSession(key, persistAddress = true)
            selectTab(TAB_INDEX_CHAT)
        }
    }

    /**
     * 补发通知栏里做出的权限决定。
     *
     * 流程：磁盘队列 → 逐条发送 → 发送成功才移除。
     * 失败时**保留**在队列里是刻意的：说明连接又断了，
     * 留下让下次连接继续尝试，不能静默丢弃 ——
     * 丢弃意味着服务端那个权限请求永远等不到响应，AI 卡死。
     *
     * 发送失败即中断本轮循环：后续决定大概率也会失败，
     * 且顺序敏感（同一请求的批准/拒绝必须按序到达），
     * 半途乱序发送反而更糟。
     */
    private fun flushPendingPermissions() {
        val c = client ?: return
        if (!c.isConnected) return
        val pending = PermissionDecisionStore.all(this)
        if (pending.isEmpty()) return
        android.util.Log.i(TAG, "补发 ${pending.size} 条待决权限响应")

        for (p in pending) {
            val ok = c.sendPermissionResponse(p.requestId, p.behavior)
            if (ok) {
                PermissionDecisionStore.remove(this, p.requestId)
                // 该请求若还在 App 内有对话框，必须关掉 ——
                // 用户已在通知栏做了决定，再看到同一个请求在问会造成
                // 「我刚才不是点过了吗」的困惑，甚至导致重复批准。
                dismissPermissionDialogSilently(p.requestId)
            } else {
                android.util.Log.w(TAG, "补发失败，保留在队列: ${p.requestId}")
                break
            }
        }
        val left = PermissionDecisionStore.all(this).size
        if (left == 0) append(ChatMessage.system("已处理通知栏的权限决定"))
    }

    override fun onDestroy() {
        super.onDestroy()
        stopConnectionSweeper()
        // 关闭**所有**会话的连接（真·并行下有多条，逐一关闭）。
        // 不关会导致后台连接的 WS 与回调继续存活，Activity 已销毁时
        // 回调触碰控件 → 空引用崩溃。
        connections.values.forEach { runCatching { it.close() } }
        connections.clear()
        // 释放 TTS 引擎：不释放会泄漏并长期占用音频焦点
        voiceAnnouncer.release()
        // 及时落盘，避免进程被杀丢消息。
        // 走 saveAsync 的串行队列：此前用 thread{store.save()} 在 Activity 销毁时
        // 新开的线程可能来不及执行就被系统回收，最后一轮回复丢失。
        // 队列中的任务已在此之前提交（每次 append 都 persist 过），这里是兜底。
        // 活动会话与本地历史都要落（两者可能是不同的文件）。
        store?.saveAsync(adapter.snapshot())
        localMsgStore.saveAsync(adapter.snapshot())
    }

    // ── 连接 ──

    /**
     * 点顶栏状态区的分流行为。
     *
     * 为什么需要它：客户端在连续失败后会停止自动重连（`manualClose`），
     * 而此前**没有任何手动重连入口** —— 用户看到「已断开」点一下只进了
     * 诊断页，唯一出路是杀掉进程重开 App。而 App 一旦被系统回收再启动，
     * 又会走一遍冷启动自动连接；用户自然会以为「要重启才能连上」。
     *
     * 现在未连接时点击 = 立即重连：把最关键的动作放在最容易点到的地方。
     * 已连接时保留原行为（进诊断页看链路详情）。
     */
    private fun onStatusTapped() {
        if (client?.isConnected == true) {
            openPage(DiagnosticsFragment(), "diagnostics")
            return
        }
        // 未连接：重连。用持久化的地址与密钥，而不是地址栏的当前内容 ——
        // 地址栏可能正被编辑到一半（半截 IP 连不上，会让人更困惑）。
        val addr = savedAddress()
        val secret = prefs.getString(KEY_SECRET, "") ?: ""
        setStatus(false, getString(R.string.status_connecting))
        append(ChatMessage.system("正在重连 $addr …"))
        connectWith(addr, secret)
    }

    /**
     * 连接到某个地址（真·并行版）。
     *
     * ## 与旧实现的区别
     *
     * 旧版把「连接」等同于「切到那个会话」：`client.close()` + `client.connect()`，
     * 一个地址一条连接，连 A 就断 B。现在**连接与切换解耦**：
     * · 本方法只负责「确保该地址对应一条连接」，不动其它会话的连接；
     * · 是否把它设为活动会话由调用方决定（[switchToSession] 会切）。
     *
     * 这样用户在会话列表里点「连接」时不会打断正在跑的其他会话 ——
     * 那正是「多会话不可卡死」的核心诉求。
     */
    private fun connectWith(rawUrl: String, secret: String) {
        val url = normalize(rawUrl)
        prefs.edit().apply {
            // 按当前模式存地址：切模式时各模式恢复自己的地址（见 savedAddress）。
            putString(urlKeyFor(appMode), url)
            // 密钥持久化做成开关：共用设备场景下用户可能希望不落盘。
            // 刻意**不引入加密库** —— androidx.security:security-crypto 已被
            // Google 标记为 deprecated，而为它引入新依赖换来的保护有限：
            // 存储位置本就是 App 私有目录（其他 App 读不到），
            // allowBackup=false 又阻断了备份外泄路径，
            // 剩下 root/取证场景下 Keystore 方案的提升也很小。
            // 「不保存」才是真正有效的用户选择，故把它做成开关而非默认加密。
            if (prefs.getBoolean(KEY_REMEMBER_SECRET, true)) {
                putString(KEY_SECRET, secret)
            } else {
                remove(KEY_SECRET)
            }
            putBoolean(KEY_AUTOCONNECT, true)
        }.apply()
        urlInput.setText(url)
        rememberHost(url)

        ensureConnection(url, secret)
        // 连上之后把它设为活动会话并载入其历史（连接建立是异步的，
        // 但 store 与 activeKey 是本地状态，可立即切换）。
        val key = keyForUrl(url)
        activateSession(key, persistAddress = false)
    }

    /**
     * 确保「某地址」有一条连接：已有则复用，没有则新建并 connect。
     *
     * @return 该地址对应的会话 key
     */
    private fun ensureConnection(url: String, secret: String): String {
        val key = keyForUrl(url)
        val existing = connections[key]
        if (existing != null) {
            // 已在（重连中/已连）就不再新建 —— 重复 connect 会留下孤儿 WS
            if (!existing.connected && !existing.userClosed) {
                existing.backend.bridge.connect(BridgeUrl.buildWsUrl(url, secret))
            }
            existing.lastActivityAt = System.currentTimeMillis()
            return key
        }
        val label = url // 先用地址占位，连上后由 Connected 事件的 label 覆盖
        val conn = SessionConn(this, key, label, url)
        // 创建 backend 时用闭包捕获 key —— 这是「事件带源」的关键：
        // BridgeClient 的 onEvent 是构造参数（不可变），不改它，靠闭包传 key。
        conn.backend = RemoteAgentBackend.create(
            onDiagnosis = { reason, code, address -> diagnosisLog.append(reason, code, address) },
        )
        conn.onEvent = { _, ev -> onEvent(key, ev) }
        conn.backend.onEvent = { ev -> conn.onEvent?.invoke(conn, ev) }
        connections[key] = conn
        setStatus(false, getString(R.string.status_connecting))
        conn.backend.bridge.connect(BridgeUrl.buildWsUrl(url, secret))
        return key
    }

    /**
     * 由 URL 推出会话 key（与 [MessageStore.keyFor] 一致）。
     *
     * 隧道地址（wss://域名/…）没有端口，回落默认端口 —— 与
     * [connectWith] 旧实现里 `URI(url).port ?: PORT` 的取法一致，
     * 保证「同一地址无论何时连接，key 恒定」，历史才不会错位。
     */
    private fun keyForUrl(url: String): String {
        val host = runCatching { java.net.URI(url).host }.getOrNull()
            ?: BridgeUrl.hostOf(url).ifBlank { "127.0.0.1" }
        val port = runCatching { java.net.URI(url).port }.getOrNull()?.takeIf { it > 0 }
            ?: BridgeUrl.portOf(url).takeIf { it > 0 }
            ?: PORT
        return MessageStore.keyFor(host, port)
    }

    /**
     * 把某会话设为活动会话：切 activeKey、载入它的历史、更新相关 UI。
     *
     * 与旧的 switchToSession 不同：**不关闭**其它会话的连接，只换「当前看的是谁」。
     *
     * @param persistAddress 是否把该会话地址写进地址栏/持久化（切换会话时为
     *   true；connectWith 里已经写过，故传 false 避免重复）。
     */
    private fun activateSession(key: String, persistAddress: Boolean) {
        val conn = connections[key] ?: return
        activeKey = key
        sessionLabel = conn.label
        if (persistAddress && ::urlInput.isInitialized) {
            urlInput.setText(conn.address)
        }
        // 载入该会话自己的历史（每会话一个 store，见 SessionConn）
        thread {
            val history = conn.store.load()
            runOnUiThread {
                adapter.submit(history)
                if (history.isNotEmpty()) list.scrollToPosition(history.size - 1)
            }
        }
        // 连接中/已连的状态刷新（非活动会话的连接状态不显示在顶栏）
        setStatus(conn.connected, if (conn.connected) getString(R.string.status_connected)
            else getString(R.string.status_connecting))
        sessionFragment?.setCurrentPort(BridgeUrl.portOf(conn.address))
    }

    /**
     * 从持久化配置读地址（不依赖 UI 控件）。
     *
     * 用于「界面尚未就绪」的场景 —— 见 setupFragments 里的说明。
     *
     * **按模式分存**：三种模式的地址形态不同（LAN/USB 是 http://host:port，
     * TUNNEL 是 wss://域名/mobile/ws），共用一个 last_url 会导致切换模式时
     * 把上一模式的地址带过去（LAN 的 IP 填进隧道框、隧道的 wss 填进 LAN 框），
     * 用户每次切模式都要重填。改为每模式各自记，切模式即恢复该模式上次的地址。
     */
    private fun savedAddress(): String = savedAddressFor(appMode)

    /** 取指定模式的持久化地址（含旧 key 的迁移：旧 last_url 归给 LAN）。 */
    private fun savedAddressFor(mode: AppMode): String {
        val key = urlKeyFor(mode)
        val v = prefs.getString(key, null)
        if (!v.isNullOrBlank()) return v
        // 隧道模式没有专属地址时，回落**已记住的隧道地址仓库**
        //（KEY_TUNNEL_URLS，由广播/连接成功两条路径写入）。
        // 不这样的话会回落到 DEFAULT_URL（127.0.0.1:5680 这个无意义的值），
        // 表现为「切到互联网连本机 → 地址栏是垃圾地址，根本连不上」（用户报的）。
        if (mode == AppMode.TUNNEL) {
            val picked = loadTunnelUrls().values.firstOrNull { it.isNotBlank() }
            if (!picked.isNullOrBlank()) return picked
        }
        // 迁移：老版本只有一个 last_url。把它当作 LAN 的地址继承过来，
        // 避免升级后 LAN 模式地址凭空丢失。
        if (mode == AppMode.LAN) {
            val legacy = prefs.getString(KEY_URL, null)
            if (!legacy.isNullOrBlank()) return legacy
        }
        return DEFAULT_URL
    }

    /** 模式的地址存储 key。 */
    private fun urlKeyFor(mode: AppMode): String = KEY_URL_PREFIX + mode.name

    /**
     * 从广播发现里提取隧道地址并存入 TUNNEL 模式的地址。
     *
     * 服务端起 `--tunnel` 时会随 beacon 广播当前 `wss://…/mobile/ws`；手机在
     * 同一 WiFi 收到即自动记住 —— 出门切流量时 TUNNEL 模式已有可用地址，
     * 不必手输（随机子域每次重启都变，手输体验很差）。
     *
     * 只在**地址变化时**写盘，避免每次广播（3 秒一次）都触发一次磁盘写入。
     */
    private fun rememberTunnelUrlFrom(sessions: List<SessionScanner.Session>) {
        // 收集**全部**带隧道地址的实例（多实例 = 多条快隧道各自一条地址）。
        //
        // 原先只取第一条（firstNotNullOfOrNull），多实例场景下会把其余实例
        // 的隧道地址丢掉 —— 隧道模式下手机因此只能连一个会话，切不了别的。
        val withTunnel = sessions.filter { !it.tunnelUrl.isNullOrBlank() }
        if (withTunnel.isEmpty()) return

        val map = loadTunnelUrls().toMutableMap()
        var changed = false
        for (s in withTunnel) {
            val url = s.tunnelUrl ?: continue
            // label 做 key：同一实例的 label 稳定，而子域每次重启都变。
            // label 为空时退回 "port:<端口>"，避免不同实例塌缩到同一个 key。
            val key = s.label.ifBlank { "port:${s.port}" }
            if (map[key] != url) {
                map[key] = url
                changed = true
            }
        }
        if (!changed) return
        // 只在内容真的变化时写盘：广播 3 秒一次，无条件写会频繁触发磁盘 IO。
        saveTunnelUrls(map)

        // 若用户此刻正停在隧道模式，地址框同步刷新为该模式当前选中项
        //（原逻辑用最新收到的那条；这里保持相同行为：取映射里的第一条）。
        val tunnel = map.values.firstOrNull { it.isNotBlank() } ?: return
        if (::urlInput.isInitialized && appMode == AppMode.TUNNEL) {
            runOnUiThread { urlInput.setText(tunnel) }
        }
    }

    /** 读取多实例隧道地址映射（label → wss url）。解析失败按空表处理。 */
    private fun loadTunnelUrls(): Map<String, String> {
        val raw = prefs.getString(KEY_TUNNEL_URLS, null) ?: return emptyMap()
        return runCatching {
            val o = org.json.JSONObject(raw)
            buildMap {
                for (k in o.keys()) {
                    val v = o.optString(k, "")
                    if (v.isNotBlank()) put(k, v)
                }
            }
        }.getOrDefault(emptyMap())
    }

    /** 写盘多实例隧道地址映射。 */
    private fun saveTunnelUrls(map: Map<String, String>) {
        val o = org.json.JSONObject()
        for ((k, v) in map) o.put(k, v)
        prefs.edit().putString(KEY_TUNNEL_URLS, o.toString()).apply()
    }

    /**
     * 隧道模式下取该会话的 wss 地址。
     *
     * 判定顺序：
     * 1. 会话自带 tunnelUrl（广播直接给的，最新最准）；
     * 2. 落盘映射里按 label 命中（广播被路由器拦掉时的兜底）；
     * 3. 都没有 → null（调用方退回 host:port，虽然多半连不通，
     *    但至少给出可诊断的失败，而不是静默不响应）。
     */
    private fun tunnelUrlFor(s: SessionScanner.Session): String? {
        s.tunnelUrl?.takeIf { it.isNotBlank() }?.let { return it }
        val key = s.label.ifBlank { "port:${s.port}" }
        return loadTunnelUrls()[key]?.takeIf { it.isNotBlank() }
    }

    /** 从持久化地址解析主机名。 */
    private fun savedHost(): String = BridgeUrl.hostOf(savedAddress())

    /**
     * 记住一组接入地址：本会话 + 同机其他会话（peers）。
     *
     * ## 为什么要抽成函数
     *
     * 两条路径共用：① 握手时的 `Connected`；② 连接期间地址变化时的
     * `EndpointsUpdated`。服务端会**主动推**后者（隧道换子域、新实例起来）。
     * 两份实现必然漂移 —— 抽一处，改一处即可。
     *
     * ## 落库判据
     *
     * 有地址才记（lan 非空 或 tunnel 非空）：老服务端不带这些字段，
     * 记空地址会让列表出现点不动的僵尸条目。
     *
     * @param key 本会话的连接 key（用于更新其 `connected` 单元 / 后续扩展）
     * @param isActive 本会话是否为当前活动会话（非活动不必刷 UI）
     */
    private fun rememberEndpoints(
        key: String,
        lan: List<String>,
        tunnel: String?,
        label: String,
        cwd: String,
        port: Int,
        resumeSessionId: String?,
        peers: List<BridgeProtocol.Msg.PeerInfo>,
        isActive: Boolean,
    ) {
        if (lan.isNotEmpty() || tunnel != null) {
            knownSessions.upsert(
                knownSessions.fromConnected(
                    mode = appMode,
                    lan = lan,
                    tunnel = tunnel,
                    label = label,
                    cwd = cwd,
                    port = port,
                    resumeSessionId = resumeSessionId,
                ),
            )
        }
        // 同机**其他**会话（服务端 peer 发现）也落库 —— 用户诉求：连上任一
        // 实例即拿到全部会话的 lan/tunnel，据此可通过任一路径连到每个会话。
        peers.forEach { p ->
            if (p.lan.isNotEmpty() || p.tunnel != null) {
                knownSessions.upsert(
                    knownSessions.fromConnected(
                        mode = appMode,
                        lan = p.lan,
                        tunnel = p.tunnel,
                        label = p.label,
                        cwd = "",
                        port = p.port,
                        resumeSessionId = null,
                    ),
                )
            }
        }
        // 连接单元上也更新地址（切换会话时用它拼连接 URL）；
        // 仅当本会话确实有地址时才覆盖（避免把好地址清成空）。
        if (isActive) {
            connections[key]?.let { c ->
                val newAddr = tunnel ?: lan.firstOrNull()
                if (!newAddr.isNullOrBlank()) c.address = newAddr
            }
        }

        // ── 「互联网连本机」地址随连接自动填充（用户反复强调的缺口）──
        //
        // 用户的真实使用路径：先用**局域网**连（快、实时），此时服务端已把
        // 本会话的隧道 wss:// 地址一并下发；把它写进 `last_url_TUNNEL`，
        // 那么**离开 WiFi 切到手机流量时**，只要把工作模式切到「互联网连本机」
        // 就能直接用（地址栏已自动填好），无需手抄那串每次重启都变的随机子域。
        //
        // 此前只在 connectWith 里写「当前模式」的 key，隧道地址永远不进
        // TUNNEL 模式的地址栏 —— 表现为用户说的「界面上根本看不到隧道码，
        // 一关局域网就再也连不上」。
        //
        // 实现上**复用既有的隧道地址仓库**（KEY_TUNNEL_URLS 的 label→url 映射，
        // 原由 UDP 广播路径 rememberTunnelUrlFrom 写入），并同步把「TUNNEL 模式
        // 的地址栏」更新成它 —— 这样用户切到「互联网连本机」时地址已就绪。
        // 不另造 last_url_TUNNEL 存储：两套存储必然漂移（既有代码已在用前者）。
        val withTunnel = buildList {
            if (!tunnel.isNullOrBlank()) add(label.ifBlank { "port:$port" } to tunnel)
            peers.forEach { p ->
                if (!p.tunnel.isNullOrBlank()) {
                    add(p.label.ifBlank { "port:${p.port}" } to p.tunnel)
                }
            }
        }
        if (withTunnel.isEmpty()) return
        val map = loadTunnelUrls().toMutableMap()
        var changed = false
        withTunnel.forEach { (k, url) ->
            if (map[k] != url) {
                map[k] = url
                changed = true
            }
        }
        if (changed) saveTunnelUrls(map)

        // 把最近一条隧道地址**写入 TUNNEL 模式的持久化地址**（last_url_TUNNEL）。
        //
        // 这是「离开 WiFi 也能连」的关键：先在局域网连上（快、实时），
        // 服务端把隧道地址一并下发 → 存进 TUNNEL 模式 → 出门切手机流量时，
        // 工作模式选「互联网连本机」即地址已就绪，无需手抄随机子域。
        val picked = map.values.firstOrNull { it.isNotBlank() }
        if (picked != null) {
            prefs.edit().putString(urlKeyFor(AppMode.TUNNEL), picked).apply()
            // 仅当**用户此刻就在隧道模式**时才刷新输入框。
            // 踩过的错：此前无条件 setText，导致在 LAN 模式下把地址框
            // 改成了 wss://（LAN 框显示隧道地址），而 TUNNEL 模式反而仍是旧值
            //（实测：LAN 框=wss://…、切到隧道模式却还是 127.0.0.1:5680）。
            if (appMode == AppMode.TUNNEL && ::urlInput.isInitialized) {
                runOnUiThread { urlInput.setText(picked) }
            }
        }
    }

    /**
     * 从 IPv4 取 /24 网段前缀（前三段）；非法输入返回 null。
     *
     * 供 preferredSubnet 使用 —— 抽成纯函数便于单测边界（空串、
     * 段数不对、非数字）。刻意不做 IPv4 合法性全检：调用方只关心
     * 「能不能拆出前三段」，拆不出就当无偏好（返回 null）即可。
     */
    internal fun subnetPrefixOf(ip: String): String? {
        val parts = ip.split(".")
        if (parts.size != 4) return null
        if (parts.any { it.isBlank() || it.toIntOrNull() == null }) return null
        return parts.take(3).joinToString(".")
    }

    /** 从持久化地址解析端口。 */
    private fun savedPort(): Int = BridgeUrl.portOf(savedAddress())

    /**
     * 取 /mobile/session-info 的完整 URL，按模式选协议。
     *
     * - LAN：局域网直连 `http://host:port/mobile/session-info`；
     * - TUNNEL：地址是 `wss://域名/mobile/ws`，隧道只暴露 wss + 同源 https，
     *   用 `http://域名:443` 直连不通。改走 `https://域名/mobile/session-info`
     *   —— cloudflared 会把同源 https 转发到本地 server 的同名 HTTP 端点
     *   （mobileBridge.ts:641，不校验 secret），故能命中。
     */
    private fun sessionInfoUrl(): String {
        val addr = savedAddress()
        return if (appMode == AppMode.TUNNEL) {
            "https://${BridgeUrl.hostOf(addr)}/mobile/session-info"
        } else {
            "http://${BridgeUrl.hostOf(addr)}:${BridgeUrl.portOf(addr)}/mobile/session-info"
        }
    }

    /** 取当前地址栏里的主机名；解析失败时回落到回环地址。 */
    private fun currentHost(): String = BridgeUrl.hostOf(urlInput.text.toString())

    /** 取当前地址栏里的端口；解析失败时回落到默认端口。 */
    private fun currentPort(): Int = BridgeUrl.portOf(urlInput.text.toString())

    private fun normalize(raw: String): String = BridgeUrl.normalize(raw)

    // ── 事件处理（BridgeClient 已切回主线程） ──

    /**
     * 会话事件入口（真·并行版）。
     *
     * ## 为什么要带 key
     *
     * 每条连接各有独立的 [BridgeClient]，其事件回调在创建时用闭包捕获了
     * 本会话的 key（见 [ensureConnection]）。事件到达时靠这个 key 判断
     * 「这条消息属于哪个会话」，才能决定是刷当前界面、还是只写进那个
     * 会话自己的历史（并在后台发通知）。
     *
     * ## 分流规则
     *
     * - **连接状态类**（Connected/Disconnected/AuthFailed/SessionLimit）：
     *   无论是否活动，都更新该会话的 `connected` 标志（会话列表要显示
     *   哪些在线）；但只有**活动会话**才动顶栏状态、弹提示。
     * - **内容类**（Incoming/Delta/ToolActivity/…）：只有活动会话才
     *   渲染到 adapter；非活动会话的 [BridgeClient.Event.Incoming] 写入
     *   它自己的 store 并发系统通知（用户点通知切过去能看到完整历史）。
     *
     * @param key 事件来源会话的 key（本地后端为 [LOCAL_KEY]）
     */
    private fun onEvent(key: String, ev: BridgeClient.Event) {
        val conn = connections[key]
        val isActive = SessionRouter.affectsUi(key, activeKey)
        // 连接状态类事件即使非活动也要维护标志
        if (conn != null && SessionRouter.isConnectionStateEvent(ev)) {
            conn.lastActivityAt = System.currentTimeMillis()
            when (ev) {
                is BridgeClient.Event.Connected -> conn.connected = true
                is BridgeClient.Event.Disconnected,
                is BridgeClient.Event.AuthFailed,
                is BridgeClient.Event.SessionLimitReached,
                -> conn.connected = false
                else -> {}
            }
        }

        when (ev) {
            is BridgeClient.Event.Connected -> {
                if (isActive) {
                    // 连上即清失败计数与提示标志 —— 否则下次断开时
                    // 会因为「已经提示过」而不再给出排查线索
                    consecutiveConnectFailures = 0
                    failureHintShown = false
                }
                interactive = ev.interactive
                // 记住本会话（多会话管理）：服务端下发了 lan/tunnel 地址与
                // 标识，落库后会话页无需扫描即可列出它 —— 这是 TUNNEL/户外
                // 场景下唯一能发现会话的途径（扫网段/收广播都失效）。
                // 仅当服务端给了地址才记：老服务端不带这些字段，
                // 记空地址会让列表出现一条点不动的僵尸条目。
                rememberEndpoints(
                    key = key,
                    lan = ev.lan,
                    tunnel = ev.tunnel,
                    label = if (ev.label.isNotBlank()) ev.label else (conn?.label ?: sessionLabel ?: ""),
                    cwd = ev.cwd,
                    port = ev.port,
                    resumeSessionId = ev.resumeSessionId,
                    peers = ev.peers,
                    isActive = isActive,
                )
                // 服务端给的标签回填到连接单元（通知标题区分来源要用）
                if (ev.label.isNotBlank()) conn?.label = ev.label
                if (!isActive) return
                if (ev.interactive) {
                    setStatus(true, getString(R.string.status_connected))
                } else {
                    setStatus(true, getString(R.string.status_noninteractive))
                    appendToSession(key, ChatMessage.system(
                        "⚠ 电脑上的 CLI 运行在非交互模式，消息只会入队、不会被处理。\n" +
                            "请在真实终端里运行 doge.exe（或 node scripts/start-mobile-bridge.mjs），" +
                            "不要用 -p 或重定向 stdin 的方式启动。",
                    ))
                }
                // 补取会话标签：冷启动自动重连路径（onCreate 里的 autoConnect）
                // 拿不到 SessionPickerDialog 回调给的 label，若此处不补，
                // 通知标题恒为「doge-code」，多会话并存时无法判断是哪条对话的回复。
                refreshSessionLabel()
                // 补发通知栏里点过的权限决定。
                // 用户可能在 App 完全没运行时就在通知栏点了「批准」——
                // 那一刻没有连接可发，决定落在磁盘队列里等着。
                // 现在连上了，立刻补发，否则服务端的权限请求会永久悬挂。
                flushPendingPermissions()
                // 拉取当前配置填充设置页 —— 用户改完要知道改没改成功
                refreshRemoteConfig()
                // 自动重发断线期间发失败的消息。
                // 此前这些消息标记为 FAILED 后只能靠用户逐条点「重试」——
                // 而手机断网/切 WiFi 很常见，用户回到 App 时可能积压好几条。
                resendFailedMessages()
            }
            is BridgeClient.Event.Disconnected -> {
                if (!isActive) return
                setStatus(false, getString(R.string.status_disconnected))
                // 断开后中断无意义（服务端已收不到），隐掉按钮避免点了没反应
                stopBtn.visibility = View.GONE
                progress.visibility = View.GONE
                onConnectionFailed()
            }
            is BridgeClient.Event.AuthFailed -> {
                if (!isActive) return
                // 密钥不对是配置问题，重连无用：提示并自动展开设置面板，
                // 否则用户只会看到状态栏「已断开」反复闪，不知道要填密钥。
                setStatus(false, "认证失败：密钥不匹配")
                appendToSession(key, ChatMessage.system(
                    "⚠ 服务端拒绝了连接（密钥不匹配）。\n" +
                        "请在「连接设置」里把密钥填成与 CLAUDE_CODE_MOBILE_SECRET 相同的值" +
                        "（若服务端没设密钥则留空）。",
                ))
            }
            is BridgeClient.Event.SessionLimitReached -> {
                if (!isActive) return
                // 同一 CLI 上的设备数已达上限（服务端 4002）。与认证失败不同，
                // 这是可恢复的：关掉一台旧设备后会自动重连。故不展开设置面板，
                // 只给出明确原因，避免用户像从前那样只看到「已断开，重连中…」
                // 反复闪却不知为何连不上。
                setStatus(false, "设备数已满")
                appendToSession(key, ChatMessage.system(
                    "⚠ 该 CLI 上连接的设备数已达上限（服务端 4002）。\n" +
                        "请在另一台设备上断开，或稍候自动重连（每 30 秒重试一次）。",
                ))
            }
            is BridgeClient.Event.EndpointsUpdated -> {
                // 连接期间服务端推来的地址更新（隧道换子域、新实例起来）。
                // 落库更新本会话地址与 peer 会话 —— 否则手机一直用旧地址。
                rememberEndpoints(
                    key = key,
                    lan = ev.lan,
                    tunnel = ev.tunnel,
                    label = conn?.label ?: (sessionLabel ?: ""),
                    cwd = "",
                    port = conn?.let { BridgeUrl.portOf(it.address) } ?: 0,
                    resumeSessionId = null,
                    peers = ev.peers,
                    isActive = isActive,
                )
            }
            is BridgeClient.Event.Incoming -> {
                // 非活动会话：不碰 UI，只落进它自己的历史 + 发通知。
                // 这正是「真·并行」的价值：后台会话照常收回复，用户切过去
                // 能看到完整历史，且不必事先盯着它。
                if (!isActive) {
                    handleBackgroundIncoming(key, ev)
                    return
                }
                // 服务端会把消息广播给所有连接的设备（多设备同步）：B 设备
                // 需要看到 A 发的消息。但自己刚发的那条本地已回显过，服务端
                // 又把同一文本（带当初的 requestId 作为 sourceRequestId）推回来，
                // 直接 append 会出现重复气泡。
                //
                // 去重判据（精确，不依赖时序）：
                // 回推消息带 sourceRequestId，且命中 sentReqIds 中尚未去重的
                // 那条 → 说明正是自己刚发的那条，跳过并从集合移除。
                //
                // 为何不再用文本+SENDING 的旧判据：queued 回执几乎必然先于
                // user 回推到达，届时本地状态已转 QUEUED，旧判据失效 → 重复。
                // 现在用 requestId 精确匹配，彻底摆脱时序依赖。
                //
                // 仍保留旧文本+SENDING 判据作为兜底：旧服务端（未带 sourceRequestId）
                // 或 B 设备（自己没发过、本集合为空）下，旧逻辑仍可挡住最常见
                // 的同文本回推重复。两者任一命中即去重。
                val isEcho = TurnState.isOwnEcho(
                    incomingRole = ev.role,
                    incomingText = ev.text,
                    local = adapter.snapshot().map {
                        TurnState.EchoCandidate(it.role, it.text, it.status.name)
                    },
                ) || (ev.sourceRequestId.isNotEmpty() && sentReqIds.remove(ev.sourceRequestId))
                // 定稿消息到达：清掉流式预览（它是权威版本，可能更长/更完整）。
                // 必须在 append 之前清，否则预览气泡会短暂与定稿气泡并存。
                if (ev.role == "assistant") clearStreamingState()
                if (!isEcho) {
                    appendToSession(
                        key,
                        ChatMessage(ChatMessage.newId(), ev.role, ev.text, System.currentTimeMillis()),
                        suppressNotify = ev.suppressNotify,
                    )
                }
                // 语音播报「任务已完成」+ 回复首句。
                //
                // 三个刻意的取舍：
                // 1. 放在 maybeNotify 之外 —— 那个函数在 App 前台时早退，
                //    而用户要求前台也播报（正在看屏幕也想知道结束了）。
                // 2. `!isEcho` —— 回声是自己刚发的消息被回推，播报它毫无意义。
                // 3. 只认 assistant 且文本非空 —— 空回复（如只有工具调用）
                //    播报一句「任务已完成」即可，由 completionSpeech 处理。
                if (ev.role == "assistant" && !isEcho) {
                    announceCompletion(ev.text)
                }
                // 助手回合结束：收起「中断」与进度条。system/user 入站不代表回合结束
                // （system 可能是回合中的提示），故只认 assistant。
                if (TurnState.endOnIncoming(ev.role)) endTurn()
            }
            is BridgeClient.Event.Queued -> {
                if (!isActive) return
                val id = pending.entries.firstOrNull { it.value == ev.requestId }?.key
                if (id != null) {
                    adapter.updateStatus(id, ChatMessage.Status.QUEUED)
                    pending.remove(id)
                    persist()
                }
            }
            is BridgeClient.Event.Error -> {
                if (!isActive) return
                appendToSession(key, ChatMessage.system("错误：${ev.message}"))
            }
            is BridgeClient.Event.PermissionRequested -> {
                // 弹窗前的自动裁决闸门：先查「逐条授权规则」
                // 命中 always_allow/always_deny 时直接回传、不再弹窗；
                // 只有 "ask"（含无规则）才走原弹窗逻辑。
                val policy = PermissionRules.getPolicy(this, ev.toolName)
                val auto = PermissionRules.decide(policy)
                if (auto != null) {
                    // 用户已预授权：默默按规则裁决，不弹窗也不播报（无需打断）。
                    // 仍写系统消息让用户知道这次操作被规则自动放行/拦截了。
                    submitPermissionDecision(
                        ev.requestId, auto, "规则自动裁决($policy)", ev.toolName,
                    )
                } else {
                    // 权限请求是**阻塞等待**：无论来自哪个会话都应提醒（否则
                    // AI 卡着不动而用户不知道）。弹窗本身只在活动会话时弹出，
                    // 但通知栏的「批准/拒绝」对后台会话也发 —— 这正是
                    // Notifications.notifyPermission 支持 label 的意义。
                    if (isActive) {
                        showPermissionDialog(ev)
                    } else if (localPrefs.getBool(LocalPrefs.KEY_NOTIFY_ACTION) && !hasWindowFocus()) {
                        Notifications.notifyPermission(
                            this, ev.requestId, ev.toolName, ev.description,
                            conn?.label ?: sessionLabel,
                            silent = !localPrefs.getBool(LocalPrefs.KEY_NOTIFY_SOUND),
                        )
                    }
                    // 语音提醒（若开启）：批准是阻塞等待，比完成更该主动叫人
                    announcePermission(ev.toolName)
                }
            }
            is BridgeClient.Event.PermissionCancelled -> {
                if (isActive) dismissPermissionDialog(ev.requestId)
            }
            is BridgeClient.Event.Delta -> {
                if (isActive) onStreamDelta(ev)
            }
            is BridgeClient.Event.TurnEnd -> {
                // 权威回合结束信号：无论本回合有无 assistant 文本，服务端都会
                // 在定稿到达时推 turn_end。此前只认 role=assistant 收起回合，
                // 「只调工具不出文本」的回合会永久卡在「返回中」。见 TurnState。
                if (isActive) endTurn()
            }
            is BridgeClient.Event.ToolActivity -> {
                if (isActive) onToolActivity(ev)
            }
            is BridgeClient.Event.Usage -> {
                if (isActive) onUsage(ev)
            }
        }
    }

    /**
     * 后台会话收到入站消息：写进它自己的历史 + 发系统通知，**不碰 UI**。
     *
     * ## 为什么要单独一条路径
     *
     * 活动会话的消息走 [appendToSession] → 渲染到 adapter。后台会话没有
     * 可见的 adapter，但**必须持久化**（用户切过去要能看到）且**应发通知**
     *（否则用户不知道那条会话有回复）。这两件事都不能走 UI 路径。
     *
     * ## 只提醒 assistant 回复
     *
     * user/system 入站（如多设备同步里别人发的）不打扰 —— 与前台
     * maybeNotify 的口径一致（见 SessionRouter.shouldNotifyBackground）。
     */
    private fun handleBackgroundIncoming(key: String, ev: BridgeClient.Event.Incoming) {
        val conn = connections[key] ?: return
        conn.lastActivityAt = System.currentTimeMillis()
        val msg = ChatMessage(ChatMessage.newId(), ev.role, ev.text, System.currentTimeMillis())
        // 追加到该会话自己的历史文件（不动 adapter）
        val history = conn.store.load()
        history.add(msg)
        conn.store.saveAsync(history)
        // 通知（仅 assistant 回复、且用户没在看着这台手机）
        if (SessionRouter.shouldNotifyBackground(ev.role, ev.text) &&
            localPrefs.getBool(LocalPrefs.KEY_NOTIFY_REPLY) &&
            !hasWindowFocus()
        ) {
            Notifications.notifyAssistant(
                this, ev.text, conn.label,
                silent = !localPrefs.getBool(LocalPrefs.KEY_NOTIFY_SOUND),
                sessionKey = key,
            )
        }
    }

    /**
     * 收到回合用量快照。
     *
     * 显示在活动区面板的最后一行（不新增 UI 元素）：
     * 活动区本就是「本轮过程信息」的容器，用量同属这一类；
     * 回合结束时会随活动区一起保留到下一轮开始，用户看得见刚跑完的消耗。
     *
     * 只保留**最新一条**用量行：它是累计值，多行堆叠毫无意义
     * （第一行永远是旧的、更小的数），反而让人以为「用量在乱跳」。
     */
    private fun onUsage(ev: BridgeClient.Event.Usage) {
        val line = UsageFormat.line(
            ev.inputTokens, ev.outputTokens, ev.durationMs, ev.costUSD,
        )
        if (line.isBlank()) return
        // 移除上一次的用量行（以「Σ 」开头作标记），避免堆叠
        activityLines.removeAll { it.startsWith(USAGE_LINE_PREFIX) }
        activityLines.addLast(USAGE_LINE_PREFIX + line)
        while (activityLines.size > MAX_ACTIVITY_LINES) activityLines.removeFirst()
        activityText.text = activityLines.joinToString("\n")
        activityPanel.visibility = View.VISIBLE
    }

    /**
     * 收到一段流式增量。
     *
     * 用「累积 + 单个预览气泡」而非逐段追加气泡：后者会让每条 delta
     * 变成一条消息，列表瞬间被几十个碎片撑爆。
     *
     * 跳号检测：seq 不连续说明中间丢了片段。此时不试图修补（拼不回来），
     * 只记日志 —— 定稿消息到达时会用完整内容替换，用户最终看到的是对的。
     */
    private fun onStreamDelta(ev: BridgeClient.Event.Delta) {
        if (lastDeltaSeq != 0 && ev.seq != lastDeltaSeq + 1) {
            android.util.Log.w(TAG, "流式增量跳号: 期望 ${lastDeltaSeq + 1} 实得 ${ev.seq}")
        }
        lastDeltaSeq = ev.seq
        streamingBuffer.append(ev.text)
        // 「流式显示」关闭时不渲染增量预览 —— 等定稿消息到达再整体显示。
        // 好处：省电省流量，且避免长回复时列表频繁重绘。
        // 注意仍要累积到 buffer（定稿时清空），只是不推给 Adapter。
        if (streamPrefsCache) {
            adapter.setStreamingPreview(streamingBuffer.toString())
        }
        // 尊重「自动滚动」偏好：此前这里**无条件**滚到底，导致用户关了
        // 自动滚动、正在往上翻看历史时，被流式增量不断拽回底部 ——
        // 「自动滚动」这个开关等于对该路径失效。
        if (autoScrollPrefsCache && adapter.itemCount > 0) {
            list.scrollToPosition(adapter.itemCount - 1)
        } else {
            // 没自动滚（用户关了它，或在翻历史）：有新内容时给个提示，
            // 否则用户不知道下面还有新消息
            markUnseen()
        }
    }

    /**
     * 标记「有新消息未看到」——显示右下角的悬浮提示。
     *
     * 只在**用户不在底部**时才有意义：已在底部说明他正看着新消息，
     * 再提示反而是噪音。
     */
    private fun markUnseen() {
        val lm = list.layoutManager as? androidx.recyclerview.widget.LinearLayoutManager
        // 未布局时 findLastVisibleItemPosition 返回 -1；
        // 判据交给 UnseenMarker 统一处理（那里把 -1 当作「在看最新」）
        val last = lm?.findLastVisibleItemPosition() ?: -1
        if (UnseenMarker.shouldMark(adapter.itemCount, last)) {
            unseenCount++
            updateUnseenBadge()
        }
    }

    /**
     * 刷新未读提示的显示（文案带条数，让用户知道积了多少）。
     *
     * 同时负责它与「滚动到底」箭头按钮的**互斥显隐**：两者占同一块
     * 区域，同时出现会重叠。有未读时优先显示未读（信息量更大），
     * 否则按「是否在底部」决定要不要显示箭头。
     */
    private fun updateUnseenBadge() {
        val badge = findViewById<android.widget.TextView?>(R.id.btn_unseen) ?: return
        val arrow = findViewById<ImageButton?>(R.id.btn_scroll_bottom) ?: return
        val text = UnseenMarker.badgeText(unseenCount)
        if (text.isNotEmpty()) {
            badge.visibility = View.VISIBLE
            badge.text = text
            arrow.visibility = View.GONE
        } else {
            badge.visibility = View.GONE
            // 无未读时，箭头是否显示交由「是否在底部」决定
            arrow.visibility = if (isNearBottom()) View.GONE else View.VISIBLE
        }
    }

    /** 当前是否已接近列表底部。 */
    private fun isNearBottom(): Boolean {
        val lm = list.layoutManager as? androidx.recyclerview.widget.LinearLayoutManager
        return UnseenMarker.isNearBottom(adapter.itemCount, lm?.findLastVisibleItemPosition() ?: -1)
    }

    /** 滚到底部时清掉未读提示。 */
    private fun clearUnseen() {
        if (unseenCount == 0) return
        unseenCount = 0
        updateUnseenBadge()
    }

    /**
     * 监听滚动：滚到接近底部即视为「已看到最新」，清掉未读提示。
     *
     * 阈值取 2 项：最后一项通常只露出一部分，要求「完全到底」才清除
     * 会让提示挂着不走（用户以为还有更多）。
     */
    private fun bindScrollListener() {
        list.addOnScrollListener(object : androidx.recyclerview.widget.RecyclerView.OnScrollListener() {
            override fun onScrolled(rv: androidx.recyclerview.widget.RecyclerView, dx: Int, dy: Int) {
                // 滚到底部 → 视作已看到最新，清除未读
                if (isNearBottom()) clearUnseen()
                // 统一由 updateUnseenBadge 决定两块 UI 的显隐
                updateUnseenBadge()
            }
        })
    }

    /**
     * 收到一条工具活动。
     *
     * 分两条路径：
     * - agent（子代理）→ 渲染在独立的紧凑「活动区」（进度类信息，不落历史）
     * - tool / thinking → 落成**可折叠工具气泡**进消息列表，回合结束后仍在历史。
     *   running 事件新建气泡；done/error 结果事件按 toolUseId 配对合并进
     *   同一条气泡，避免「运行中」与「结果」各占一条把列表刷爆。
     */
    private fun onToolActivity(ev: BridgeClient.Event.ToolActivity) {
        if (ev.kind == "agent") {
            val line = buildString {
                append("◈ ").append(ev.name)
                if (ev.target.isNotBlank()) append("  ").append(ev.target)
            }
            // 同一工具的连续同名活动只保留最新一条，避免 Bash 每秒一条刷屏
            if (activityLines.lastOrNull()?.startsWith("◈ " + ev.name) == true) {
                activityLines.removeLast()
            }
            activityLines.addLast(line)
            while (activityLines.size > MAX_ACTIVITY_LINES) activityLines.removeFirst()
            activityText.text = activityLines.joinToString("\n")
            activityPanel.visibility = android.view.View.VISIBLE
            agentStopBtn.visibility = View.VISIBLE
            agentStopBtn.setOnClickListener {
                activeBackend.interrupt()
                append(ChatMessage.system("已请求终止子代理"))
            }
            return
        }

        // tool / thinking：结果事件按 toolUseId 配对合并，running 新建气泡
        val isResult = ev.state == "done" || ev.state == "error"
        if (isResult) {
            val existingId = ChatMessage.findRunningToolCallId(adapter.snapshot(), ev.toolUseId)
            if (existingId != null) {
                adapter.updateToolResult(
                    existingId, ev.result, ev.state, ev.truncated, ev.fullLength,
                )
                if (autoScrollPrefsCache && adapter.itemCount > 0) {
                    list.scrollToPosition(adapter.itemCount - 1)
                }
                persist()
                return
            }
            // 结果先于 running 乱序到达（或列表裁剪挤掉了 running 气泡）：
            // 新建一条结果气泡兜底，不让命令输出丢失。
        }

        val title = buildString {
            if (ev.kind == "thinking") {
                append("🧠 思考")
            } else {
                append("▸ ").append(ev.name.ifBlank { "工具" })
                if (ev.target.isNotBlank()) append("  ").append(ev.target)
            }
        }
        val state = if (ev.kind == "thinking" && ev.state == "running") "thinking" else ev.state
        val msg = ChatMessage.tool(
            title = title,
            detail = ev.detail,
            result = ev.result,
            state = state,
            toolUseId = ev.toolUseId,
            truncated = ev.truncated,
            fullLength = ev.fullLength,
        )
        // 若上一条不是工具气泡，则本条形如「组的第一条」：给它写折叠键。
        // 折叠键必须由**组首成员**携带（TurnGrouping 按首成员算组键），
        // 写在后续成员上会被忽略，导致折叠态读了不生效。
        val prev = adapter.snapshot().lastOrNull()
        val msgWithGroup = if (prev == null || !prev.isTool) {
            msg.copy(turnGroupKey = TurnGrouping.collapseKeyFor(msg.id))
        } else {
            msg
        }
        append(msgWithGroup)
    }

    /** 清空流式预览与活动区（收到定稿消息 / 回合结束时调用）。 */
    private fun clearStreamingState() {
        if (streamingBuffer.isNotEmpty()) {
            streamingBuffer.setLength(0)
            adapter.setStreamingPreview(null)
        }
        lastDeltaSeq = 0
        if (activityLines.isNotEmpty()) {
            activityLines.clear()
            activityText.text = ""
            activityPanel.visibility = android.view.View.GONE
        }
        // 回合结束，子代理要么已完成要么已被终止 —— 收起按钮
        agentStopBtn.visibility = View.GONE
    }

    /**
     * 弹出远程权限确认对话框。
     *
     * 为什么必须做：在此之前，AI 要执行需授权的操作（写文件、跑命令）时，
     * 请求只在**电脑终端**弹出，手机端完全无感 —— 远程使用时用户无法批准
     * 任何操作，等于「能看不能说」。
     *
     * 同时发一条通知：用户可能没盯着屏幕，而这是最需要提醒的时刻。
     *
     * 用 AlertDialog 而非塞进消息列表：权限请求是**阻塞当前操作**的模态
     * 决策，混在聊天气泡里会被后续消息刷走，用户找不到。
     */
    private fun showPermissionDialog(ev: BridgeClient.Event.PermissionRequested) {
        // 同一 requestId 重复到达时不弹第二个（服务端理论上只发一次，
        // 但重连后可能重放）
        if (permissionDialogs.containsKey(ev.requestId)) return

        val body = buildString {
            append("工具：").append(ev.toolName).append('\n')
            if (ev.description.isNotBlank()) append(ev.description).append('\n')
            // 有 diff 时不再重复 inputPreview —— diff 已包含改动内容，
            // 两者并列会让对话框过长且信息重复
            if (ev.diffLines.isEmpty() && ev.inputPreview.isNotBlank()) {
                append('\n').append(ev.inputPreview)
            }
            if (ev.diffLines.isNotEmpty()) {
                append('\n').append("改动预览：").append('\n')
            }
        }

        val dialog = android.app.AlertDialog.Builder(this)
            .setTitle("⚠ 需要批准")
            .apply {
                if (ev.diffLines.isEmpty()) {
                    setMessage(body)
                } else {
                    // 有 diff 时用等宽 + 着色的 TextView：
                    // 默认的 setMessage 无法给单行上色，用户分不清哪行是增哪行是删
                    setView(android.widget.ScrollView(this@MainActivity).apply {
                        addView(buildDiffView(body, ev.diffLines))
                    })
                }
            }
            .setPositiveButton("批准") { _, _ ->
                submitPermissionDecision(ev.requestId, "allow", "App 内批准", ev.toolName)
            }
            .setNegativeButton("拒绝") { _, _ ->
                submitPermissionDecision(ev.requestId, "deny", "App 内拒绝", ev.toolName)
            }
            .setCancelable(false)   // 必须明确选择，避免误触返回键留下悬挂的请求
            .create()
        permissionDialogs[ev.requestId] = dialog
        dialog.setOnDismissListener { permissionDialogs.remove(ev.requestId) }
        runCatching { dialog.show() }

        if (!hasWindowFocus()) {
            // 「需介入通知」关闭时不弹 —— 权限请求仍会在 App 内的对话框里出现
            if (localPrefs.getBool(LocalPrefs.KEY_NOTIFY_ACTION)) {
                Notifications.notifyPermission(
                    this,
                    ev.requestId,
                    ev.toolName,
                    ev.description,
                    sessionLabel,
                    silent = !localPrefs.getBool(LocalPrefs.KEY_NOTIFY_SOUND),
                )
            }
        }
    }

    /**
     * 重发所有处于 FAILED 状态的消息。
     *
     * 场景：手机断网、切 WiFi、或服务端重启期间发出的消息全部失败。
     * 此前它们只能靠用户逐条点「重试」，而用户回到 App 时可能积压好几条。
     *
     * 只重发 user 消息，且**保持原顺序**（列表本身有序，正序遍历即可）：
     * 顺序对对话语义有影响，倒序重发会让 AI 看到颠倒的上下文。
     *
     * 不做「失败次数上限」：一次连接建立后统一重试一遍是安全的
     * —— 若这次仍失败，说明连接又断了，会等下一次 Connected 再试。
     * 加计数反而会在长时间离线后永久放弃重发。
     */
    private fun resendFailedMessages() {
        val failed = adapter.snapshot().filter {
            it.role == "user" && it.status == ChatMessage.Status.FAILED
        }
        if (failed.isEmpty()) return

        var resent = 0
        for (m in failed) {
            val reqId = ChatMessage.newId()
            pending[m.id] = reqId
            adapter.updateStatus(m.id, ChatMessage.Status.SENDING)
            if (activeBackend.send(m.text, reqId)) {
                resent++
            } else {
                // 刚连上又断了：恢复失败态，等下次 Connected
                adapter.updateStatus(m.id, ChatMessage.Status.FAILED)
                pending.remove(m.id)
                break
            }
        }
        if (resent > 0) {
            append(ChatMessage.system("已自动重发 $resent 条未送达的消息"))
            if (TurnState.startOnSend(true, interactive)) startTurn()
        }
        persist()
    }

    /**
     * 提交一次权限决定（App 内与通知栏两条路径统一走这里）。
     *
     * **先落盘再发送**，与通知栏路径一致。理由：用户点「批准」的瞬间连接
     * 可能刚好断开（切网/服务端重启），此时 `sendPermissionResponse`
     * 返回 false —— 若只发送不落盘，这个决定就丢了，而服务端会一直等。
     * 落盘后由 flushPendingPermissions 在下次连接时补发。
     *
     * 发送成功也要清队列：否则下次连接会重复发送同一条决定。
     */
    private fun submitPermissionDecision(
        requestId: String,
        behavior: String,
        source: String,
        toolName: String,
    ) {
        PermissionDecisionStore.enqueue(this, requestId, behavior, source)
        val ok = client?.sendPermissionResponse(requestId, behavior) == true
        if (ok) {
            PermissionDecisionStore.remove(this, requestId)
            val verb = if (behavior == "allow") "已批准" else "已拒绝"
            append(ChatMessage.system("$verb：$toolName"))
        } else {
            // 保留在队列，等重连后补发
            append(ChatMessage.system("⚠ 连接已断开，决定将在重连后补发：$toolName"))
        }
    }

    /** 服务端撤销（本地终端已先决定）→ 关掉对应对话框，避免留下无效卡片。 */
    private fun dismissPermissionDialog(requestId: String) {
        val d = permissionDialogs.remove(requestId) ?: return
        runCatching { d.dismiss() }
        append(ChatMessage.system("该请求已在电脑终端处理"))
    }

    /**
     * 构建带着色的 diff 预览视图。
     *
     * 用 Spannable 而非多个 TextView：diff 可能有几十行，逐行建 View
     * 在对话框里开销大且滚动体验差。用等宽字体保证对齐。
     *
     * 着色规则：+ 行绿色、- 行红色、其它灰色。
     * 只给整行上色（含行首符号），比只染符号更易扫读。
     */
    private fun buildDiffView(header: String, diffLines: List<String>): android.widget.TextView {
        val sb = android.text.SpannableStringBuilder()
        sb.append(header)
        val GREEN = 0xFF6BD66B.toInt()
        val RED = 0xFFF87171.toInt()
        val GREY = 0xFF999999.toInt()
        diffLines.forEach { line ->
            val start = sb.length
            sb.append(line).append('\n')
            val color = when {
                line.startsWith("+") -> GREEN
                line.startsWith("-") -> RED
                else -> GREY
            }
            sb.setSpan(
                android.text.style.ForegroundColorSpan(color),
                start, sb.length,
                android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
            // 用字符串构造器而非 Typeface 那个：后者需 API 28，
            // 而本工程 minSdk=24，在 Android 7/8 上会抛
            // 「Call requires API level 28」—— lint 会直接拦下来。
            // 字符串形式自 API 1 起可用，且效果相同。
            sb.setSpan(
                android.text.style.TypefaceSpan("monospace"),
                start, sb.length,
                android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
        }
        return android.widget.TextView(this).apply {
            text = sb
            textSize = 12f
            setPadding(40, 24, 40, 24)
            setTextIsSelectable(true)   // 允许复制，用户可能想存下改动内容
        }
    }

    /**
     * 静默关闭对话框（用户已在通知栏做了决定）。
     *
     * 与 [dismissPermissionDialog] 分开的原因：那条会追加
     * 「该请求已在电脑终端处理」，而此处的原因是「你刚在通知栏处理了」——
     * 提示内容不同，复用会让用户困惑自己到底在哪处理的。
     * 且补发路径已有自己的汇总提示，这里不必再逐条刷消息。
     */
    private fun dismissPermissionDialogSilently(requestId: String) {
        val d = permissionDialogs.remove(requestId) ?: return
        runCatching { d.dismiss() }
    }

    /**
     * 拉取服务端当前生效的配置，填充设置页的「当前值」。
     *
     * 失败时保持「—」不变：配置显示不准比不显示更误导，
     * 用户会据此判断「刚才那次修改生效了吗」。
     */
    private fun refreshRemoteConfig() {
        thread {
            val snapshot = SessionScanner.configFrom(SessionScanner.fetchSessionInfo(sessionInfoUrl()))
            if (snapshot == null) return@thread
            runOnUiThread {
                settingsFragment?.showConfigValue(
                    ConfigRows(
                        model = snapshot.model,
                        thinking = snapshot.thinkingTokens?.let {
                            if (it == 0) "关闭" else "$it tokens"
                        },
                        permission = snapshot.permissionMode,
                    ),
                )
                // 配置页也刷新（它可能正开着）
                configSourceLabels = ConfigSourceLabels.from(snapshot.sources)
                (supportFragmentManager.findFragmentByTag("config") as? ConfigFragment)
                    ?.showValues(
                        snapshot.model,
                        snapshot.thinkingTokens?.let { if (it == 0) "关闭" else "$it tokens" },
                        snapshot.permissionMode,
                        configSourceLabels,
                        snapshot.verbose,
                    )
            }
        }
    }

    /** 设置页要显示的三项当前值。null 表示未知（显示「—」）。 */
    data class ConfigRows(val model: String?, val thinking: String?, val permission: String?)

    /**
     * 配置值的来源标签（线 C3）。
     *
     * 把服务端的字符串映射成中文可读文案。**未知来源返回 null** ——
     * 显示一个「未知来源」的标签比不显示更让人困惑。
     */
    data class ConfigSourceLabels(
        val model: String?,
        val thinking: String?,
        val permission: String?,
    ) {
        companion object {
            fun empty() = ConfigSourceLabels(null, null, null)

            fun from(sources: Map<String, String>): ConfigSourceLabels {
                if (sources.isEmpty()) return empty()
                return ConfigSourceLabels(
                    model = label(sources["model"]),
                    thinking = label(sources["thinkingTokens"]),
                    permission = label(sources["permissionMode"]),
                )
            }

            private fun label(raw: String?): String? = when (raw) {
                "mobile" -> "手机设置"
                "env" -> "环境变量"
                "settings" -> "配置文件"
                "default" -> "默认"
                else -> null
            }
        }
    }

    /**
     * 拉取当前连接会话的标签，用于通知标题区分来源。
     *
     * 判据来自服务端的 /mobile/session-info（见 src/bridge/mobileBridge.ts）。
     * 失败时保持原值不变 —— 标签只是通知标题的锦上添花，探测失败不该
     * 把已有标签（比如用户刚从会话列表选的那个）清掉。
     */
    private fun refreshSessionLabel() {
        thread {
            val label = SessionScanner.labelFrom(SessionScanner.fetchSessionInfo(sessionInfoUrl()))
            if (label != null) {
                runOnUiThread { sessionLabel = label }
            }
        }
    }

    private fun setStatus(ok: Boolean, label: String) {
        dot.setBackgroundResource(if (ok) R.drawable.dot_on else R.drawable.dot_off)
        statusText.text = label
        sendBtn.isEnabled = ok
        sendBtn.alpha = if (ok) 1f else 0.4f
        // 连接期间给顶部那条 2dp 进度条一个存在理由；连上后由回合状态接管
        progress.visibility = if (ok) View.GONE else View.VISIBLE
    }

    /** 回合开始：显示「中断」按钮与进度条（此前按钮恒为 gone，中断形同虚设）。 */
    private fun startTurn() {
        stopBtn.visibility = View.VISIBLE
        progress.visibility = View.VISIBLE
        updateLocalService()
    }

    /** 回合结束（收到助手回复 / 断开）：收起中断按钮与进度条。 */
    private fun endTurn() {
        stopBtn.visibility = View.GONE
        progress.visibility = View.GONE
        // 回合结束，清理尚未被回推命中的 sentReqIds 残留项。
        // 正常情况回推已在助手回复前命中并移除；若迟迟未到（如服务端异常、
        // 或该消息未走 mobileBridge 推送路径），不应让其永久留在集合里——
        // 否则后续别人发来相同 requestId（极小概率）会被误吞。
        // 集合只保留「待回推去重」语义，回合边界处一次性清空最稳妥。
        sentReqIds.clear()
        updateLocalService()
    }

    /**
     * 本地模式回合期间启动前台服务保活（推理可达数十秒，切后台进程
     * 被杀则任务丢失且 API 费用白花）。远端模式推理跑在电脑上，
     * 手机进程被杀不影响任务，无需保活。判据见 [ServicePolicy]。
     */
    private fun updateLocalService() {
        val inTurn = stopBtn.visibility == View.VISIBLE
        if (ServicePolicy.shouldRun(appMode, inTurn)) {
            LocalAgentService.start(this, inTurn)
        } else {
            LocalAgentService.stop(this)
        }
    }

    /**
     * 追加一条消息并渲染。
     *
     * @param suppressNotify 服务端告知「用户正在电脑终端前」。
     *   此时仍渲染消息，但不弹系统通知 —— 抑制的是**通知**而非消息，
     *   用户切回手机时能看到完整历史，只是没被震一下。
     *   不这么做的后果是通知渠道被整体关闭：AI 每轮震一下，
     *   人会烦到关掉通知权限，连真正需要介入的权限请求也一并静音。
     */
    private fun append(msg: ChatMessage, suppressNotify: Boolean = false) {
        val pos = adapter.append(msg)
        // 「自动滚动」关闭时不滚 —— 便于用户回看历史时不被新消息打断
        if (autoScrollPrefsCache) {
            list.scrollToPosition(pos)
        }
        persist()
        maybeNotify(msg, suppressNotify)
    }

    /**
     * 向**指定会话**追加一条消息。
     *
     * - 该会话是活动会话（或本地模式）→ 渲染到 adapter 并落盘（等价旧 append）
     * - 否则 → 只写入它自己的历史文件，**不碰 UI**（后台会话不打扰当前界面）
     *
     * 事件分流都走这里，避免「后台消息误渲到当前界面」这类串味。
     */
    private fun appendToSession(key: String, msg: ChatMessage, suppressNotify: Boolean = false) {
        if (appMode.isCloudAgent || key == LOCAL_KEY || SessionRouter.affectsUi(key, activeKey)) {
            append(msg, suppressNotify)
        } else {
            val conn = connections[key] ?: return
            val history = conn.store.load()
            history.add(msg)
            conn.store.saveAsync(history)
        }
    }

    private fun persist() {
        store?.saveAsync(adapter.snapshot())
    }

    // ── 发送 ──

    private fun sendCurrent() {
        val text = msgInput.text.toString().trim()
        val image = inputActions.pendingImage
        // 纯图不带文字是合法输入（拍张报错截图问 AI 很常见），
        // 因此判据是「两样都空」才不入站
        // 纯附件（无文字）是合法输入：贴个日志让 AI 看很常见
        if (text.isEmpty() && image == null && inputActions.pendingTextAttachments().isEmpty()) return
        // 用 activeBackend.isReady 而非 client.isConnected：
        // 本地模式**没有「连接」概念**（配好 API key 即可用），
        // 用 isConnected 做守卫会让本地模式下恒被拦下、提示「未连接」——
        // 而那正是用户已经正确配置的状态。
        if (!activeBackend.isReady) {
            val hint = if (appMode.isCloudAgent) {
                "未配置 API：请在设置 → 云端模式里填写密钥与地址"
            } else {
                "未连接，请先在设置里连接"
            }
            Toast.makeText(this, hint, Toast.LENGTH_SHORT).show()
            return
        }

        // 斜杠命令：不在可用清单里时立刻提示，不等服务端往返。
        //
        // 服务端对未知命令的处理是「回一句 /xxx 在远程控制中不可用」，
        // 那要等一轮网络往返；而且**在此之前用户看到的是一条自己发的
        // 气泡**，会以为命令被执行了。提前提示更准确。
        //
        // 只提示、不拦截：服务端才是白名单权威，客户端误判时拦住
        // 发不出去，比让服务端礼貌拒绝更糟。
        if (SlashCommands.looksLikeCommand(text) &&
            !SlashCommands.isKnown(text, currentCommandScope())
        ) {
            Toast.makeText(
                this,
                "该命令在手机端不可用（可用：${SlashCommands.matching("/", currentCommandScope())
                    .joinToString(" ") { it.label }}）",
                Toast.LENGTH_LONG,
            ).show()
            return
        }

        // 本地专属命令：客户端直接处理，不发给模型（模型看不到工作区/配置/工具清单，
        // 发过去只会编答案）
        if (handleLocalCommand(text)) return

        // 气泡文本里标出附图，否则回看历史时不知道那句「看看这个」指的是什么
        val textLabel = TextAttachment.bubbleLabel(inputActions.pendingTextAttachments())
        val display = buildString {
            append(text)
            if (textLabel.isNotEmpty()) {
                if (isNotEmpty()) append('\n')
                append(textLabel)
            }
            if (image != null) {
                if (isNotEmpty()) append('\n')
                append("[图片]")
            }
            if (isEmpty()) append("[附件]")
        }
        // 带图片时必须走 userWithImages：把 base64 一并存进消息，否则
        // 对话里只剩一个「[图片]」文本，回看时看不到自己发了什么图
        //（「拍张报错截图问 AI」是本客户端的主要用法，回看时尤其需要）。
        val msg = if (image != null) {
            ChatMessage.userWithImages(display, listOf(image.second), image.first)
        } else {
            ChatMessage.user(display)
        }
        val reqId = ChatMessage.newId()
        pending[msg.id] = reqId
        sentReqIds.add(reqId)   // 入去重集合，等回推命中后移除

        val pos = adapter.append(msg)
        list.scrollToPosition(pos)
        msgInput.setText("")
        saveDraft("")   // 已发送，草稿使命结束

        // 文本附件拼进正文：走普通 sendMessage 路径，服务端无需改动
        val texts = inputActions.pendingTextAttachments()
        val composed = TextAttachment.compose(text, texts)
        val ok = if (image != null) {
            // 图片与文本附件同时存在时，文本已拼进 text 参数
            activeBackend.sendWithImages(composed, listOf(image), reqId)
        } else {
            activeBackend.send(composed, reqId)
        }
        inputActions.clearPendingImage()
        inputActions.clearTextAttachments()

        if (!ok) {
            adapter.updateStatus(msg.id, ChatMessage.Status.FAILED)
            pending.remove(msg.id)
        } else if (TurnState.startOnSend(ok, interactive)) {
            // 发送成功且服务端会真正处理，才进入回合（可中断）
            startTurn()
        }
        persist()
    }

    /**
     * 重发一条发送失败的消息。
     *
     * 复用原消息 id 与新的 requestId：正文不变，用户不必重新打一遍。
     * 重发仍可能失败（连接没恢复），此时状态回到 FAILED，可继续点。
     */
    private fun retry(m: ChatMessage) {
        // 用 activeBackend 而非 client：本地模式无「连接」概念
        if (!activeBackend.isReady) {
            Toast.makeText(this, "未连接，无法重发", Toast.LENGTH_SHORT).show()
            return
        }
        val reqId = ChatMessage.newId()
        pending[m.id] = reqId
        sentReqIds.add(reqId)   // 入去重集合，等回推命中后移除
        adapter.updateStatus(m.id, ChatMessage.Status.SENDING)
        if (!activeBackend.send(m.text, reqId)) {
            adapter.updateStatus(m.id, ChatMessage.Status.FAILED)
            pending.remove(m.id)
        } else if (TurnState.startOnSend(true, interactive)) {
            startTurn()
        }
        persist()
    }

    /**
     * 查看/移除已附的文本文件。
     *
     * 为什么需要移除入口：附错文件后用户没法撤销，只能发出去再解释。
     * 放在长按菜单里而非气泡上 —— 附件在发送前不占列表空间。
     */
    private fun showAttachments() {
        val list = inputActions.pendingTextAttachments()
        if (list.isEmpty()) {
            Toast.makeText(this, R.string.attach_none, Toast.LENGTH_SHORT).show()
            return
        }
        val labels = list.map { "${it.first}（${it.second.length} 字符）" }.toTypedArray()
        android.app.AlertDialog.Builder(this)
            .setTitle(R.string.attach_list_title)
            .setItems(labels) { _, which ->
                inputActions.removeTextAttachment(list[which].first)
                Toast.makeText(
                    this,
                    getString(R.string.attach_removed, list[which].first),
                    Toast.LENGTH_SHORT,
                ).show()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /**
     * 长按消息的操作菜单。
     *
     * 用 AlertDialog 而非 BottomSheet：本工程无 Material 库，
     * 而引它只为这一个菜单不划算。AlertDialog 的选项列表在视觉上
     * 已接近底部菜单，且用户熟悉。
     *
     * 菜单项**动态生成** —— 不含代码块的消息不显示「复制代码块」，
     * 避免出现点了没反应的项。
     */
    private fun showMessageMenu(m: ChatMessage) {
        val codes = MessageActions.extractCodeBlocks(m.text)
        // 是否是最后一条用户消息 —— 决定「编辑并重发」是否出现
        val snapshot = adapter.snapshot()
        val lastUserIdx = snapshot.indexOfLast { it.role == "user" }
        val isLastUser = lastUserIdx >= 0 && snapshot.getOrNull(lastUserIdx)?.id == m.id
        // 是否是最后一条助手回复 —— 决定「重新生成」是否出现。
        // 中间的历史回复不给这个入口：实现是「重跑最后一轮」，
        // 对旧的回复点它会让用户以为重生成那一条，实际却重跑了最新的。
        val lastAssistantIdx = snapshot.indexOfLast { it.role == "assistant" }
        val isLastAssistant =
            lastAssistantIdx >= 0 && snapshot.getOrNull(lastAssistantIdx)?.id == m.id
        val actions = MessageActions.withRegenerateIfLast(
            MessageActions.withEditIfLast(
                MessageActions.availableActions(m),
                isLastUser,
            ),
            isLastAssistant,
        )
        val labels = actions.map { MessageActions.labelOf(it, codes.size) }.toTypedArray()

        android.app.AlertDialog.Builder(this)
            .setItems(labels) { _, which ->
                when (actions[which]) {
                    MessageActions.Action.COPY_ALL -> copyText(MessageActions.toolFullText(m), "已复制全文")
                    MessageActions.Action.COPY_CODE -> copyText(codes.joinToString("\n\n"), "已复制代码块")
                    MessageActions.Action.COPY_TOOL_DETAIL -> copyText(m.toolDetail, "已复制命令")
                    MessageActions.Action.COPY_TOOL_RESULT -> copyText(m.toolResult, "已复制结果")
                    MessageActions.Action.QUOTE -> {
                        // 填入输入框而非直接发送：用户可能要补充说明
                        val quoted = MessageActions.quote(m.text)
                        val current = msgInput.text.toString()
                        msgInput.setText(quoted + current)
                        msgInput.setSelection(msgInput.text.length)
                        msgInput.requestFocus()
                    }
                    MessageActions.Action.EDIT_LAST -> promptEditMessage(m)
                    MessageActions.Action.REGENERATE -> regenerateLastReply()
                    MessageActions.Action.DELETE -> deleteMessage(m)
                    MessageActions.Action.SELECT_MULTIPLE -> enterSelectionMode(m)
                }
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /**
     * 弹出编辑框，改完重发。
     *
     * 未连接时直接拒绝：编辑会触发一次重发，无连接时必然失败，
     * 不如提前告知。
     */
    private fun promptEditMessage(m: ChatMessage) {
        if (!activeBackend.isReady) {
            Toast.makeText(this, "未连接，无法编辑重发", Toast.LENGTH_SHORT).show()
            return
        }
        val input = android.widget.EditText(this).apply {
            setText(m.text)
            setSelection(text.length)
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 3
            maxLines = 8
        }
        android.app.AlertDialog.Builder(this)
            .setTitle(R.string.edit_message_title)
            .setView(input)
            .setPositiveButton(R.string.edit_message_send) { _, _ ->
                val newText = input.text.toString().trim()
                if (newText.isEmpty()) {
                    Toast.makeText(this, R.string.edit_message_empty, Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                if (newText == m.text.trim()) {
                    Toast.makeText(this, R.string.edit_message_unchanged, Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                activeBackend.editMessage(newText, ChatMessage.newId())
                // 本地先移除该条（服务端会撤回旧的并重发新的，
                // 重发的会作为新消息推回来）
                adapter.submit(adapter.snapshot().filterNot { it.id == m.id })
                persist()
                append(ChatMessage.system("已提交编辑，等待服务端处理"))
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    /**
     * 全屏查看一张图片。
     *
     * 用 AlertDialog 承载 ImageView（而非新开 Activity）：只是为了放大看
     * 一张图，跳转 Activity 要处理返回栈、主题、旋转，成本远高于收益。
     *
     * 解码目标的选取：取屏幕长边 —— 比屏幕更精细的像素显示不出来，
     * 白白占内存。用 Android 自身坐标系（含状态栏）计算，避免不同
     * 密度下算出过小的值。
     */
    private fun showImageFullscreen(base64: String) {
        val metrics = android.util.DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        val target = maxOf(metrics.widthPixels, metrics.heightPixels)

        val bmp = ImagePreview.decode(base64, target)
        if (bmp == null) {
            Toast.makeText(this, "图片无法显示（可能数据已损坏）", Toast.LENGTH_SHORT).show()
            return
        }
        val iv = android.widget.ImageView(this).apply {
            setImageBitmap(bmp)
            adjustViewBounds = true
            scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
        }
        // 深色背景 + 全宽：让图片在暗色主题下不刺眼，且能占满可视区
        val container = android.widget.FrameLayout(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            addView(
                iv,
                android.widget.FrameLayout.LayoutParams(
                    android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                    android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                ).apply { gravity = android.view.Gravity.CENTER },
            )
        }
        android.app.AlertDialog.Builder(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
            .setView(container)
            .setPositiveButton("关闭", null)
            .show()
    }

    /**
     * 重新生成回复：把最后一条用户消息**原样**重发一次。
     *
     * 这是同类 App（ChatGPT / Claude 等）的高频操作，用于对回复不满意时
     * 换个答案。CLI 侧没有独立的「重新生成」通道，但等价操作已存在 ——
     * `MobileEditHandlers.editLastUserMessage` 会自动查找最后一条 user
     * 消息并撤回重发（见 useReplBridge.tsx:624）。传相同文本即等价于
     * 「重新生成」，**无需新增协议**。
     *
     * 三点必须处理对：
     * 1. 传原文本而非空 —— 服务端会撤回旧消息再提交，文本必须一致
     * 2. 本地删掉最后一条 user 气泡：服务端重发后会作为新消息推回来，
     *    不删会出现重复气泡（与 promptEditMessage 同理）
     * 3. 助手回复不删：那是历史，服务端重跑后会追加新的，用户能对比
     */
    private fun regenerateLastReply() {
        if (!activeBackend.isReady) {
            Toast.makeText(this, "未连接，无法重新生成", Toast.LENGTH_SHORT).show()
            return
        }
        val snapshot = adapter.snapshot()
        val lastUser = snapshot.lastOrNull { it.role == "user" && it.text.isNotBlank() }
        if (lastUser == null) {
            Toast.makeText(this, "还没有可重新生成的消息", Toast.LENGTH_SHORT).show()
            return
        }
        activeBackend.editMessage(lastUser.text, ChatMessage.newId())
        adapter.submit(snapshot.filterNot { it.id == lastUser.id })
        persist()
        append(ChatMessage.system("正在重新生成…"))
    }

    /**
     * 删除一条本地消息。
     *
     * 只删本地副本 —— 服务端（CLI 对话）的历史不受影响。
     * 这一点必须让用户知道，否则他会以为「删了就真没了」，
     * 或者反过来担心影响电脑上的记录。
     */
    private fun deleteMessage(m: ChatMessage) {
        // 「危险操作二次确认」可关 —— 但默认开启（安全相关的默认值应偏保守）
        if (localPrefs.getBool(LocalPrefs.KEY_CONFIRM_DANGEROUS)) {
            android.app.AlertDialog.Builder(this)
                .setTitle(R.string.confirm_delete_title)
                .setMessage(R.string.confirm_delete_msg)
                .setPositiveButton(R.string.history_delete) { _, _ -> doDeleteMessage(m) }
                .setNegativeButton(R.string.cancel, null)
                .show()
        } else {
            doDeleteMessage(m)
        }
    }

    private fun doDeleteMessage(m: ChatMessage) {
        val remaining = adapter.snapshot().filterNot { it.id == m.id }
        adapter.submit(remaining)
        persist()
        Toast.makeText(this, R.string.msg_deleted, Toast.LENGTH_SHORT).show()
    }

    // ───────────────────────────────────────────────────────────
    // 批量选择模式
    // ───────────────────────────────────────────────────────────

    /**
     * 进入选择模式：选中 [m] 并显示批量操作栏。
     *
     * 长按一条消息即进入（与微信等一致）。再点其它消息切换选中，
     * 操作栏提供「全选 / 复制所选 / 删除所选 / 取消」。
     */
    private fun enterSelectionMode(m: ChatMessage) {
        selectedIds = BatchSelection.toggle(selectedIds, m.id)
        adapter.applySelection(selectedIds)
        showBatchBar()
    }

    /** 选择模式下点击一条消息：切换其选中态；若取消到 0 条则退出模式。 */
    private fun toggleSelection(m: ChatMessage) {
        selectedIds = BatchSelection.toggle(selectedIds, m.id)
        adapter.applySelection(selectedIds)
        if (BatchSelection.isActive(selectedIds)) showBatchBar() else hideBatchBar()
    }

    /** 全选 / 取消全选。 */
    private fun batchToggleAll() {
        val ids = adapter.snapshot().map { it.id }
        selectedIds = BatchSelection.toggleAll(ids, selectedIds)
        adapter.applySelection(selectedIds)
        showBatchBar()
    }

    /** 复制所选消息文本（带角色前缀，便于区分 user/assistant/system）。 */
    private fun batchCopySelected() {
        if (selectedIds.isEmpty()) return
        val order = adapter.snapshot()
        val sb = StringBuilder()
        for (m in order) {
            if (m.id !in selectedIds) continue
            val prefix = when (m.role) {
                "user" -> "我: "
                "assistant" -> "AI: "
                "system", "error" -> "系统: "
                "tool" -> "工具: "
                else -> ""
            }
            sb.append(prefix).append(m.text).append('\n')
        }
        val clip = android.content.ClipData.newPlainText("doge-code 选中消息", sb.toString())
        val cm = getSystemService(android.content.Context.CLIPBOARD_SERVICE)
            as android.content.ClipboardManager
        cm.setPrimaryClip(clip)
        Toast.makeText(this, getString(R.string.batch_copied, selectedIds.size), Toast.LENGTH_SHORT).show()
        exitSelectionMode()
    }

    /** 删除所选（仅本地记录，同单条删除语义）。 */
    private fun batchDeleteSelected() {
        if (selectedIds.isEmpty()) return
        val remaining = adapter.snapshot().filterNot { it.id in selectedIds }
        adapter.submit(remaining)
        persist()
        Toast.makeText(this, getString(R.string.batch_deleted, selectedIds.size), Toast.LENGTH_SHORT).show()
        exitSelectionMode()
    }

    /** 退出选择模式：清空选中态并隐藏操作栏。 */
    private fun exitSelectionMode() {
        selectedIds = BatchSelection.clear()
        adapter.applySelection(selectedIds)
        hideBatchBar()
    }

    /** 显示批量操作栏并刷新计数与按钮文案。 */
    private fun showBatchBar() {
        val v = chatFragment?.currentViews() ?: return
        v.batchBar.visibility = android.view.View.VISIBLE
        updateBatchBar()
    }

    /** 按选中数刷新操作栏文案（「复制所选(N)」等）。 */
    private fun updateBatchBar() {
        val v = chatFragment?.currentViews() ?: return
        val n = selectedIds.size
        v.batchCount.text = getString(R.string.batch_selected_count, n)
        v.batchCopy.text = getString(R.string.batch_copy_with_count, n)
        v.batchDelete.text = getString(R.string.batch_delete_with_count, n)
        // 已全选时「全选」按钮变为「取消全选」语义提示
        v.batchSelectAll.text = if (BatchSelection.isAllSelected(
                adapter.snapshot().map { it.id }, selectedIds
            )
        ) {
            getString(R.string.batch_select_none)
        } else {
            getString(R.string.batch_select_all)
        }
    }

    /** 隐藏批量操作栏。 */
    private fun hideBatchBar() {
        chatFragment?.currentViews()?.batchBar?.visibility = android.view.View.GONE
    }

    /**
     * 「更多」溢出菜单：低频但有用的输入操作。
     *
     * 为什么不常驻输入栏：每个按钮固定占 44dp，而输入框的宽度是
     * **被这些按钮挤出来的**。实测 6 个按钮时输入框只剩约 58dp
     *（不到 3 个汉字），打字这一最核心的操作反被牺牲。
     *
     * 菜单项按使用频率排序，且**动态**：已附文件时才显示「查看已附」
     * 并在标题带数量 —— 没有附件时不必占一个位置。
     */
    private fun showMoreActions() {
        val items = mutableListOf<Pair<String, () -> Unit>>()
        items.add("附加图片（拍照 / 相册）" to { inputActions.pickImage() })
        items.add("附加文本文件（日志 / 配置 / 代码）" to { inputActions.pickTextFile() })
        items.add("快捷指令与命令" to { showQuickPrompts() })
        val attached = inputActions.pendingTextAttachments()
        if (attached.isNotEmpty()) {
            // 附了文件才显示 —— 让用户知道「我贴了几个」并能移除
            items.add("查看已附文件（${attached.size} 个）" to { showAttachments() })
        }
        android.app.AlertDialog.Builder(this)
            .setTitle(R.string.more_actions)
            .setItems(items.map { it.first }.toTypedArray()) { _, which ->
                items[which].second.invoke()
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /**
     * 快捷指令面板（分两组：斜杠命令 / prompt 模板）。
     *
     * 两组行为不同，故必须分开呈现：
     * · **斜杠命令**：语义完整，点击**直接发送**（`/compact` 之后无需补充）
     * · **prompt 模板**：需补充细节（「解释 src/a.ts」要改对路径），
     *   故只填入输入框等用户编辑
     *
     * 若混在一个列表里，用户会遇到「有的点了直接发、有的点了还要按发送」
     * 的不一致，很容易误发一个不完整的请求。
     */
    /** 当前模式对应的斜杠命令域。 */
    private fun currentCommandScope(): SlashCommands.Entry.Scope =
        if (appMode.isCloudAgent) {
            SlashCommands.Entry.Scope.LOCAL
        } else {
            SlashCommands.Entry.Scope.REMOTE
        }

    /**
     * 本地模式下的「客户端命令」—— 直接由 App 处理，不发给模型。
     *
     * ## 为什么必须是客户端行为
     *
     * `/workspace` / `/model` / `/tools` 查的是**本机状态**（工作区路径、
     * 配置里的模型名、可用的 4 个工具）。发到模型那里它既看不到工作区
     * 也看不到配置，只会编一个答案。故必须在发出之前拦下。
     *
     * @return true 表示已处理（调用方应停止后续发送流程）
     */
    private fun handleLocalCommand(text: String): Boolean {
        if (!appMode.isCloudAgent) return false
        val name = text.trim().removePrefix("/").substringBefore(' ').lowercase()
        val reply = when (name) {
            "workspace" -> "工作区：${localStore.resolvedWorkspace().absolutePath}"
            "model" -> {
                val cfg = localStore.providerConfig()
                "模型：${cfg.model.ifBlank { "（未设置，用服务端默认）" }}\n" +
                    "端点：${cfg.baseURL.ifBlank { "（未设置）" }}"
            }
            "tools" -> "本地可用工具：\n" +
                LocalTools.specs().joinToString("\n") { "· ${it.name} —— ${it.description}" } +
                "\n\n注意：云端模式**不能执行命令**（Android 沙箱不提供 shell，仅经 Termux 跑受限命令）。"
            "cost" -> {
                val u = localBackend.sessionUsage()
                if (u.totalTokens == 0) {
                    "本次会话尚无用量统计（服务端未返回 usage，或还没发过消息）。"
                } else {
                    "本次会话累计用量：\n" +
                        "· 输入：${u.promptTokens} tokens\n" +
                        "· 输出：${u.completionTokens} tokens\n" +
                        "· 合计：${u.totalTokens} tokens"
                }
            }
            else -> return false
        }
        append(ChatMessage.user(text))
        append(ChatMessage.system(reply))
        msgInput.setText("")
        saveDraft("")
        return true
    }

    private fun showQuickPrompts() {
        val cmds = SlashCommands.ALL.filter { with(SlashCommands) { it.matches(currentCommandScope()) } }
        val templates = QUICK_PROMPTS
        // 统一标题，分组用标题行区分（AlertDialog 的 setItems 不支持分组，
        // 故用「── 标题 ──」形式的不可选项模拟分隔）。实现上更简单的做法：
        // 两个入口按钮。这里保持单入口，用标题前缀标识。
        val labels = buildList {
            add("── 命令（点击直接执行）──")
            cmds.forEach { add("${it.label}  ${it.desc}") }
            add("── 提问模板（填入后可编辑）──")
            templates.forEach { add(it.second) }
        }.toTypedArray()

        android.app.AlertDialog.Builder(this)
            .setTitle(R.string.quick_prompt_title)
            .setItems(labels) { _, which ->
                // 第 0 项是分组标题；之后是命令；再之后是分组标题与模板
                val cmdStart = 1
                val cmdEnd = cmdStart + cmds.size
                val tplStart = cmdEnd + 1
                when {
                    which == 0 || which == cmdEnd -> Unit  // 分组标题，不可点
                    which < cmdEnd -> {
                        val cmd = cmds[which - cmdStart]
                        // 命令语义完整 —— 直接发送。若只填入输入框，
                        // 用户会以为「点了没反应」（他期待命令立刻执行）
                        msgInput.setText("/${cmd.command}")
                        sendCurrent()
                    }
                    else -> {
                        val body = templates[which - tplStart].first
                        msgInput.setText(body)
                        msgInput.setSelection(msgInput.text.length)
                        msgInput.requestFocus()
                    }
                }
            }
            .setNegativeButton("取消", null)
            .show()
    }

    /** 复制文本到剪贴板，并给出语义化提示（区分复制的是全文/代码块/命令/结果）。 */
    private fun copyText(text: String, tip: String = "已复制") {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        cm.setPrimaryClip(android.content.ClipData.newPlainText("doge-code", text))
        Toast.makeText(this, tip, Toast.LENGTH_SHORT).show()
    }

    /**
     * 远程配置：模型 / 思考强度 / 权限模式。
     *
     * 为什么值得做：手机上发现 AI 用错模型、思考深度不够、或想先看计划
     * 不改代码时，此前必须回到电脑终端敲 /model、/effort、Shift+Tab。
     * 远程使用的价值就在「不必回到电脑」。
     *
     * **权限模式选项刻意不含 Bypass**：与服务端白名单一致。
     * 客户端不展示，就不会有用户点了被拒的挫败感；更重要的是
     * 少一处将来被改坏的风险 —— 把 Bypass 暴露到网络可达的界面
     * 意味着拿到手机即可关掉本机全部防护。
     */





    /**
     * 地址历史：列出最近用过的地址，点选即连。
     *
     * 为什么需要：本项目的两种推荐连接方式（USB 反向转发走
     * 127.0.0.1、局域网走 192.168.x.x）地址完全不同，来回切换很常见，
     * 每次手打既慢又容易打错 —— 而打错地址的表现是「连不上」，
     * 用户很难意识到是自己少打了一位。
     */

    /** 读取地址历史（最近使用在前）。逻辑在 [HostHistory]，已单测。 */
    private fun loadHostHistory(): List<String> =
        HostHistory.parse(prefs.getString(KEY_HOSTS, null))

    /**
     * 把地址记入历史（去重后置顶，最多保留 8 条）。
     *
     * 上限 8 是刻意的：地址列表太长就失去了「快速切换」的意义，
     * 而实际用到的地址（USB + 几个常用网段）远少于 8 个。
     */
    private fun rememberHost(url: String) {
        val updated = HostHistory.remember(loadHostHistory(), url)
        prefs.edit().putString(KEY_HOSTS, HostHistory.serialize(updated)).apply()
    }

    /**
     * 连接诊断面板。
     *
     * 为什么值得做：用户「连不上」时只看到状态栏一闪而过的「已断开」，
     * 无从判断该改地址、改密钥还是开防火墙 —— 全部排障手段都藏在
     * adb logcat 里，而普通用户不会去连电脑看日志。
     *
     * 给出的两个快捷出口（重试 / 切 USB）覆盖了绝大多数真实场景：
     * 地址写错、服务端没起、WiFi 隔离。
     */

    /**
     * 弹输入框改会话名。
     *
     * 为什么值得做：多终端常在同一目录下开多个窗口，此时默认标签
     * （目录名）全都一样，手机上根本分不清哪个是哪个。
     */

    /**
     * 导出当前会话的本地历史为 Markdown，走系统分享。
     *
     * 用 ACTION_SEND 而非写文件到公共目录：用户可以自己选发给谁
     * （微信/邮件/笔记），也能存进文件管理器 —— 一次实现覆盖所有去向，
     * 且完全不需要存储权限。
     *
     * 只导出**本地已有的**历史（上限 500 条，见 MessageStore），
     * 不是服务端的完整会话记录 —— 后者本项目拿不到（会话在进程内存里）。
     */

    /**
     * 选择图片：拍照或从相册选。
     *
     * 用系统能力（ACTION_IMAGE_CAPTURE / ACTION_GET_CONTENT）而非自建相册：
     * 走 SAF 拿到的一次性 URI 不需要任何存储权限，权限最小化。
     */



    /**
     * 读取图片 URI 并压缩为待发送的 base64。
     *
     * 压缩是必须的：手机拍的原图常达 5-10MB，base64 后膨胀约 1/3，
     * 一次 WebSocket 帧发这么大既慢又可能触发服务端/运行时的帧上限。
     * 而 AI 看清代码截图只需长边约 1600px。
     *
     * 失败时给出明确提示而不是静默：用户选了图却什么都没发生是最糟的体验。
     */

    /** 清空待发图片（发送后 / 取消时）。 */

    /**
     * 启动系统语音识别，把结果追加到输入框。
     *
     * 为什么用系统能力而不集成第三方 SDK：手机上描述一段需求比打字快得多，
     * 但为这一项引入几 MB 的语音库不划算 —— 系统自带识别已够用，
     * 且不增加依赖与隐私面。
     *
     * 追加而非覆盖：用户可能已经打了一半文字，覆盖会让他丢掉已输入内容。
     */

    @Deprecated("startActivityForResult 在 AndroidX 中已被 ActivityResultLauncher 取代，"
        + "但本工程是纯 AppCompat、未引入 activity-result 依赖，此处保持最小改动")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        // 图片/语音的结果由 InputActions 消费；它返回 false 说明不是它的请求
        if (inputActions.handleActivityResult(requestCode, resultCode, data)) return
    }

    /**
     * 保存未发送的草稿。
     *
     * 空内容时**删除键**而不是存空串：否则用户主动清空输入框后，
     * Activity 重建会把清空前的内容「复活」，看起来像幽灵文本。
     */
    /** 草稿保存。逻辑在 [DraftStore]（空内容必须删键，已单测）。 */
    private fun saveDraft(text: String) = draftStore.save(text)

    private fun hideKeyboard() {
        val im = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        im.hideSoftInputFromWindow(msgInput.windowToken, 0)
    }

    /**
     * 助手回复到达时语音播报「任务已完成」+ 回复首句。
     *
     * 与 [maybeNotify] 的三点不同，都是刻意的：
     * 1. 前台也播报 —— 用户要求「不必盯着屏幕就知道结束了」，
     *    而盯着屏幕时通知是打扰、语音却是正好。
     * 2. 不受「终端活跃时不打扰」影响 —— 那个标志针对的是**通知**；
     *    用户自己开了语音播报，说明明确要这个提醒。
     * 3. 不检查通知权限 —— 语音走 TTS 与通知渠道无关。
     *
     * 只由「语音播报」开关控制，默认关闭（侵入性较强的提醒，
     * 不该默认打断用户正在听的音频）。
     */
    private fun announceCompletion(replyText: String) {
        if (!localPrefs.getBool(LocalPrefs.KEY_VOICE_ANNOUNCE)) return
        applyVoiceRate()
        voiceAnnouncer.speak(VoiceAnnouncer.completionSpeech(replyText))
    }

    /**
     * AI 请求批准时语音提醒。
     *
     * 比完成播报更该开：批准是**阻塞等待**，不处理 AI 永久挂着；
     * 而完成晚点知道没关系。故它由独立开关控制，且不受
     * 「终端活跃时不打扰」影响 —— 那个标志针对的是通知，
     * 用户在电脑前时手机不该震，但语音是用户主动开的，不该被它拦。
     */
    private fun announcePermission(toolName: String) {
        if (!localPrefs.getBool(LocalPrefs.KEY_VOICE_PERMISSION)) return
        applyVoiceRate()
        voiceAnnouncer.speak(VoiceAnnouncer.permissionSpeech(toolName))
    }

    /** 把「播报语速」偏好映射到 TTS 倍率。 */
    private fun applyVoiceRate() {
        voiceAnnouncer.rate = when (localPrefs.get(LocalPrefs.KEY_VOICE_RATE)) {
            "slow" -> 0.75f
            "fast" -> 1.35f
            else -> 1.0f
        }
    }

    /**
     * 助手回复到达时发系统通知。仅当 App 不在前台才提醒 ——
     * 用户正看着界面时再弹通知是打扰。
     */
    private fun maybeNotify(msg: ChatMessage, suppressNotify: Boolean = false) {
        if (msg.role != "assistant") return
        // 「回复通知」关闭时完全不弹 —— 用户明确表示不需要这类提醒
        if (!localPrefs.getBool(LocalPrefs.KEY_NOTIFY_REPLY)) return
        // 本 App 在前台：用户正看着界面，再弹通知是打扰
        if (hasWindowFocus()) return
        // 服务端告知用户正在电脑终端前（DECSET 1004 焦点状态）：同理不打扰。
        // 注意 'unknown' 在服务端已被当作「不抑制」，故这里只需判标志本身。
        // 另注：用户在设置里关掉「终端活跃时不打扰」时，应忽略服务端这个标志
        if (suppressNotify && localPrefs.getBool(LocalPrefs.KEY_NOTIFY_SUPPRESS)) return
        Notifications.notifyAssistant(
            this,
            msg.text,
            sessionLabel,
            silent = !localPrefs.getBool(LocalPrefs.KEY_NOTIFY_SOUND),
            sessionKey = activeKey,
        )
    }

    companion object {
        private const val PREFS = "doge_mobile"

        /**
         * 本地/云端后端事件的伪会话 key。
         *
         * 本地后端（[LocalAgentBackend]）没有远端连接，但其事件也走
         * [onEvent] —— 用一个不可能与真实会话 key 冲突的常量标记它，
         * 使「本地模式的事件当活动会话处理」这一判据显式化。
         * 真实 key 形如 `192.168.0.106_5680`，不含此标记。
         */
        private const val LOCAL_KEY = "__local__"

        /** 僵死连接回收的扫描周期（防卡死）。见 [startConnectionSweeper]。 */
        private const val SWEEP_INTERVAL_MS = 60_000L

        /** 旧版单一地址 key。仅作 LAN 模式的迁移来源（见 savedAddressFor）。 */
        private const val KEY_URL = "last_url"
        /** 每模式地址 key 前缀：last_url_<MODE>（LAN / CLOUD / TUNNEL）。 */
        private const val KEY_URL_PREFIX = "last_url_"
        private const val KEY_SECRET = "secret"

        /** 是否把密钥落盘。默认保存（方便自动重连）；关闭后每次需手输。 */
        private const val KEY_REMEMBER_SECRET = "remember_secret"
        private const val KEY_AUTOCONNECT = "autoconnect"

        private const val PORT = 5680

        /** 活动区最多显示几行；超出丢最旧的。 */
        private const val MAX_ACTIVITY_LINES = 5

        /** 用量行的前缀标记：用于识别并替换旧行，避免堆叠。 */
        private const val USAGE_LINE_PREFIX = "Σ "

        private const val TAG = "MainActivity"

        /** 诊断页最多展示几条失败历史（存 20 条，展示 5 条足够看出模式）。 */
        private const val MAX_HISTORY_SHOWN = 5

        /**
         * 快捷指令模板。
         *
         * 选这五条的判据：都是**高频且措辞固定**的请求 ——
         * 手打它们的时间占输入时间的一大部分，而内容几乎不变。
         * 需要具体上下文（如「改这个文件」）的没放，因为模板帮不上忙。
         */
        val QUICK_PROMPTS: List<Pair<String, String>> = listOf(
            "解释一下这段代码的作用" to "解释这段代码的作用",
            "找出这段代码里的 bug" to "找出其中的 bug 与潜在问题",
            "为这段代码写测试" to "为这段代码写单元测试",
            "给出重构建议" to "分析这段代码可以如何重构，说明理由",
            "生成提交信息" to "根据当前改动生成一条符合规范的提交信息",
        )

        // Fragment tag（用 findFragmentByTag 复用，避免旋转后重复 add）
        private const val TAG_CHAT = "chat"
        private const val TAG_SESSIONS = "sessions"
        private const val TAG_SETTINGS = "settings"

        private const val TAB_INDEX_SESSIONS = 0
        private const val TAB_INDEX_CHAT = 1
        private const val TAB_INDEX_SETTINGS = 2

        /** 未发送草稿的存储键。 */
        private const val KEY_DRAFT = "draft"

        /** 地址历史（换行分隔，最近使用在前）。 */
        private const val KEY_HOSTS = "host_history"

        /**
         * 多实例隧道地址映射（JSON 对象：`{label: "wss://…/mobile/ws"}`）。
         *
         * 为什么需要「多个」而非单值：每个 CLI 实例各自起一条 cloudflared
         * 快隧道，隧道地址随 beacon 广播带 `tunnelUrl` 字段。原先只取
         * `firstNotNullOfOrNull` 记最后一个，导致隧道模式下手机只知道一个
         * 会话的地址 —— 切换会话时找不到别的实例（用户痛点）。
         *
         * 用 label 做 key（同一实例的 label 在重连间稳定；子域每次重启都变，
         * 不能做 key）。读到无法解析的老数据时按空表处理，不抛异常。
         */
        private const val KEY_TUNNEL_URLS = "tunnel_urls"

        /** 地址历史保留条数上限。 */
        private const val MAX_HOSTS = 8


        /**
         * 默认地址。USB 反向转发（adb reverse）下手机访问 127.0.0.1:5680 即可，
         * 无需同 WiFi、无需放行防火墙，是本项目推荐的连接方式
         * （见 scripts/start-mobile-bridge.mjs）。
         */
        private val DEFAULT_URL = "http://127.0.0.1:$PORT"
    }
}
