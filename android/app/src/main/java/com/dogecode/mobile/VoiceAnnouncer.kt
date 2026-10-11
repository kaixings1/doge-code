package com.dogecode.mobile

import android.content.Context
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale

/**
 * 任务完成时的语音播报。
 *
 * 为什么需要：手机放在桌上，AI 干了几分钟活，用户不可能一直盯着屏幕。
 * 只靠通知栏/震动，不看手机就不知道结束了。语音播报让「结束」这件事
 * 主动找到用户，不必守着屏幕。
 *
 * 为什么用系统 TextToSpeech 而非第三方库：Android 原生提供，零依赖
 * （本工程依赖极精简，见 build.gradle.kts 的说明）。YAGNI 阶梯第 4 级
 * 「原生平台特性优先于引入依赖」。
 *
 * 生命周期：TTS 引擎初始化是异步的且较慢（数百毫秒）。若每次播报都
 * 新建实例，第一条播报往往因引擎未就绪而被吞掉。故本类持有单个实例，
 * 由 Activity 在 onCreate 时创建、onDestroy 时释放。
 * 引擎尚未就绪时到来的播报请求会**排队**，就绪后立即补播。
 */
class VoiceAnnouncer(context: Context) {

    /** 引擎是否已就绪。就绪前到达的请求先攒着。 */
    @Volatile
    private var ready = false

    /** 引擎就绪前累积的待播文本（通常最多一条 —— 初始化很快）。 */
    private var pending: String? = null

    @Volatile
    private var released = false

