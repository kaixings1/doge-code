/**
 * 桌面端权限管理器
 * 在 Electron 主进程中运行，危险操作弹出系统确认对话框
 */

import { dialog, BrowserWindow } from 'electron'

export type PermissionDecision = 'allow' | 'deny' | 'allow_once' | 'ask'

export interface PermissionContext {
  tool: string
  action: string
  params: Record<string, unknown>
  path?: string
  command?: string
}

interface PermissionRule {
  id: string
  tool: string
  pattern: string
  decision: PermissionDecision
  persistent: boolean
}

// 工具风险等级
const TOOL_RISK: Record<string, 'safe' | 'medium' | 'high'> = {
  BashTool: 'high',
  FileWriteTool: 'high',
  FileEditTool: 'medium',
  WebFetchTool: 'medium',
  HttpTool: 'medium',
  NotebookEditTool: 'high',
  PowerShellTool: 'high',
  SedEditPermissionRequest: 'medium',
  ComputerUseApproval: 'high',
  MonitorPermissionRequest: 'medium',
  FileReadTool: 'safe',
  GrepTool: 'safe',
  GlobTool: 'safe',
  ListDirTool: 'safe',
  GetFileInfoTool: 'safe',
  TodoWriteTool: 'safe',
  CompareTool: 'safe',
}

// 默认风险等级
const DEFAULT_RISK: 'safe' | 'medium' | 'high' = 'medium'

// 动作描述映射
const ACTION_LABELS: Record<string, string> = {
  read: '读取',
  write: '写入',
  edit: '编辑',
  execute: '执行',
  fetch: '获取',
  search: '搜索',
  delete: '删除',
  list: '列出',
}

export class DesktopPermissionManager {
  private rules: PermissionRule[] = []
  private sessionGrants: Map<string, PermissionDecision> = new Map()
  private defaultDecision: PermissionDecision = 'ask'
  private mainWindow: BrowserWindow | null = null

  constructor(mainWindow?: BrowserWindow) {
    this.mainWindow = mainWindow || null
  }

  setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win
  }

  /**
   * 检查权限
   * @returns 'allow' | 'deny' | 'allow_once' | 'ask'
   */
  async checkPermission(context: PermissionContext): Promise<PermissionDecision> {
    // 1. 检查会话临时授权
    const sessionKey = this.getSessionKey(context)
    const sessionGrant = this.sessionGrants.get(sessionKey)
    if (sessionGrant) {
      return sessionGrant
    }

    // 2. 检查规则匹配
    for (const rule of this.rules) {
      if (this.matchRule(rule, context)) {
        return rule.decision
      }
    }

    // 3. 根据风险等级决定
    const risk = TOOL_RISK[context.tool] || DEFAULT_RISK

    if (risk === 'safe') {
      return 'allow'
    }

    // 需要用户确认
    if (risk === 'high' || this.defaultDecision === 'ask') {
      return await this.requestUserConfirmation(context)
    }

    return 'allow'
  }

  /**
   * 请求用户确认（弹出对话框）
   */
  private async requestUserConfirmation(context: PermissionContext): Promise<PermissionDecision> {
    const toolLabel = context.tool.replace('Tool', '')
    const actionLabel = ACTION_LABELS[context.action] || context.action
    const target = context.path || context.command || context.params?.path || context.params?.command || ''

    const message = this.buildMessage(context)

    // 使用 Electron dialog 在主进程中显示确认框
    const result = await dialog.showMessageBox(this.mainWindow || undefined, {
      type: 'warning',
      title: '权限请求',
      message: `允许 ${toolLabel} ${actionLabel}？`,
      detail: message,
      buttons: ['允许 (本次)', '拒绝', '始终允许'],
      defaultId: 0,
      cancelId: 1,
    })

    switch (result.response) {
      case 0: return 'allow_once'
      case 2: {
        // 始终允许 - 添加规则
        this.addRule({
          tool: context.tool,
          pattern: target ? `path:${target}` : '*',
          decision: 'allow',
          persistent: true,
        })
        return 'allow'
      }
      default: return 'deny'
    }
  }

  /**
   * 构建对话框消息
   */
  private buildMessage(context: PermissionContext): string {
    const lines: string[] = []

    if (context.path) {
      lines.push(`目标: ${context.path}`)
    }
    if (context.command) {
      lines.push(`命令: ${context.command}`)
    }
    if (context.params) {
      const paramStr = Object.entries(context.params)
        .filter(([k]) => !['path', 'command', 'file_path', 'content'].includes(k))
        .map(([k, v]) => `${k}: ${typeof v === 'string' && v.length > 100 ? v.slice(0, 100) + '...' : v}`)
        .join('\n')
      if (paramStr) lines.push(`参数:\n${paramStr}`)
    }

    return lines.join('\n') || '无额外信息'
  }

  /**
   * 记录授权决策
   */
  grant(context: PermissionContext, decision: PermissionDecision, persistent: boolean = false): void {
    if (persistent) {
      this.addRule({
        tool: context.tool,
        pattern: context.path ? `path:${context.path}` : '*',
        decision,
        persistent: true,
      })
    } else {
      const sessionKey = this.getSessionKey(context)
      this.sessionGrants.set(sessionKey, decision)
    }
  }

  /**
   * 添加规则
   */
  addRule(rule: Omit<PermissionRule, 'id'> & { id?: string }): void {
    this.rules.push({
      ...rule,
      id: rule.id || `rule-${Date.now()}`,
    })
  }

  /**
   * 获取所有规则
   */
  getRules(): PermissionRule[] {
    return [...this.rules]
  }

  /**
   * 清除会话授权
   */
  clearSessionGrants(): void {
    this.sessionGrants.clear()
  }

  /**
   * 移除规则
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((rule) => rule.id !== ruleId)
  }

  /**
   * 设置默认决策
   */
  setDefaultDecision(decision: PermissionDecision) {
    this.defaultDecision = decision
  }

  /**
   * 匹配规则
   */
  private matchRule(rule: PermissionRule, context: PermissionContext): boolean {
    if (rule.tool !== context.tool && rule.tool !== '*') {
      return false
    }

    if (rule.pattern === '*') {
      return true
    }

    if (context.path && rule.pattern.startsWith('path:')) {
      const pathPattern = rule.pattern.slice(5)
      return this.matchPath(pathPattern, context.path)
    }

    if (context.command && rule.pattern.startsWith('cmd:')) {
      const cmdPattern = rule.pattern.slice(4)
      return this.matchCommand(cmdPattern, context.command)
    }

    return rule.pattern === context.action
  }

  /**
   * 路径匹配
   */
  private matchPath(pattern: string, target: string): boolean {
    const normalizedPattern = pattern.toLowerCase().replace(/\\/g, '/')
    const normalizedTarget = target.toLowerCase().replace(/\\/g, '/')
    if (normalizedPattern === normalizedTarget) return true
    // 前缀匹配
    if (normalizedTarget.startsWith(normalizedPattern + '/') || normalizedTarget.startsWith(normalizedPattern + '\\')) {
      return true
    }
    // 简单 glob
    const regex = normalizedPattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.')
    return new RegExp(`^${regex}$`, 'i').test(normalizedTarget)
  }

  /**
   * 命令匹配
   */
  private matchCommand(pattern: string, command: string): boolean {
    return command.toLowerCase().includes(pattern.toLowerCase())
  }

  /**
   * 生成会话 key
   */
  private getSessionKey(context: PermissionContext): string {
    return `${context.tool}:${context.action}:${context.path || context.command || ''}`
  }
}

// 全局权限管理器实例
let permissionManager: DesktopPermissionManager | null = null

export function getPermissionManager(mainWindow?: BrowserWindow): DesktopPermissionManager {
  if (!permissionManager) {
    permissionManager = new DesktopPermissionManager(mainWindow)
  }
  if (mainWindow && !permissionManager.mainWindow) {
    permissionManager.setMainWindow(mainWindow)
  }
  return permissionManager
}
