/**
 * 工具接口
 */
export interface ITool {
  name: string;
  description: string;
  parameters: ToolParameters;
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
  private readonly DEFAULT_TIMEOUT_MS = 60000;

  constructor(private maxTimeoutMs: number = 60000) {
    this.DEFAULT_TIMEOUT_MS = maxTimeoutMs;
  }

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

    // 3. 执行（带超时）
    try {
      const result = await Promise.race([
        tool.execute(params, context),
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
}