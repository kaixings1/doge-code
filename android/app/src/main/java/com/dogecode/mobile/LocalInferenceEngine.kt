package com.dogecode.mobile

import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import kotlin.text.RegexOption
import org.json.JSONArray
import org.json.JSONObject

/**
 * 本地离线推理引擎的抽象接缝。
 *
 * ## 为什么需要这一层
 *
 * 手机要「真正离线」跑推理，底层必然是某个 native GGUF 引擎
 *（如 llama.cpp 的 .so）。但 doge 铁律是「不引入新依赖、不用 NDK」，
 * 所以本仓库**此刻不编译任何 native 库**——`LocalInferenceEngine`
 * 只是把「一次模型调用」抽象成接口，让上层的 [LocalInferenceBackend]
 * 完全不依赖具体引擎。
 *
 * 后续你若引入 llama.cpp 的 .so，只需写一个新类实现本接口
 *（比如 `LlamaCppEngine : LocalInferenceEngine`），在
 * [LocalInferenceBackend] 的 `engineFactory` 里返回它即可接入，
 * **UI、AgentLoop、工具、历史持久化全部零改动**。
 *
 * ## 方法签名刻意对齐 OfflineLLM 的流式推理模式
 *
 * 参考仓库 `OfflineLLM` 的 `InferenceEngine.getResponseAsFlow` 是
 * 「逐 token 流式产出 + stop 序列清理 + `<think>` 标签剥离」。
 * 我们这里用回调 `onToken` 而非 Kotlin Flow，原因与 [AgentBackend]
 * 一致：现有 [BridgeClient.Event] 是回调风格，改成 Flow 要动线程模型
 * 与全部调用点，收益不抵风险。回调逐 token 推动，效果等价。
 */
interface LocalInferenceEngine {

  /**
   * 生成一次回复（阻塞调用，应在 IO 线程执行）。
   *
   * @param messages 完整对话（OpenAI 格式，含 system/user/assistant/tool）。
   * @param tools 本次可见的工具定义（OpenAI function 格式）。
   * @param onToken 每产出一个 token 片段时回调（用于流式打字机效果）。
   *   引擎**应当**在这里逐片吐出**已清洗**（不含 `<think>` 等）的可见文本。
   * @param shouldStop 中断检查：返回 true 时引擎应尽快停下（超时/用户中断）。
   * @return [EngineResult] 本轮最终文本、工具调用、结束原因。
   */
  fun generate(
    messages: List<ChatMsg>,
    tools: List<ToolSpec>,
    onToken: (String) -> Unit,
    shouldStop: () -> Boolean,
  ): EngineResult
}

/**
 * 一次本地引擎生成的结果（对接 [AgentLoop] 需要的 [ChatResult]）。
 */
data class EngineResult(
  /** 最终可见文本（不含 `<think>` 思考块，已剥离）。 */
  val text: String,
  /** 模型请求调用的工具（本地引擎若支持 function calling）。 */
  val toolCalls: List<ToolCall>,
  /** 结束原因（"stop" / "length" / "tool_calls" / null）。 */
  val finishReason: String?,
)

/**
 * 纯算法层：从 OfflineLLM 吸收的、不涉及 native 的可单测工具。
 *
 * 这些 object 不持有任何状态（除 [ThinkingTagFilter] 那种需要跨 chunk
 * 维持的流式状态），不依赖 Android 运行时，可在 JVM 单测里直接跑。
 * 真正的 GGUF 引擎实现应当复用它们来做 token 清洗与累积。
 */
object LocalInferenceAlgorithms {

