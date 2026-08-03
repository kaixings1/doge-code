/**
 * 权限管理器
 * 文件：src/security/PermissionManager.ts
 * 文档 16 §2.1
 */

export type Permission =
  | 'read'
  | 'write'
  | 'execute'
  | 'network'
  | 'system'
  | 'admin';

export type PermissionDecision =
  | 'allow'
  | 'deny'
  | 'ask'
  | 'allow_once';

export interface PermissionRule {
  id: string;
  tool: string;
  pattern: string;
  decision: PermissionDecision;
  createdAt: Date;
  expiresAt?: Date;
}

export interface PermissionContext {
  tool: string;
  action: string;
  params: Record<string, any>;
  path?: string;
  command?: string;
}

export class PermissionManager {
  private rules: PermissionRule[] = [];
  private sessionGrants: Map<string, PermissionDecision> = new Map();
  private defaultDecision: PermissionDecision = 'ask';

  /**
   * 检查权限
   */
  checkPermission(context: PermissionContext): PermissionDecision {
    // 1. 检查会话临时授权
    const sessionKey = this.getSessionKey(context);
    const sessionGrant = this.sessionGrants.get(sessionKey);
    if (sessionGrant) {
      return sessionGrant;
    }

    // 2. 检查规则匹配
    for (const rule of this.rules) {
      if (this.matchRule(rule, context)) {
        if (rule.expiresAt && rule.expiresAt < new Date()) {
          continue; // 规则已过期
        }
        return rule.decision;
      }
    }

    // 3. 返回默认决策
    return this.defaultDecision;
  }

  /**
   * 授权
   */
  grant(context: PermissionContext, decision: PermissionDecision, persistent: boolean = false): void {
    if (persistent) {
      this.addRule({
        id: `rule-${Date.now()}`,
        tool: context.tool,
        pattern: this.buildPattern(context),
        decision,
      });
    } else {
      const sessionKey = this.getSessionKey(context);
      this.sessionGrants.set(sessionKey, decision);
    }
  }

  /**
   * 撤销授权
   */
  revoke(context: PermissionContext): void {
    const sessionKey = this.getSessionKey(context);
    this.sessionGrants.delete(sessionKey);

    // 移除匹配的持久规则
    this.rules = this.rules.filter(
      (rule) => !(rule.tool === context.tool && this.matchRule(rule, context))
    );
  }

  /**
   * 添加规则
   */
  addRule(rule: Omit<PermissionRule, 'id' | 'createdAt'> & { id?: string }): void {
    this.rules.push({
      ...rule,
      id: rule.id || `rule-${Date.now()}`,
      createdAt: new Date(),
    });
  }

  /**
   * 移除规则
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((rule) => rule.id !== ruleId);
  }

  /**
   * 获取所有规则
   */
  getRules(): PermissionRule[] {
    return [...this.rules];
  }

  /**
   * 清理会话授权
   */
  clearSessionGrants(): void {
    this.sessionGrants.clear();
  }

  /**
   * 匹配规则
   */
  private matchRule(rule: PermissionRule, context: PermissionContext): boolean {
    if (rule.tool !== context.tool && rule.tool !== '*') {
      return false;
    }

    // 简单的模式匹配
    if (rule.pattern === '*') {
      return true;
    }

    if (context.path && rule.pattern.startsWith('path:')) {
      const pathPattern = rule.pattern.slice(5);
      return this.matchPath(pathPattern, context.path);
    }

    if (context.command && rule.pattern.startsWith('cmd:')) {
      const cmdPattern = rule.pattern.slice(4);
      return this.matchCommand(cmdPattern, context.command);
    }

    return rule.pattern === context.action;
  }

  /**
   * 匹配路径
   */
  private matchPath(pattern: string, path: string): boolean {
    // 支持 glob 风格匹配
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regex}$`, 'i').test(path);
  }

  /**
   * 匹配命令
   */
  private matchCommand(pattern: string, command: string): boolean {
    return command.toLowerCase().includes(pattern.toLowerCase());
  }

  /**
   * 构建模式
   */
  private buildPattern(context: PermissionContext): string {
    if (context.path) {
      return `path:${context.path}`;
    }
    if (context.command) {
      return `cmd:${context.command}`;
    }
    return context.action;
  }

  /**
   * 获取会话键
   */
  private getSessionKey(context: PermissionContext): string {
    return `${context.tool}:${context.action}:${context.path || context.command || ''}`;
  }
}
