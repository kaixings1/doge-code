/**
 * engine/flow/base.ts — Flow 基类（吸收 OpenManus BaseFlow）
 *
 * Flow 是可组合的执行单元，封装一组 Agent 的编排逻辑。
 * 与 MessageLoop 的区别：Flow 控制"哪个 Agent 执行哪一步"，MessageLoop 控制单次对话迭代。
 */
export interface FlowAgent {
  key: string;
  description: string;
}

export interface FlowContext {
  /** 当前步骤索引（用于分步 Flow） */
  currentStepIndex?: number;
  /** 执行元数据 */
  metadata: Record<string, unknown>;
}

export type FlowResult = {
  success: boolean;
  output: string;
  stepsCompleted: number;
  durationMs: number;
};

export abstract class BaseFlow {
  /** 参与编排的 Agent */
  readonly agents: Map<string, FlowAgent>;
  /** 执行器 Agent key 列表（按优先级） */
  readonly executorKeys: string[];
  /** 上下文 */
  protected context: FlowContext;

  constructor(opts: {
    agents: FlowAgent[] | Record<string, FlowAgent>;
    executorKeys?: string[];
    metadata?: Record<string, unknown>;
  }) {
    if (Array.isArray(opts.agents)) {
      this.agents = new Map(opts.agents.map(a => [a.key, a]));
    } else {
      this.agents = new Map(Object.entries(opts.agents));
    }

    this.executorKeys = opts.executorKeys ?? Array.from(this.agents.keys());
    this.context = { metadata: opts.metadata ?? {} };
  }

  /** 获取主执行 Agent（第一个 executor） */
  get primaryAgent(): FlowAgent | undefined {
    for (const key of this.executorKeys) {
      const agent = this.agents.get(key);
      if (agent) return agent;
    }
    return this.agents.values().next().value;
  }

  /** 按 key 获取 Agent */
  getAgent(key: string): FlowAgent | undefined {
    return this.agents.get(key);
  }

  /** 添加 Agent */
  addAgent(agent: FlowAgent): void {
    this.agents.set(agent.key, agent);
  }

  /** 执行 Flow（子类实现） */
  abstract execute(input: string): Promise<FlowResult>;
}
