/**
 * 工具接口
 */
export interface ITool {
  name: string;
  description: string;
  parameters: ToolParameters;
  /** 依赖的其他工具名（注册时自动解析注入） */
  dependencies?: string[];
  /** 工具组合：将多个工具组合为复合工具 */
  compose?: (tools: Record<string, ITool>) => (params: Record<string, any>, context: ToolExecutionContext) => Promise<ToolResult>;
  execute(params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult>;
}

/**
 * 工具参数定义
 */
export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

/**
 * 工具参数属性
 */
export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: any;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  sessionId: string;
  messageId: string;
  userId?: string;
  permissions: string[];
}

/**
 * 工具结果
 */
export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  errorType?: 'validation' | 'permission' | 'execution' | 'timeout' | 'not_found';
  durationMs?: number;
}

/**
 * 工具注册表类
 * 提供工具注册、参数验证、权限检查、调用统计、错误分类
 */
export class ToolRegistry {
  private tools = new Map<string, ITool>();
  private stats = new Map<string, { calls: number; failures: number; totalDurationMs: number; avgDurationMs: number }>();
  private permissionCache = new Map<string, boolean>();

  constructor(private maxTimeoutMs: number = 60000) {}

  register(tool: ITool): void {
    if (!tool || !tool.name) throw new Error('Invalid tool: name is required');
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    if (!tool.description || tool.description.trim().length === 0) {
      throw new Error(`Invalid tool '${tool.name}': description is required`);
    }
    if (!tool.parameters || tool.parameters.type !== 'object') {
      throw new Error(`Invalid tool '${tool.name}': parameters must be an object schema`);
    }
    this.tools.set(tool.name, tool);
    if (!this.stats.has(tool.name)) {
      this.stats.set(tool.name, { calls: 0, failures: 0, totalDurationMs: 0, avgDurationMs: 0 });
    }
    this.permissionCache.delete(tool.name); // 清除权限缓存

    // 自动解析依赖：检查声明的依赖是否已注册
    if (tool.dependencies) {
      for (const dep of tool.dependencies) {
        if (!this.tools.has(dep)) {
          throw new Error(`Tool '${tool.name}' has unresolved dependency: ${dep}`);
        }
      }
    }
  }