  /**
   * `<think>...</think>` 标签剥离（一次性、无状态）。
   *
   * ## 为什么要剥
   *
   * 推理模型（如 DeepSeek-R1 / Qwen-Thinker 风格的本地权重）常把「思考
   * 过程」包在 `<think>` 标签里。直接把整段喂给 UI 既难看又浪费 token，
   * 故在引擎层就把它剥掉，只留「答案」。
   *
   * ## 实现要点
   *
   * - 用正则把成对的 `<think>...</think>` 整体删掉（含标签本身）。
   * - `DOTALL` 让 `.` 能跨换行匹配（思考块常常多行）。
   * - 标签名大小写不敏感（`(?i)`），部分引擎会写成 `<THINK>`。
   * - 不删「未闭合」的半截标签——那是流式场景下 chunk 边界问题，
   *   交给 [ThinkingTagFilter] 处理，避免把正常文本误删。
   *
   * @param raw 含思考块的原文。
   * @return 去掉完整 `<think>` 块后的文本（连续空白由调用方决定要不要压）。
   */
  fun stripThinkingTags(raw: String): String {
    // 匹配完整的 <think> ... </think>（可能跨多行），整体删除。
    //
    // IGNORE_CASE：不同模型的标签大小写不一致（`<think>` / `<THINK>` /
    // `<Think>` 都见过）。此前只匹配小写，大写标签会被**原样留在正文里**
    // —— 用户看到 `A<THINK>…</THINK>B` 这种脏输出（单测暴露）。
    return raw.replace(Regex("(?si)<think>(.*?)</think>"), "")
  }

  /**
   * 流式 `<think>` 标签过滤器（有状态，跨 chunk 维持）。
   *
   * ## 为什么需要状态
   *
   * 流式推理时，`<think>` 的开始与结束往往落在**不同的 token 片段**上。
   * 若每片都拿 [stripThinkingTags] 处理，会出现：
   * - 收到 `<thi` 时当成普通文本吐出去；
   * - 收到 `nk>...` 时又吐出标签残片。
   * 结果 UI 上闪过一堆标签碎片。本过滤器按**缓冲区状态机**处理：
   * 一旦进入「思考中」，后续 token 一律吞掉不吐，直到看到 `</think>`。
   *
   * ## 用法（每收一个 token 调一次 [feed]）
   *
   * ```
   * val f = ThinkingTagFilter()
   * tokens.forEach { visible.append(f.feed(it)) }
   * visible.append(f.flush()) // 收尾，吐出未闭合的思考块之后的残留
   * ```
   */
  class ThinkingTagFilter {
    /** 当前是否处于「正在吞掉思考内容」的状态。 */
    private var inThink = false

    /** 跨 chunk 残留的、尚未判定归属的缓冲（标签可能被切断）。 */
    private val buf = StringBuilder()

    /**
     * 喂入一个原始 token 片段，返回「应当显示给用户的可见文本」。
     *
     * 思路：把片段追加进缓冲，再从缓冲里尽可能多地切出「已能判定」的部分。
     */
    fun feed(chunk: String): String {
      buf.append(chunk)
      val out = StringBuilder()
      while (buf.isNotEmpty()) {
        if (!inThink) {
          // 在思考区之外：找下一个 <think> 起点
          val start = buf.indexOf("<think", 0, ignoreCase = true)
          if (start < 0) {
            // 没有起点：只保留「可能成为标签前缀」的尾巴，其余全吐出
            val safe = keepPossibleTagPrefix(buf)
            val safeLen = safe.length
            out.append(buf.substring(0, buf.length - safeLen))
            // 必须删除**前缀**、保留尾部 —— `setLength(safeLen)` 是保留前 N 个，
            // 会把「先」留着而把尾巴的 `i` 切掉，下一轮拼出 `<thnk>`（缺 i），
            // 标签永不闭合、思考内容泄漏（单测暴露的真 bug）。
            buf.delete(0, buf.length - safeLen)
            break
          } else {
            // 吐出 <think> 之前的所有可见文本
            out.append(buf.substring(0, start))
            buf.delete(0, start)
            inThink = true
          }
        } else {
          // 在思考区之内：找 </think> 终点
          val end = buf.indexOf("</think>", 0, ignoreCase = true)
          if (end < 0) {
            // 还没看到完整结束标签：整段都是思考内容（全丢），
            // 但**必须保留尾巴**，因为 `</think>` 可能被切在 chunk 边界
            //（如本 chunk 结尾是 `</thin`，下一 chunk 是 `k>答案`）。
            // 原实现 `buf.setLength(0)` 把 `</thin` 也清掉了 → 标签永不闭合、
            // 后续所有可见文本被永久吞进"思考块"（单测暴露的静默丢内容 bug）。
            val keepLen = keepPossibleTagPrefix(buf).length
            if (keepLen > 0) {
              buf.delete(0, buf.length - keepLen)
            } else {
              buf.setLength(0)
            }
            break
          } else {
            buf.delete(0, end + "</think>".length)
            inThink = false
          }
        }
      }
      return out.toString()
    }

