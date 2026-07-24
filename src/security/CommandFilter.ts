/**
 * 命令过滤器
 * 文件：src/security/CommandFilter.ts
 * 文档 16 §5.1
 */

export interface CommandFilterRule {
  id: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  category: 'destructive' | 'network' | 'privilege' | 'information' | 'other';
}

export class CommandFilter {
  private rules: CommandFilterRule[] = [
    // ===== 高危：数据销毁 =====
    {
      id: 'rm-rf-root',
      pattern: /rm\s+-rf\s+\/(\s|$)/,
      severity: 'critical',
      message: '禁止删除根目录',
      category: 'destructive',
    },
    {
      id: 'rm-rf-home',
      pattern: /rm\s+-rf\s+~(\/|\s|$)/,
      severity: 'critical',
      message: '禁止删除用户主目录',
      category: 'destructive',
    },
    {
      id: 'rm-rf-star',
      pattern: /rm\s+-rf\s+\*/,
      severity: 'critical',
      message: '禁止递归删除当前目录所有文件',
      category: 'destructive',
    },
    {
      id: 'format',
      pattern: /format\s+[a-z]:/i,
      severity: 'critical',
      message: '禁止格式化磁盘',
      category: 'destructive',
    },
    {
      id: 'mkfs',
      pattern: /mkfs\./,
      severity: 'critical',
      message: '禁止格式化文件系统',
      category: 'destructive',
    },
    {
      id: 'dd-dev',
      pattern: /dd\s+.*of=\/dev\//,
      severity: 'critical',
      message: '禁止直接写入设备',
      category: 'destructive',
    },

    // ===== 高危：权限提升 =====
    {
      id: 'chmod-777',
      pattern: /chmod\s+777\s+\//,
      severity: 'high',
      message: '禁止对根路径设置 777 权限',
      category: 'privilege',
    },
    {
      id: 'sudo',
      pattern: /^sudo\s/,
      severity: 'high',
      message: 'sudo 命令需要额外确认',
      category: 'privilege',
    },
    {
      id: 'su',
      pattern: /^su\s/,
      severity: 'high',
      message: '用户切换命令需要额外确认',
      category: 'privilege',
    },

    // ===== 中危：系统操作 =====
    {
      id: 'shutdown',
      pattern: /shutdown|reboot|halt|poweroff/,
      severity: 'high',
      message: '系统关机/重启命令',
      category: 'destructive',
    },
    {
      id: 'kill-process',
      pattern: /kill\s+-9/,
      severity: 'medium',
      message: '强制终止进程',
      category: 'destructive',
    },
    {
      id: 'killall',
      pattern: /killall\s+/,
      severity: 'medium',
      message: '批量终止进程',
      category: 'destructive',
    },

    // ===== 中危：网络操作 =====
    {
      id: 'curl-pipe-sh',
      pattern: /curl\s+.*\|\s*(sh|bash|zsh)/,
      severity: 'critical',
      message: '禁止从网络下载并执行脚本',
      category: 'network',
    },
    {
      id: 'wget-pipe-sh',
      pattern: /wget\s+.*\|\s*(sh|bash|zsh)/,
      severity: 'critical',
      message: '禁止从网络下载并执行脚本',
      category: 'network',
    },
    {
      id: 'nc-listen',
      pattern: /nc\s+.*-l/,
      severity: 'high',
      message: '网络监听可能暴露服务',
      category: 'network',
    },

    // ===== 低危：信息泄露 =====
    {
      id: 'env',
      pattern: /^env$/,
      severity: 'low',
      message: '显示所有环境变量（可能包含敏感信息）',
      category: 'information',
    },
    {
      id: 'history',
      pattern: /history\s*-c/,
      severity: 'low',
      message: '清除命令历史',
      category: 'information',
    },

    // ===== Fork Bomb =====
    {
      id: 'fork-bomb',
      pattern: /:\(\)\s*\{\s*:\|:\&\s*\}\s*;/,
      severity: 'critical',
      message: 'Fork bomb 检测',
      category: 'destructive',
    },
  ];

  /**
   * 检查命令
   */
  check(command: string): {
    allowed: boolean;
    violations: CommandFilterRule[];
  } {
    const violations: CommandFilterRule[] = [];

    for (const rule of this.rules) {
      if (rule.pattern.test(command)) {
        violations.push(rule);
      }
    }

    return {
      allowed: violations.length === 0 || violations.every((v) => v.severity === 'low'),
      violations,
    };
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: Omit<CommandFilterRule, 'id'> & { id?: string }): void {
    this.rules.push({
      ...rule,
      id: rule.id || `custom-${Date.now()}`,
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
  getRules(): CommandFilterRule[] {
    return [...this.rules];
  }
}
