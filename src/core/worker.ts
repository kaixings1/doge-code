import { WorkerPool } from './WorkerPool';

// Worker线程的入口文件
const pool = new WorkerPool({
  concurrency: 1,
  taskDir: process.env.TASK_DIR || './tasks',
});

pool.init().then(() => {
  pool.run(async (task: any) => {
    // User-defined processor will be injected via require
    // This is a placeholder that gets overridden
    return { processed: true, taskId: task.id };
  });
});