    /**
     * 收尾：流式结束时调用，吐出缓冲里残留的可见文本。
     *
     * 若仍处于思考态（模型忘了闭合标签），按「思考块未闭合」处理——
     * 不把半截 `<think>` 残片吐给用户（它本就不是答案）。
     */
    fun flush(): String {
      val leftover = buf.toString()
      buf.setLength(0)
      return if (inThink) {
        inThink = false
        "" // 未闭合的思考块：丢弃
      } else {
        // 若残留整体像某个标签的前缀（如 `<thi`，模型没吐完），丢弃以防泄漏；
        // 否则原样吐出（是真正的可见文本）。
        //
        // 原写法 `keepPossibleTagPrefix(...).takeIf { it.isEmpty() } ?: leftover`
        // 有 bug：keepPossibleTagPrefix 返回 "" 时，`"".takeIf { isEmpty }` 得到
        // **空串**（非 null），`?: leftover` 不触发 → 返回空串，把真正的可见
        // 文本（如「答案」）全丢了。改为按「整体是否为标签前缀」判断。
        if (isPrefixOfAnyTag(leftover)) "" else leftover
      }
    }

    /**
     * 从缓冲末尾保留「可能成为 `<think>`/`</think>` 标签前缀」的字符，
     * 防止标签被切断时误把半截标签当正文吐出。
     *
     * 例如缓冲为 `...abc<th`，`<th` 可能是 `<think` 的开头，必须保留；
     * 若是 `...xyz`，则无前缀可保留，全吐。
     */
    private fun keepPossibleTagPrefix(b: StringBuilder): String {
      val s = b.toString()
      val max = "</think>".length
      for (len in minOf(s.length, max) downTo 1) {
        val tail = s.takeLast(len)
        // 是否是某个标签（不分大小写）的前缀？
        if (isPrefixOfAnyTag(tail)) return tail
      }
      return ""
    }

    private fun isPrefixOfAnyTag(tail: String): Boolean {
      val lower = tail.lowercase()
      return listOf("<think", "</think").any { it.startsWith(lower) }
    }
  }

  /**
   * 流式 token 累积器（有状态）。
   *
   * ## 职责
   *
   * 把引擎逐个吐出的原始 token 片段累积成完整文本，并在累积过程中
   * 顺手做 `<think>` 剥离（委托给 [ThinkingTagFilter]）。这样上层
   * 只需 `accumulator.add(token)` 就能拿到「清洗后的可见文本」，
   * 不必关心思考块与标签边界。
   *
   * @param emitVisible 每次有「新的可见文本」产出时回调（可接到 UI 的 Delta）。
   */
  class StreamAccumulator(private val emitVisible: (String) -> Unit = {}) {
    private val filter = ThinkingTagFilter()
    private val fullClean = StringBuilder()

    /** 喂入一个原始 token，返回本次新增的可见文本。 */
    fun add(rawToken: String): String {
      val visible = filter.feed(rawToken)
      if (visible.isNotEmpty()) {
        fullClean.append(visible)
        emitVisible(visible)
      }
      return visible
    }

    /** 收尾，返回清洗后的完整文本。 */
    fun finalText(): String {
      val tail = filter.flush()
      if (tail.isNotEmpty()) fullClean.append(tail)
      return fullClean.toString()
    }
  }

  /**
   * Vulkan / GPU 探测（纯 Android API，无 native 依赖）。
   *
   * ## 参考 OfflineLLM 的 VulkanDetector.kt
   *
   * 离线引擎若能走 GPU（Vulkan）会快很多。探测不用任何 native 代码——
   * 直接问 `PackageManager` 系统是否声明了 Vulkan 硬件特性即可。
   */
  object VulkanDetector {
    /**
     * 设备是否支持 Vulkan。
     *
     * 用 `FEATURE_VULKAN_HARDWARE_LEVEL`（`android.hardware.vulkan.level`），
     * 它是 Android 7.0+ 起的标准硬件特性，纯系统 API，零 native。
     */
    fun isSupported(context: Context): Boolean =
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_LEVEL)

