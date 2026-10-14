/**
 * WorkerPool 的 worker 入口。
 *
 * 由主线程以 new Worker(<此文件编译产物>) 启动。worker 侧只需构造 pool
 * 并调用 run(processor)：run() 在非主线程上下文中转入「被动接收派发」模式，
 * 等待主线程 postMessage 的任务并执行 processor。
 *
 * processor 需在此处提供——它是 worker 侧唯一的业务逻辑入口。
 */
import { WorkerPool } from './WorkerPool.js';

// worker 侧处理函数：接收任务，返回 { processed, taskId }。
// 真实业务应在此按 task.data 分派到具体处理器。
const processor = async (task: { id: string }) => {
  return { processed: true, taskId: task.id };
};

const pool = new WorkerPool({
  concurrency: 1,
  taskDir: process.env.TASK_DIR || './tasks',
});

void pool
  .init()
  .then(() => pool.run(processor))
  .catch(err => {
    console.error(
      `[worker] 启动失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
