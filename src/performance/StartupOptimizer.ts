/**
 * 启动优化器
 * 文件：src/performance/StartupOptimizer.ts
 * 文档 17 §2.2
 */

export interface StartupPhase {
  name: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: () => Promise<void>;
  dependencies?: string[];
}

export class StartupOptimizer {
  private phases: StartupPhase[] = [];
  private completed: Set<string> = new Set();
  private timings: Map<string, number> = new Map();

  /**
   * 添加启动阶段
   */
  addPhase(phase: StartupPhase): void {
    this.phases.push(phase);
  }

  /**
   * 执行启动流程
   */
  async run(): Promise<void> {
    const sorted = this.sortByPriority();

    for (const phase of sorted) {
      // 检查依赖
      if (phase.dependencies) {
        for (const dep of phase.dependencies) {
          if (!this.completed.has(dep)) {
            continue; // 跳过未满足依赖的阶段
          }
        }
      }

      const startTime = Date.now();

      try {
        await phase.action();
        this.completed.add(phase.name);
        this.timings.set(phase.name, Date.now() - startTime);
      } catch (error) {
        console.error(`Startup phase ${phase.name} failed:`, error);
        // 非关键阶段失败不阻塞启动
        if (phase.priority === 'critical') {
          throw error;
        }
      }
    }
  }

  /**
   * 按优先级排序
   */
  private sortByPriority(): StartupPhase[] {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...this.phases].sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );
  }

  /**
   * 获取启动性能报告
   */
  getReport(): {
    totalTime: number;
    phases: Array<{ name: string; duration: number; completed: boolean }>;
  } {
    const phases = this.phases.map((phase) => ({
      name: phase.name,
      duration: this.timings.get(phase.name) || 0,
      completed: this.completed.has(phase.name),
    }));

    const totalTime = phases.reduce((sum, p) => sum + p.duration, 0);

    return { totalTime, phases };
  }
}
