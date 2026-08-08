/**
 * engine/flow/planning.ts — PlanningFlow（吸收 OpenManus PlanningFlow）
 *
 * 分步执行 Flow：先用 LLM 生成计划，再逐步骤分配 Agent 执行。
 * 步骤状态：not_started → in_progress → completed/blocked
 */
import { BaseFlow, type FlowAgent, type FlowResult } from './base.js';

export type PlanStepStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked';

export interface PlanStep {
  text: string;
  status: PlanStepStatus;
  /** 可选的 Agent key，指定执行该步骤的 Agent */
  agentKey?: string;
  notes?: string;
}

export interface Plan {
  id: string;
  title: string;
  steps: PlanStep[];
  createdAt: number;
}

const STATUS_MARKS: Record<PlanStepStatus, string> = {
  not_started: '[ ]',
  in_progress: '[→]',
  completed: '[✓]',
  blocked: '[!]',
};

/**
 * 全局计划存储（会话级，替代 OpenManus PlanningTool.plans 字典）
 */
const planStore = new Map<string, Plan>();

export function getPlan(id: string): Plan | undefined {
  return planStore.get(id);
}

export function getAllPlans(): Plan[] {
  return Array.from(planStore.values());
}

export function clearPlans(): void {
  planStore.clear();
}

export class PlanningFlow extends BaseFlow {
  readonly planId: string;
  private plan: Plan;
  private stepIndex: number = 0;

  constructor(opts: {
    agents: FlowAgent[] | Record<string, FlowAgent>;
    planTitle?: string;
    planId?: string;
    executorKeys?: string[];
    metadata?: Record<string, unknown>;
  }) {
    super(opts);
    this.planId = opts.planId ?? `plan_${Date.now()}`;
    this.plan = {
      id: this.planId,
      title: opts.planTitle ?? 'Untitled Plan',
      steps: [],
      createdAt: Date.now(),
    };
    planStore.set(this.planId, this.plan);
  }

  /**
   * 创建计划步骤
   */
  createSteps(steps: string[]): void {
    this.plan.steps = steps.map(text => ({
      text,
      status: 'not_started' as PlanStepStatus,
    }));
  }

  /**
   * 执行 Flow：创建计划 → 逐步骤执行 → 完成
   * @param executorFn 接收 (step, agentKey) 返回执行结果的函数，由外部注入
   */
  async execute(input: string, executorFn: (step: PlanStep, agentKey?: string) => Promise<string>): Promise<FlowResult> {
    const start = Date.now();
    try {
      // 如果没有步骤，先根据输入创建（简化版：单步）
      if (this.plan.steps.length === 0) {
        this.plan.steps = [
          { text: input || 'Execute task', status: 'not_started' },
          { text: 'Verify results', status: 'not_started' },
        ];
      }

      // 设置标题
      if (input && this.plan.title === 'Untitled Plan') {
        this.plan.title = input.length > 50 ? input.slice(0, 50) + '...' : input;
      }

      // 逐步骤执行
      let stepsCompleted = 0;
      for (let i = 0; i < this.plan.steps.length; i++) {
        const step = this.plan.steps[i];
        step.status = 'in_progress';

        const agentKey = step.agentKey ?? this.executorKeys[0];
        const result = await executorFn(step, agentKey);

        step.status = 'completed';
        step.notes = result.slice(0, 200);
        stepsCompleted++;
      }

      return {
        success: true,
        output: this.getPlanText(),
        stepsCompleted,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `PlanningFlow error: ${message}`,
        stepsCompleted: this.plan.steps.filter(s => s.status === 'completed').length,
        durationMs: Date.now() - start,
      };
    }
  }

  /** 获取计划文本表示 */
  getPlanText(): string {
    const completed = this.plan.steps.filter(s => s.status === 'completed').length;
    const total = this.plan.steps.length;
    const progress = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';

    const header = `Plan: ${this.plan.title} (ID: ${this.plan.id})`;
    let text = `${header}\n${'='.repeat(header.length)}\n\n`;
    text += `Progress: ${completed}/${total} steps completed (${progress}%)\n\n`;
    text += 'Steps:\n';

    for (let i = 0; i < this.plan.steps.length; i++) {
      const step = this.plan.steps[i];
      const mark = STATUS_MARKS[step.status];
      text += `  ${i}. ${mark} ${step.text}\n`;
      if (step.notes) {
        text += `     Notes: ${step.notes}\n`;
      }
    }
    return text;
  }

  /** 标记步骤为完成 */
  markStepCompleted(index: number): void {
    if (index >= 0 && index < this.plan.steps.length) {
      this.plan.steps[index].status = 'completed';
    }
  }

  /** 标记步骤为阻塞 */
  markStepBlocked(index: number): void {
    if (index >= 0 && index < this.plan.steps.length) {
      this.plan.steps[index].status = 'blocked';
    }
  }
}
