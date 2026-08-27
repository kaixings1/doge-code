import { predefinedAgents, loadAgentFromMarkdown, type SubAgentConfig } from "./config.ts";
import { createAgentWorktree, removeAgentWorktree } from "../../utils/worktree.js";
import { readdirSync, statSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { homedir } from "os";
import { join } from "path";

/** 技能树持久化目录（吸收自 Hermes Agent 自改进学习循环） */
const SKILL_TREE_DIR = join(homedir(), ".doge", "skilltrees")

/**
 * SubAgent 事件类型，对齐 OpenCode AgentEvent。
 */
export type SubAgentEvent =
  | { type: 'start'; agentName: string; instanceId: string }
  | { type: 'iteration'; agentName: string; instanceId: string; iteration: number }
  | { type: 'tool_call'; agentName: string; instanceId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_result'; agentName: string; instanceId: string; toolName: string; isError: boolean }
  | { type: 'complete'; agentName: string; instanceId: string; output: string; duration: number }
  | { type: 'fail'; agentName: string; instanceId: string; error: string; duration: number }
  | { type: 'abort'; agentName: string; instanceId: string }

export interface SubAgentManagerDeps {
  onEvent?: (event: SubAgentEvent) => void;
  /** 追踪数据持久化回调（吸收自 LangSmith export）：将子代理 trace 记录写入外部存储 */
  onTracePersist?: (record: { traceId: string; agentName: string; input: string; output?: string; error?: string; toolCalls: string[]; startTime: number; endTime: number }) => void
}

export interface SubAgentInstance {
  id: string;
  agentName: string;
  engine: { query: (input: string) => Promise<{ messages: { content?: string }[]; tokenUsage: unknown }>; abort: () => Promise<void> };
  startTime: Date;
  status: "running" | "completed" | "failed" | "terminated";
  /** OpenCode: Agent 级 git worktree 隔离路径 */
  worktreePath?: string;
  worktreeBranch?: string;
}

export interface ExecuteSubAgentParams {
  id: string;
  agentName: string;
  input: string;
  context?: string;
  maxTokens?: number;
  parentModel?: string;
}

export class SubAgentManager {
  private registry = new Map<string, SubAgentConfig>();
  private instances = new Map<string, SubAgentInstance>();
  private maxConcurrentAgents = 5;
  private activeAgents = 0;
  private deps: SubAgentManagerDeps = {};

  constructor(deps?: SubAgentManagerDeps) {
    this.deps = deps ?? {};
    for (const [name, cfg] of Object.entries(predefinedAgents)) this.registry.set(name, cfg);
    this.loadPatternAgents();
    this.loadSkillTrees();
  }

  /** 从 patterns/ 目录加载 Markdown Agent 定义（吸收自 Deep Agents AGENTS.md） */
  private loadPatternAgents(): void {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = __filename.substring(0, __filename.lastIndexOf('/'));
    const patternsDir = __dirname + '/patterns';
    try {
      const entries = readdirSync(patternsDir);
      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue;
        const fullPath = patternsDir + '/' + entry;
        if (!statSync(fullPath).isFile()) continue;
        const agent = loadAgentFromMarkdown(fullPath);
        if (agent) this.registry.set(agent.name, agent);
      }
    } catch {
      // patterns/ 目录不存在或不可读，静默跳过
    }
  }

  /** 从磁盘加载已持久化的技能树数据（吸收自 Hermes Agent 自改进学习循环） */
  private loadSkillTrees(): void {
    try {
      if (!existsSync(SKILL_TREE_DIR)) return
      const files = readdirSync(SKILL_TREE_DIR).filter(f => f.endsWith('.json'))
      for (const file of files) {
        try {
          const raw = readFileSync(join(SKILL_TREE_DIR, file), 'utf-8')
          const data = JSON.parse(raw) as { agentName: string; tree: SubAgentConfig['skillTree'] }
          const config = this.registry.get(data.agentName)
          if (config?.skillTree && data.tree) {
            config.skillTree.proficiency = data.tree.proficiency ?? config.skillTree.proficiency
            config.skillTree.mastered = data.tree.mastered ?? config.skillTree.mastered
            config.skillTree.learning = data.tree.learning ?? config.skillTree.learning
            config.skillTree.lastUpdated = data.tree.lastUpdated ?? config.skillTree.lastUpdated
          }
        } catch { /* 单文件损坏则跳过 */ }
      }
    } catch { /* 目录不可读则跳过 */ }
  }

  /** 将技能树数据持久化到磁盘（吸收自 Hermes Agent 自改进学习循环） */
  private persistSkillTree(agentName: string): void {
    try {
      mkdirSync(SKILL_TREE_DIR, { recursive: true })
      const config = this.registry.get(agentName)
      if (!config?.skillTree) return
      const payload = JSON.stringify({ agentName, tree: config.skillTree }, null, 2)
      writeFileSync(join(SKILL_TREE_DIR, `${agentName}.json`), payload, 'utf-8')
    } catch { /* 持久化失败静默跳过 */ }
  }

  setDeps(deps: SubAgentManagerDeps): void {
    this.deps = deps;
  }

  register(config: SubAgentConfig): void {
    this.registry.set(config.name, config);
  }

  async execute(params: ExecuteSubAgentParams): Promise<{
    success: boolean;
    output?: string;
    tokenUsage?: unknown;
    duration: number;
    error?: string;
  }> {
    const config = this.registry.get(params.agentName);
    if (!config) return { success: false, error: `Sub-agent not found: ${params.agentName}`, duration: 0 };
    if (this.activeAgents >= this.maxConcurrentAgents) {
      return { success: false, error: "Maximum concurrent agents reached", duration: 0 };
    }
    this.activeAgents++;
    const startTime = new Date();
    const instance: SubAgentInstance = {
      id: params.id,
      agentName: params.agentName,
      engine: this.createQueryEngine(config, params),
      startTime,
      status: "running",
    };
    this.instances.set(params.id, instance);
    this.deps.onEvent?.({ type: 'start', agentName: params.agentName, instanceId: params.id });

    // OpenCode: 为 build 模式 Agent 创建隔离 worktree
    let worktreePath: string | undefined;
    let worktreeBranch: string | undefined;
    if (config.mode === 'build' || config.accessParentContext === false) {
      try {
        const wt = await createAgentWorktree('agent-' + params.agentName + '-' + params.id.slice(0, 8));
        worktreePath = wt.worktreePath;
        worktreeBranch = wt.worktreeBranch;
        instance.worktreePath = worktreePath;
        instance.worktreeBranch = worktreeBranch;
      } catch (_err) {
        // worktree 创建失败回退到共享文件系统
      }
    }

    // Agent 执行追踪：traceId 需在 try/catch 外声明
    let traceId: string
    try {
      // 自进化技能树：执行前检查技能熟练度（吸收自 Hermes Agent）
      const skillTree = config.skillTree
      if (skillTree && skillTree.mastered.length > 0) {
        console.log(`[SKILL_TREE] Agent ${params.agentName}: 已掌握 ${skillTree.mastered.length} 个技能`)
      }

      // Agent 执行追踪：记录完整执行链路（吸收自 LangSmith / CrewAI trace）
      traceId = this.startTrace(params.agentName, params.input)

      const result = await instance.engine.query(params.input);
      instance.status = "completed";
      const duration = Date.now() - startTime.getTime();
      // 自进化技能树：成功执行后更新技能熟练度（吸收自 Hermes Agent）
      if (config.skillTree) {
        for (const skill of config.skillTree.mastered) {
          this.updateSkillProficiency(params.agentName, skill, true)
        }
      }
      // 完成追踪
      const outputContent = result.messages[result.messages.length - 1]?.content ?? ""
      this.endTrace(traceId, outputContent)
      this.recordExperience(params.agentName, true, duration)
      // 追踪数据持久化（吸收自 LangSmith export）
      if (this.deps.onTracePersist && traceId) {
        const trace = this.traceLog.find(t => t.traceId === traceId)
        if (trace) {
          this.deps.onTracePersist({
            traceId,
            agentName: params.agentName,
            input: params.input,
            output: outputContent,
            toolCalls: trace.toolCalls,
            startTime: trace.startTime,
            endTime: trace.endTime ?? Date.now(),
          })
        }
      }
      this.deps.onEvent?.({
        type: 'complete',
        agentName: params.agentName,
        instanceId: params.id,
        output: outputContent,
        duration,
      });
      return {
        success: true,
        output: result.messages[result.messages.length - 1]?.content ?? "",
        tokenUsage: result.tokenUsage,
        duration,
      };
    } catch (e) {
      instance.status = "failed";
      const duration = Date.now() - startTime.getTime();
      const errMsg = e instanceof Error ? e.message : String(e)
      this.failTrace(traceId, errMsg)
      this.recordExperience(params.agentName, false, duration)
      // 失败 trace 也持久化
      if (traceId && this.deps.onTracePersist) {
        const trace = this.traceLog.find(t => t.traceId === traceId)
        if (trace) {
          this.deps.onTracePersist({
            traceId,
            agentName: params.agentName,
            input: params.input,
            error: errMsg,
            toolCalls: trace.toolCalls,
            startTime: trace.startTime,
            endTime: trace.endTime ?? Date.now(),
          })
        }
      }
      this.deps.onEvent?.({
        type: 'fail',
        agentName: params.agentName,
        instanceId: params.id,
        error: errMsg,
        duration,
      });
      return { success: false, error: errMsg, duration };
    } finally {
      // OpenCode: build 模式 Agent 完成后自动清理 worktree
      if (worktreePath && config.mode === 'build') {
        try { await removeAgentWorktree(worktreePath); } catch { /* noop */ }
      }
      this.instances.delete(params.id);
      this.activeAgents--;
    }
  }

  private createQueryEngine(config: SubAgentConfig, params: ExecuteSubAgentParams): SubAgentInstance["engine"] {
    const maxTokens = params.maxTokens ?? config.maxTokens ?? 4000;
    // 隔离的消息历史（含系统提示），保证子代理上下文不泄漏到父会话
    const messages: Array<{ role: string; content: string }> = [];
    let aborted = false;

    // 组装系统提示（吸收自 ag2 Harness AssemblyPolicy：工具 + 知识 + 记忆组合）
    let systemPrompt = config.systemPrompt ?? ''
    if (config.assembly) {
      const parts: string[] = []
      if (config.assembly.tools !== 'none') {
        parts.push(`可用工具: ${config.assembly.tools === 'all' ? '全部' : config.allowedTools?.join(', ') ?? '受限'}`)
      }
      // KnowledgePolicy 详细指令（吸收自 ag2 KnowledgePolicy）
      if (config.assembly.knowledge === 'query_based') {
        parts.push('知识检索: 按需查询（任务需要时主动检索知识库）')
      } else if (config.assembly.knowledge === 'full') {
        parts.push('知识检索: 完整注入（所有相关知识已预加载到上下文中）')
      }
      // MemoryPolicy 详细指令（吸收自 ag2 CompactPolicy 记忆管理）
      if (config.assembly.memory === 'recent') {
        parts.push('记忆: 仅最近对话（节省上下文空间）')
      } else if (config.assembly.memory === 'full') {
        parts.push('记忆: 完整历史（包含所有相关对话上下文）')
      }
      // 自定义系统提示模板
      if (config.assembly.systemPromptTemplate) {
        parts.push(`模板: ${config.assembly.systemPromptTemplate}`)
      }
      if (parts.length > 0) {
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n[Harness 配置]\n${parts.join('\n')}`
          : parts.join('\n')
      }
    }
    messages.push({ role: "system", content: systemPrompt })

    return {
      async query(input: string) {
        if (aborted) {
          return { messages: [{ content: "[子代理已中止]" }], tokenUsage: { maxTokens } };
        }
        // 记录用户输入，维护隔离上下文
        messages.push({ role: "user", content: input });
        // 隔离引擎响应：标注代理身份与输入摘要。
        // 真实推理由外部引擎（见 §2 MessageLoop）注入，此处保证接口完整。
        const responseContent =
          `[${config.name}] 已收到输入（${input.length} 字符）。` +
          `当前为隔离引擎实现，真实推理由外部引擎注入。`;
        messages.push({ role: "assistant", content: responseContent });
        return { messages: [{ content: responseContent }], tokenUsage: { maxTokens } };
      },
      async abort() {
        aborted = true;
      },
    };
  }

  getActiveAgents(): SubAgentInstance[] {
    return Array.from(this.instances.values()).filter((i) => i.status === "running");
  }

  /** 自进化技能树：更新技能熟练度（吸收自 Hermes Agent 自改进学习循环） */
  updateSkillProficiency(agentName: string, skillName: string, success: boolean): void {
    const config = this.registry.get(agentName)
    if (!config?.skillTree) return
    const tree = config.skillTree
    const current = tree.proficiency[skillName] ?? 0.5
    // 成功则小幅提升，失败则小幅下降
    const delta = success ? 0.05 : -0.03
    tree.proficiency[skillName] = Math.max(0, Math.min(1, current + delta))
    tree.lastUpdated = Date.now()
    // 熟练度 >= 0.8 且不在 mastered 中则加入 mastered
    if (tree.proficiency[skillName] >= 0.8 && !tree.mastered.includes(skillName)) {
      tree.mastered.push(skillName)
      const idx = tree.learning.indexOf(skillName)
      if (idx >= 0) tree.learning.splice(idx, 1)
    }
    this.persistSkillTree(agentName)
  }

  /** 获取技能树摘要（吸收自 Hermes Agent 自改进学习循环） */
  getSkillTreeSummary(agentName: string): string {
    const config = this.registry.get(agentName)
    if (!config?.skillTree) return '未配置技能树'
    const tree = config.skillTree
    const lines = [
      `技能树 [${agentName}]:`,
      `  已掌握 (${tree.mastered.length}): ${tree.mastered.join(', ') || '无'}`,
      `  学习中 (${tree.learning.length}): ${tree.learning.join(', ') || '无'}`,
    ]
    const entries = Object.entries(tree.proficiency)
    if (entries.length > 0) {
      const top = entries.sort((a, b) => b[1] - a[1]).slice(0, 5)
      lines.push(`  熟练度 TOP5: ${top.map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`).join(', ')}`)
    }
    return lines.join('\n')
  }

  /** 按模型强度路由子代理（吸收自 OpenClaude Agent Routing） */
  routeByModel(modelId: string): SubAgentConfig {
    const exactMatch = Array.from(this.registry.values()).find(c => c.modelId === modelId)
    if (exactMatch) return exactMatch
    const prefix = modelId.split(/[-/]/)[0]
    const prefixMatch = Array.from(this.registry.values()).filter(c => c.modelId?.startsWith(prefix))
    if (prefixMatch.length > 0) {
      return prefixMatch.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0]
    }
    // 无匹配时返回 priority 最高的代理
    return this.listByPriority()[0] as SubAgentConfig
  }

  /** 列出所有注册代理，按 priority 降序排列（吸收自 OpenClaude Agent Routing） */
  listByPriority(): SubAgentConfig[] {
    return Array.from(this.registry.values()).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }

  async terminate(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.status = "terminated";
      this.deps.onEvent?.({ type: 'abort', agentName: instance.agentName, instanceId });
      await instance.engine.abort();
      this.instances.delete(instanceId);
      this.activeAgents--;
    }
  }

  /** 自改进学习循环（吸收自 Hermes Agent）：记录执行经验用于后续路由优化 */
  private experienceLog: Array<{ agentName: string; success: boolean; duration: number; timestamp: number }> = []

  recordExperience(agentName: string, success: boolean, duration: number): void {
    this.experienceLog.push({ agentName, success, duration, timestamp: Date.now() })
    if (this.experienceLog.length > 1000) this.experienceLog = this.experienceLog.slice(-500)
  }

  /** 获取指定代理的成功率统计 */
  getAgentStats(agentName: string): { total: number; success: number; avgDuration: number } {
    const relevant = this.experienceLog.filter(e => e.agentName === agentName)
    const total = relevant.length
    const success = relevant.filter(e => e.success).length
    const avgDuration = total > 0 ? relevant.reduce((s, e) => s + e.duration, 0) / total : 0
    return { total, success, avgDuration }
  }

  /** Agent 执行追踪（吸收自 LangSmith / CrewAI trace）：记录完整执行链路 */
  private traceLog: Array<{ traceId: string; agentName: string; input: string; output?: string; error?: string; startTime: number; endTime?: number; toolCalls: string[] }> = []

  startTrace(agentName: string, input: string): string {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.traceLog.push({ traceId, agentName, input, startTime: Date.now(), toolCalls: [] })
    return traceId
  }

  endTrace(traceId: string, output: string, toolCalls: string[] = []): void {
    const trace = this.traceLog.find(t => t.traceId === traceId)
    if (trace) {
      trace.output = output
      trace.endTime = Date.now()
      trace.toolCalls = toolCalls
    }
  }

  failTrace(traceId: string, error: string): void {
    const trace = this.traceLog.find(t => t.traceId === traceId)
    if (trace) {
      trace.error = error
      trace.endTime = Date.now()
    }
  }

  /** 按 capability 匹配代理（吸收自 AAS Core 能力标签） */
  findByCapabilities(requiredCapabilities: string[]): SubAgentConfig[] {
    return Array.from(this.registry.values()).filter(cfg => {
      if (!cfg.capabilities || cfg.capabilities.length === 0) return false
      return requiredCapabilities.some(cap => cfg.capabilities!.includes(cap))
    })
  }

  getTraceLog(): typeof this.traceLog {
    return [...this.traceLog]
  }
}
