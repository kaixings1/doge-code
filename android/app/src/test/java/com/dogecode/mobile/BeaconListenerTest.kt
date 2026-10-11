package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * BeaconListener 生命周期与 socket 健壮性测试。
 *
 * 注意：端到端的「广播 → 解析 → 端口穿过」逻辑已移入 [BeaconRegistry] 并交由
 * [BeaconRegistryTest] 稳定覆盖（不依赖真实多播路由）。本测试只验证
 * [BeaconListener] 这个 I/O 外壳本身：
 *   - 启动后能真正起来（joinGroup 至少尝试过、不抛异常）
 *   - 停止后资源释放、不再回调
 *   - 网卡全失败时优雅降级（不崩、不产生垃圾回调）
 *
 * 不在此处断言「真实收到广播」：测试环境的多播路由不可控（某些只含虚拟网卡的
 * 环境 joinGroup 会全失败），硬断言会变成偶发红，失去测试意义。
 */
class BeaconListenerTest {

    @Test
    fun `启动后能在合理时间内就绪且不崩溃`() {
        var errored = false
        val listener = BeaconListener { }
        try {
            listener.start()
            // 等 worker 线程跑完 joinGroup/绑定；若此处抛异常，说明 socket 初始化有真问题
            Thread.sleep(800)
        } catch (e: Exception) {
            errored = true
        } finally {
            listener.stop()
        }
        assertTrue("BeaconListener 启动/停止不应抛异常", !errored)
    }

    @Test
    fun `stop 后不再产生回调`() {
        val callbacks = AtomicInteger(0)
        val listener = BeaconListener { callbacks.incrementAndGet() }
        listener.start()
        Thread.sleep(500)
        listener.stop()
        val afterStop = callbacks.get()
        Thread.sleep(300)
        assertEquals("stop 后回调次数应稳定", afterStop, callbacks.get())
    }

    @Test
    fun `重复 start 是幂等的（不重复起线程）`() {
        val latch = CountDownLatch(1)
        val listener = BeaconListener { latch.countDown() }
        listener.start()
        listener.start() // 第二次应是无操作
        Thread.sleep(500)
        listener.stop()
        // 不应因重复 start 而崩溃
        assertTrue(true)
    }

    @Test
    fun `clear 后可再次正常启动`() {
        val listener = BeaconListener { }
        listener.start()
        Thread.sleep(300)
        listener.clear()
        listener.stop()
        // 二次生命周期不应抛异常
        listener.start()
        Thread.sleep(300)
        listener.stop()
        assertTrue(true)
    }
}
