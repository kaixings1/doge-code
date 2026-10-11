package com.dogecode.mobile

/**
 * 扫描端口的范围设定（纯逻辑，可单测）。
 *
 * ## 为什么需要可配
 *
 * 服务端现在会在起始端口被占用时**自动顺延**（最多试 10 个），
 * 且起始端口可经 `CLAUDE_CODE_MOBILE_PORT` 指定。
 * 若用户把起始端口设成 6000，客户端仍只扫 5680-5690 就**永远发现不了**，
 * 表现为「服务明明起来了，手机上扫不到会话」——极难归因。
 *
 * ## 为什么默认范围要覆盖 21 个（6000-6020）
 *
 * 用户会在同一台电脑上启动多个 CLI 实例（每个实例占用一个端口并自动顺延），
 * 手机需要一次扫描就能发现它们。默认 6000-6020 共 21 个端口，
 * 足以覆盖常见的多实例部署。扫描耗时靠 LanScanner 的「每 IP 只探主端口 +
 * 三层递进」机制控制，不会因端口数翻倍而显著变慢。
 *
 * ## 为什么不用「扫描整个 1024-65535」
 *
 * 每个端口都要发一次 HTTP 请求，6.4 万次探测在手机上要几分钟且耗电。
 * 有界范围 + 可配置是正确取舍：默认覆盖常见场景，特殊需求手动指定。
 */
object PortScanRange {

    /**
     * 默认起始端口。**必须与服务端 `DEFAULT_MOBILE_PORT` 保持一致**。
     *
     * 为何是 6000 而非 5680：服务端默认值已改为 6000（5680-5880 常被
     * Windows Hyper-V / WSL 保留，绑定被拒）。若这里仍是 5680，新用户
     * 开箱即扫不到 —— 服务起来了、手机找不到，且两端各自看都正常。
     *
     * 老用户若仍用 5680，可在设置页「扫描端口范围」改回 5680-5689。
     */
    const val DEFAULT_START = 6000

    /**
     * 默认结束端口。
     *
     * 6020 = 6000 + 20。按用户需求覆盖 6000-6020 共 21 个端口，
     * 以容纳用户自行启动多个 CLI 实例（每个实例顺延占用端口）的场景。
     * 若服务端只顺延 10 个、用户也只起少数实例，扫描范围仍完全覆盖。
     */
    const val DEFAULT_END = DEFAULT_START + 20

    /** TCP 合法端口下限（排除特权端口）。 */
    const val MIN_PORT = 1024
    const val MAX_PORT = 65535

    /** 单次扫描的端口数上限。 */
    const val MAX_SPAN = 100

    /**
     * 规范化用户填写的范围。
     *
     * @return 可用的 (start, end)；输入非法时回落到默认范围。
     *
     * 三种非法输入都必须挡：
     * 1. 越界（0 / 65536）→ 扫描会全失败且刷日志
     * 2. 起点大于终点 → `(start..end)` 在 Kotlin 里是**空区间**，
     *    表现为「扫了但一个都没有」，用户以为服务没起
     * 3. 跨度过大 → 每个端口一次请求，几百个端口会卡很久
     */
    fun normalize(start: Int, end: Int): Pair<Int, Int> {
        if (start < MIN_PORT || start > MAX_PORT) return DEFAULT_START to DEFAULT_END
        if (end < MIN_PORT || end > MAX_PORT) return DEFAULT_START to DEFAULT_END
        // 起点大于终点：纠正为「以起点为起点的合法区间」而非回落默认 ——
        // 用户已明确表达了起始端口，只是终点写反了
        val fixedEnd = if (end < start) start else end
        val cappedEnd = if (fixedEnd - start + 1 > MAX_SPAN) start + MAX_SPAN - 1 else fixedEnd
        return start to cappedEnd
    }

    /** 展开成端口列表（供扫描）。 */
    fun portsOf(start: Int, end: Int): List<Int> {
        val (s, e) = normalize(start, end)
        return (s..e).toList()
    }

    /** 范围内的端口个数（用于提示文案）。 */
    fun countOf(start: Int, end: Int): Int {
        val (s, e) = normalize(start, end)
        return e - s + 1
    }
}
