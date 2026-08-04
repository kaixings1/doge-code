/**
 * 命令接口
 */
export interface ICommand {
  name: string;
  description: string;
  aliases?: string[];
  usage?: string;
  examples?: string[];
  execute(args: string[], context: CommandContext): Promise<CommandResult>;
}

/**
 * 命令上下文
 */
export interface CommandContext {
  sessionId: string;
  workingDirectory: string;
  args: string[];
  options: Record<string, any>;
}

/**
 * 命令结果
 */
export interface CommandResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
}

/**
 * 解析后的命令
 */
export interface ParsedCommand {
  name: string;
  args: string[];
  options: Record<string, any>;
}

/**
 * 命令注册表类
 * 提供命令注册、智能解析（支持引号/选项）、历史记录、模糊搜索
 */
export class CommandRegistry {
  private commands = new Map<string, ICommand>();
  private aliasMap = new Map<string, string>();
  private history: string[] = [];
  private readonly MAX_HISTORY = 100;

  register(command: ICommand): void {
    if (!command || !command.name) throw new Error('Invalid command: name is required');
    if (this.commands.has(command.name)) throw new Error(`Command already registered: ${command.name}`);
    if (!command.description || command.description.trim().length === 0) {
      throw new Error(`Invalid command '${command.name}': description is required`);
    }
    this.commands.set(command.name, command);
    if (command.aliases) {
      for (const alias of command.aliases) {
        const cleanAlias = alias.trim().replace(/^\//, '');
        if (this.aliasMap.has(cleanAlias)) {
          throw new Error(`Alias conflict: '${cleanAlias}' already maps to '${this.aliasMap.get(cleanAlias)}'`);
        }
        this.aliasMap.set(cleanAlias, command.name);
      }
    }
  }

  unregister(name: string): void {
    const cmd = this.commands.get(name);
    if (!cmd) throw new Error(`Command not found: ${name}`);
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        this.aliasMap.delete(alias.trim().replace(/^\//, ''));
      }
    }
    this.commands.delete(name);
  }

  has(name: string): boolean {
    const cleanName = name.replace(/^\//, '');
    return this.commands.has(cleanName) || this.aliasMap.has(cleanName);
  }

  get(name: string): ICommand | null {
    const cleanName = name.replace(/^\//, '');
    const resolvedName = this.aliasMap.get(cleanName) || cleanName;
    return this.commands.get(resolvedName) ?? null;
  }

  getAll(): ICommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * 智能解析：支持带引号参数、--key=value、--flag、-k value、-k=value
   */
  parse(input: string): ParsedCommand {
    const tokens = this.tokenize(input);
    if (tokens.length === 0) return { name: '', args: [], options: {} };

    const name = tokens[0].replace(/^\//, '');
    const args: string[] = [];
    const options: Record<string, any> = {};

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i];

      // 长选项 --key=value 或 --key
      if (token.startsWith('--')) {
        const eqIdx = token.indexOf('=');
        if (eqIdx > 0) {
          const key = token.slice(2, eqIdx);
          let value: any = token.slice(eqIdx + 1);
          // 尝试数字/布尔转换
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
          options[key] = value;
        } else {
          options[token.slice(2)] = true;
        }
        continue;
      }

      // 短选项 -k value 或 -k=value
      if (token.startsWith('-') && token.length >= 2 && !/^-?\d/.test(token)) {
        const eqIdx = token.indexOf('=');
        if (eqIdx > 0) {
          const key = token.slice(1, eqIdx);
          let value: any = token.slice(eqIdx + 1);
          if (value === 'true') value = true;
          else if (value === 'false') value = false;
          else if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
          options[key] = value;
        } else {
          const key = token.slice(1);
          const next = tokens[i + 1];
          if (next && !next.startsWith('-')) {
            let value: any = next;
            if (value === 'true') value = true;
            else if (value === 'false') value = false;
            else if (/^-?\d+(\.\d+)?$/.test(value)) value = Number(value);
            options[key] = value;
            i++;
          } else {
            options[key] = true;
          }
        }
        continue;
      }

      // 位置参数
      args.push(token);
    }

    return { name, args, options };
  }

  /**
   * 分词：支持单引号/双引号/转义
   */
  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let escaped = false;

    for (const ch of input) {
      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }
      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }
      if (ch === ' ' && !inSingle && !inDouble) {
        if (current) { tokens.push(current); current = ''; }
        continue;
      }
      current += ch;
    }
    if (current) tokens.push(current);
    return tokens;
  }

  /**
   * 执行命令（带历史记录）
   */
  async execute(input: string, context: CommandContext): Promise<CommandResult> {
    const parsed = this.parse(input);
    const cmd = this.get(parsed.name);
    if (!cmd) return { success: false, error: `Command not found: ${parsed.name}`, exitCode: 1 };

    // 记录历史
    this.history.push(input);
    if (this.history.length > this.MAX_HISTORY) this.history.shift();

    try {
      const result = await cmd.execute(parsed.args, { ...context, args: parsed.args, options: parsed.options });
      return result;
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err), exitCode: 1 };
    }
  }

  /**
   * 模糊搜索：按名称、别名、描述匹配，返回相关性排序
   */
  search(query: string): ICommand[] {
    const q = query.toLowerCase().replace(/^\//, '');
    if (!q) return this.getAll();

    const scored: Array<{ cmd: ICommand; score: number }> = [];
    for (const cmd of this.commands.values()) {
      let score = 0;
      const name = cmd.name.toLowerCase();

      // 完全匹配名称
      if (name === q) score += 100;
      // 名称前缀匹配
      else if (name.startsWith(q)) score += 60;
      // 名称包含匹配
      else if (name.includes(q)) score += 40;

      // 别名匹配
      if (cmd.aliases) {
        for (const alias of cmd.aliases) {
          const a = alias.toLowerCase().replace(/^\//, '');
          if (a === q) score += 80;
          else if (a.startsWith(q)) score += 50;
          else if (a.includes(q)) score += 30;
        }
      }

      // 描述匹配
      const desc = cmd.description.toLowerCase();
      if (desc.includes(q)) score += 20;

      if (score > 0) scored.push({ cmd, score });
    }

    return scored.sort((a, b) => b.score - a.score).map(s => s.cmd);
  }

  /** 获取命令历史 */
  getHistory(): string[] {
    return [...this.history];
  }

  /** 清空命令历史 */
  clearHistory(): void {
    this.history = [];
  }

  /** 命令总数 */
  size(): number {
    return this.commands.size;
  }

  /** 所有命令名 */
  listNames(): string[] {
    return Array.from(this.commands.keys());
  }
}