    /**
     * TTS 引擎。
     *
     * 注意初始化顺序：构造函数的 lambda 里**不能**引用 [tts] 自身 ——
     * 回调可能在 `tts` 字段赋值完成前就被同步触发（某些设备的引擎实现
     * 是同步回调），那时读 `tts` 拿到的是 null。故语言设置推迟到
     * [speakNow] 里按需设置（幂等且开销可忽略）。
     */
    private val tts: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        if (status == TextToSpeech.SUCCESS) {
            ready = true
            pending?.let { text ->
                pending = null
                speakNow(text)
            }
        } else {
            // 引擎不可用时静默降级 —— 语音只是锦上添花，
            // 不能因为设备没装 TTS 引擎就影响正常使用
            Log.w(TAG, "TTS 引擎初始化失败，语音播报不可用")
        }
    }

    /**
     * 播报语速倍率（1.0 为系统默认）。
     *
     * 由调用方在每次播报前按偏好设置 —— 用「设置而非构造参数」是因为
     * 用户可能在 App 运行期间改语速，而引擎实例是长期持有的。
     */
    var rate: Float = 1.0f

    /**
     * 播报一条文本。引擎未就绪时排队（就绪后补播），已释放时忽略。
     *
     * @param text 已由 [completionSpeech] 组装好的完整播报词
     */
    fun speak(text: String) {
        if (released || text.isBlank()) return
        if (!ready) {
            pending = text
            return
        }
        speakNow(text)
    }

    private fun speakNow(text: String) {
        if (released) return
        // 语言按需设置：引擎已就绪，此处设置必然生效（早于任何 speak）。
        // 放这里而非初始化回调，是为了避开「回调早于字段赋值」的时序问题。
        runCatching { tts.language = Locale.getDefault() }
        // 语速：每次播报前设置，让用户在设置里改完立即生效。
        // 下限 0.5 防止用户误设极小值导致听起来像卡带；
        // 上限 2.0 —— 再快就听不清中文了。
        runCatching { tts.setSpeechRate(rate.coerceIn(0.5f, 2.0f)) }
        // QUEUE_FLUSH：新播报打断旧的。任务完成播报是「一次性提示」，
        // 若几条回复几乎同时到达，念最后一条即可，堆着念既吵又滞后。
        runCatching {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID)
        }.onFailure { Log.w(TAG, "播报失败：${it.message}") }
    }

    /** 释放引擎。必须在 Activity onDestroy 调用，否则泄漏且占用音频焦点。 */
    fun release() {
        released = true
        pending = null
        runCatching {
            tts.stop()
            tts.shutdown()
        }
    }

    companion object {
        private const val TAG = "VoiceAnnouncer"

        /** 播报条目的标识（用于 QUEUE_FLUSH 下区分，也便于将来做打断）。 */
        private const val UTTERANCE_ID = "doge-task-done"

        /** 固定前缀。用户选择「短语 + 回复首句」方案。 */
        const val DONE_PREFIX = "任务已完成"

        /**
         * 需批准时的播报词。
         *
         * 为什么不带工具名/描述：播报发生在**阻塞等待**中，用户此刻
         * 最需要的是「快去看手机」，而不是听清具体要批准什么
         * （那要看屏幕上的 diff 才知道）。且工具描述可能很长、
         * 含路径与代码，念出来又慢又听不懂。
         */
        const val PERMISSION_PREFIX = "需要你批准"

        /**
         * 首句的最大长度。
         *
         * 读一整段回复要几十秒，用户只想听「说完了，说了啥」。
         * 取首句并截断到 40 字：足够判断内容主旨，又不至于念太久。
         */
        const val FIRST_SENTENCE_MAX = 40

        /**
         * 从助手回复里提取用于播报的首句。
         *
         * 规则：
         * 1. 去掉 Markdown 标记（代码块、粗体、行内码、标题符号）——
         *    逐字念出 ``` 与 ** 毫无意义且刺耳
         * 2. 取第一个句末标点（。！？.!?）或换行之前的文本
         * 3. 截断到 [FIRST_SENTENCE_MAX] 字并加省略号
         *
         * 抽成纯函数以便单测：这段判据涉及多个边界（全空白、只有标记、
         * 无句末标点、超长），且错了只是「念出来怪怪的」，
         * 不会报错，真机上很难注意到。
         */
        fun firstSentence(text: String): String {
            val stripped = stripMarkdown(text)
            if (stripped.isBlank()) return ""

            // 找第一个句末标点，取其前的内容。
            // 不含换行符：stripMarkdown 已把所有空白（含换行）折叠为空格，
            // 此处再列 '\n' 是死代码。多行短句合成一句念更连贯（见单测）。
            val enders = charArrayOf('。', '！', '？', '.', '!', '?')
            var cut = stripped.length
            for (i in stripped.indices) {
                if (stripped[i] in enders) {
                    cut = i
                    break
                }
            }
            val sentence = stripped.substring(0, cut).trim()

            return if (sentence.length > FIRST_SENTENCE_MAX) {
                sentence.take(FIRST_SENTENCE_MAX) + "…"
            } else {
                sentence
            }
        }

        /**
         * 组装完整播报词：「任务已完成」+ 回复首句。
         *
         * 首句为空（如回复只有代码块）时只播报前缀 ——
         * 念「任务已完成，」然后戛然而止很奇怪。
         */
        fun completionSpeech(replyText: String): String {
            val first = firstSentence(replyText)
            return if (first.isEmpty()) DONE_PREFIX else "$DONE_PREFIX，$first"
        }

        /**
         * 需批准时的播报词：「需要你批准」+ 工具名。
         *
         * 与完成播报的差别：这里带上工具名（虽不带描述）—— 用户听到
         * 「需要你批准，Bash」就知道是要不要放行一条命令，能提前决定
         * 「现在去看」还是「等会儿」。工具名短且可识别，适合朗读。
         */
        fun permissionSpeech(toolName: String): String {
            val name = toolName.trim()
            // 工具名缺失或就是占位符（服务端回落为「工具」）时不念，
            // 念「需要你批准，工具」毫无信息量
            return if (name.isEmpty() || name == "工具") {
                PERMISSION_PREFIX
            } else {
                "$PERMISSION_PREFIX，$name"
            }
        }

        /**
         * 去掉对朗读无意义的 Markdown 标记。
         *
         * 只去**成对出现的符号**与行首标记，不做完整 Markdown 解析 ——
         * 目标是「念出来不刺耳」，不是渲染。解析过度反而可能把正文吃掉。
         *
         * 顺序有意义：先去掉代码块（含内部内容），再处理行内标记 ——
         * 否则代码块里的 ` 会被当成行内码配对，吃掉块边界。
         */
        private fun stripMarkdown(text: String): String {
            var s = text
            // 代码块整体去掉（逐字念代码没有意义）
            s = s.replace(Regex("```[\\s\\S]*?```"), " ")
            // 行内代码保留内容、去掉反引号
            s = s.replace("`", "")
            // 粗体/斜体标记去掉
            s = s.replace("**", "").replace("__", "")
            // 行首标题符号与列表符号
            s = s.replace(Regex("(?m)^#{1,6}\\s*"), "")
            s = s.replace(Regex("(?m)^[-*+]\\s+"), "")
            // 链接 [文字](url) → 只留文字
            s = s.replace(Regex("\\[([^\\]]*)\\]\\([^)]*\\)"), "$1")
            // 折叠多余空白（含换行），首句判据才能正确工作
            return s.replace(Regex("\\s+"), " ").trim()
        }
    }
}