  unregister(name: string): void {
    if (!this.tools.has(name)) throw new Error(`Tool not found: ${name}`);
    this.tools.delete(name);
    this.stats.delete(name);
    this.permissionCache.delete(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): ITool | null {
    return this.tools.get(name) ?? null;
  }

  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * 验证工具参数是否符合 schema
   */
  private validateParams(tool: ITool, params: Record<string, any>): string | null {
    const { properties = {}, required = [] } = tool.parameters;

    // 检查必填参数
    for (const reqKey of required) {
      const val = params[reqKey];
      if (val === undefined || val === null || val === '') {
        const prop = properties[reqKey];
        return `Missing required parameter: ${reqKey}${prop?.description ? ` (${prop.description})` : ''}`;
      }
    }

    // 检查参数类型和约束
    for (const [key, prop] of Object.entries(properties)) {
      const val = params[key];
      if (val === undefined || val === null) {
        if (prop.default !== undefined) params[key] = prop.default;
        continue;
      }

      // 类型检查
      const valType = Array.isArray(val) ? 'array' : typeof val;
      if (prop.type && prop.type !== 'any' && prop.type !== valType) {
        return `Parameter '${key}' must be ${prop.type}, got ${valType}`;
      }

      // 枚举检查
      if (prop.enum && !prop.enum.includes(val)) {
        return `Parameter '${key}' must be one of: ${prop.enum.join(', ')}`;
      }

      // 数值范围检查
      if (typeof val === 'number') {
        if (prop.minimum !== undefined && val < prop.minimum) {
          return `Parameter '${key}' must be >= ${prop.minimum}`;
        }
        if (prop.maximum !== undefined && val > prop.maximum) {
          return `Parameter '${key}' must be <= ${prop.maximum}`;
        }
      }

      // 字符串约束
      if (typeof val === 'string') {
        if (prop.minLength !== undefined && val.length < prop.minLength) {
          return `Parameter '${key}' must be at least ${prop.minLength} chars`;
        }
        if (prop.maxLength !== undefined && val.length > prop.maxLength) {
          return `Parameter '${key}' must be at most ${prop.maxLength} chars`;
        }
        if (prop.pattern && !new RegExp(prop.pattern).test(val)) {
          return `Parameter '${key}' does not match pattern: ${prop.pattern}`;
        }
      }
    }
    return null;
  }

  /**
   * 检查权限（带缓存）
   */
  private checkPermissions(name: string, context: ToolExecutionContext): boolean {
    if (!context.permissions || context.permissions.length === 0) return true;
    const cacheKey = `${name}:${context.permissions.join(',')}`;
    if (this.permissionCache.has(cacheKey)) return this.permissionCache.get(cacheKey)!;

    // 权限格式: "allow:ToolName" / "deny:ToolName" / "allow:*" / "deny:*"
    const allowAll = context.permissions.includes('allow:*');
    const denyAll = context.permissions.includes('deny:*');
    const allowTool = context.permissions.includes(`allow:${name}`);
    const denyTool = context.permissions.includes(`deny:${name}`);

    let allowed = true;
    if (denyTool || denyAll) allowed = false;
    else if (allowTool || allowAll) allowed = true;
    else allowed = context.permissions.includes('default');

    this.permissionCache.set(cacheKey, allowed);
    return allowed;
  }

  /**
   * 执行工具（带参数验证、权限检查、超时、计时、错误分类）
   */
  async execute(name: string, params: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { success: false, error: `Tool not found: ${name}`, errorType: 'not_found' };

    const start = Date.now();
    const stat = this.stats.get(name) || { calls: 0, failures: 0, totalDurationMs: 0, avgDurationMs: 0 };
    stat.calls++;
    this.stats.set(name, stat);

    // 1. 参数验证
    const validationError = this.validateParams(tool, params);
    if (validationError) {
      stat.failures++;
      return { success: false, error: validationError, errorType: 'validation', durationMs: Date.now() - start };
    }

    // 2. 权限检查
    if (!this.checkPermissions(name, context)) {
      stat.failures++;
      return { success: false, error: `Permission denied for tool: ${name}`, errorType: 'permission', durationMs: Date.now() - start };
    }

    // 3. 执行（带超时；组合工具用 compose，普通工具用 execute）
    try {
      const executor = tool.compose
        ? tool.compose(this.getDependencies(tool))
        : tool.execute.bind(tool);
      const result = await Promise.race([
        executor(params, context),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool execution timeout after ${this.maxTimeoutMs}ms`)), this.maxTimeoutMs)
        ),
      ]);

      const duration = Date.now() - start;
      stat.totalDurationMs += duration;
      stat.avgDurationMs = Math.round(stat.totalDurationMs / stat.calls);

      if (result && result.success === false) {
        stat.failures++;
      }
      return { ...result, durationMs: duration };
    } catch (err) {
      stat.failures++;
      const duration = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes('timeout');
      return {
        success: false,
        error: message,
        errorType: isTimeout ? 'timeout' : 'execution',
        durationMs: duration,
      };
    }
  }

  getStats(): Record<string, { calls: number; failures: number; avgDurationMs: number }> {
    const result: Record<string, { calls: number; failures: number; avgDurationMs: number }> = {};
    for (const [name, stat] of this.stats) {
      result[name] = {
        calls: stat.calls,
        failures: stat.failures,
        avgDurationMs: stat.avgDurationMs,
      };
    }
    return result;
  }

  /** 获取工具总数 */
  size(): number {
    return this.tools.size;
  }

  /** 列出所有工具名 */
  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * 获取工具依赖（按名称解析）
   */
  getDependencies(tool: ITool): Record<string, ITool> {
    const resolved: Record<string, ITool> = {};
    if (tool.dependencies) {
      for (const depName of tool.dependencies) {
        const dep = this.tools.get(depName);
        if (dep) resolved[depName] = dep;
      }
    }
    return resolved;
  }

  /**
   * 组合多个工具为一个复合工具
   * @param name 组合工具名
   * @param dependencies 依赖的工具名
   * @param compose 组合执行函数
   */
  compose(name: string, dependencies: string[], composeFn: (tools: Record<string, ITool>) => (params: Record<string, any>, context: ToolExecutionContext) => Promise<ToolResult>): ITool {
    // 验证依赖存在
    for (const dep of dependencies) {
      if (!this.tools.has(dep)) {
        throw new Error(`Cannot compose '${name}': missing dependency '${dep}'`);
      }
    }
    const composite: ITool = {
      name,
      description: `Composite tool combining: ${dependencies.join(', ')}`,
      parameters: { type: 'object', properties: {}, required: [] },
      dependencies,
      compose: composeFn,
      execute: async () => ({ success: false, error: 'Composite tool must use compose function', errorType: 'execution' }),
    };
    this.register(composite);
    return composite;
  }

  /**
   * 检查工具依赖是否完整解析
   */
  checkDependencies(): string[] {
    const unresolved: string[] = [];
    for (const tool of this.tools.values()) {
      if (tool.dependencies) {
        for (const dep of tool.dependencies) {
          if (!this.tools.has(dep)) unresolved.push(`${tool.name} -> ${dep}`);
        }
      }
    }
    return unresolved;
  }

  /**
   * 依赖拓扑排序（被依赖的工具排前面）
   * 使用 Kahn 算法处理依赖顺序，检测循环依赖
   * @returns 排序后的工具名数组
   * @throws 存在循环依赖时抛错
   */
  topoSort(): string[] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    // 初始化
    for (const name of this.tools.keys()) {
      inDegree.set(name, 0);
      adjList.set(name, []);
    }

    // 构建邻接表（依赖者 -> 被依赖者反向边）
    for (const tool of this.tools.values()) {
      if (tool.dependencies) {
        for (const dep of tool.dependencies) {
          if (!this.tools.has(dep)) continue;
          // tool 依赖 dep，所以 dep 应排在 tool 前面
          adjList.get(dep)!.push(tool.name);
          inDegree.set(tool.name, (inDegree.get(tool.name) || 0) + 1);
        }
      }
    }

    // Kahn 算法
    const queue: string[] = [];
    for (const [name, deg] of inDegree) {
      if (deg === 0) queue.push(name);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const neighbor of adjList.get(node) || []) {
        const newDeg = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    // 检测循环依赖
    if (sorted.length !== this.tools.size) {
      const cyclic = Array.from(this.tools.keys()).filter(n => !sorted.includes(n));
      throw new Error(`Circular dependency detected among: ${cyclic.join(', ')}`);
    }

    return sorted;
  }

  /**
   * 获取依赖深度（被依赖层次）
   */
  getDependencyDepth(name: string): number {
    const tool = this.tools.get(name);
    if (!tool || !tool.dependencies) return 0;
    let maxDepth = 0;
    for (const dep of tool.dependencies) {
      maxDepth = Math.max(maxDepth, 1 + this.getDependencyDepth(dep));
    }
    return maxDepth;
  }

  /**
   * 列出无依赖的工具（叶子工具）
   */
  listLeafTools(): string[] {
    return Array.from(this.tools.values())
      .filter(t => !t.dependencies || t.dependencies.length === 0)
      .map(t => t.name);
  }
}