    /**
     * Vulkan 硬件等级（0 = 不支持 / 未声明；越高能力越强）。
     *
     * 用 `getSystemFeatureLevel` 取数值等级，引擎可据此决定是否启用 GPU 路径。
     */
    fun level(context: Context): Int =
      runCatching {
        // getSystemFeatureLevel 在部分 compileSdk 版本里不可见，用反射兜底，
        // 避免硬依赖特定 API level。失败回落 0（= 不支持分级）。
        val m = context.packageManager.javaClass
          .getMethod("getSystemFeatureLevel", String::class.java)
        (m.invoke(context.packageManager, PackageManager.FEATURE_VULKAN_HARDWARE_LEVEL) as? Int)
          ?: 0
      }.getOrDefault(0)
  }

  /**
   * 内存监控（纯 Android API，无 native 依赖）。
   *
   * ## 参考 OfflineLLM 的 MemoryMonitor.kt
   *
   * 离线推理吃内存（尤其大模型权重常驻）。在真正加载权重前先查一下
   * 剩余内存，避免 OOM 把整个 App 拖崩。用 `ActivityManager.MemoryInfo`，
   * 标准 API，零 native。
   */
  object MemoryMonitor {
    /** 当前可用内存（MB）。 */
    fun availableMemoryMB(context: Context): Long {
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val info = ActivityManager.MemoryInfo()
      am.getMemoryInfo(info)
      // availMem 是 byte，转 MB（1 MB = 1024*1024 byte）
      return info.availMem / (1024 * 1024)
    }

    /** 系统是否处于低内存状态（Android 会主动杀后台时为真）。 */
    fun isLowMemory(context: Context): Boolean {
      val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val info = ActivityManager.MemoryInfo()
      am.getMemoryInfo(info)
      return info.lowMemory
    }

    /**
     * 估算能否容纳给定 MB 的模型权重（粗判，仅作「是否尝试加载」的闸门）。
     *
     * 留 20% 余量给系统与其他 App：可用内存需大于 `requiredMB * 1.2`。
     */
    fun canFit(context: Context, requiredMB: Long): Boolean {
      val avail = availableMemoryMB(context)
      return avail > requiredMB * 6 / 5 // 等价于 *1.2，避免浮点
    }
  }

  /**
   * 推理超时与中断辅助（纯算法，无 native）。
   *
   * 把「截止时间」封装成 `shouldStop` 谓词，供 [LocalInferenceEngine.generate]
   * 的 `shouldStop` 参数直接使用。引擎每产出一个 token 就查一次，
   * 超时即停，避免手机上一次推理卡死几十秒。
   */
  object InferenceTimeout {
    /**
     * 生成一个带截止时间的停止谓词。
     *
     * @param timeoutMs 超时毫秒；<=0 表示不限制（永不主动停，只听外部中断）。
     * @param externalStop 额外的外部中断源（如用户点停止）；可空=无。
     */
    fun withDeadline(
      timeoutMs: Long,
      externalStop: (() -> Boolean)? = null,
    ): () -> Boolean {
      if (timeoutMs <= 0) {
        return { externalStop?.invoke() == true }
      }
      val deadline = System.currentTimeMillis() + timeoutMs
      return {
        externalStop?.invoke() == true || System.currentTimeMillis() >= deadline
      }
    }
  }
}

/**
 * 一个「空引擎」占位实现（默认工厂返回它，而非 null），便于
 * [LocalInferenceBackend] 在不引入 native 库时仍能编译、能优雅报错。
 *
 * 它什么都不做，[generate] 直接抛 [UnsupportedOperationException]，
 * 由 backend 在 `isReady` 阶段就拦下、发错误事件提示「需配置本地引擎」。
 *
 * 后续接入真实 GGUF 引擎时，把这个占位从 `engineFactory` 里换掉即可。
 */
object NullInferenceEngine : LocalInferenceEngine {
  override fun generate(
    messages: List<ChatMsg>,
    tools: List<ToolSpec>,
    onToken: (String) -> Unit,
    shouldStop: () -> Boolean,
  ): EngineResult {
    throw UnsupportedOperationException(
      "未配置本地推理引擎：请引入 GGUF native 库（如 llama.cpp .so）并实现 LocalInferenceEngine",
    )
  }
}
