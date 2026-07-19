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
 */
export class CommandRegistry {
  register(command: ICommand): void {
    throw new Error('Not implemented');
  }

  unregister(name: string): void {
    throw new Error('Not implemented');
  }

  has(name: string): boolean {
    throw new Error('Not implemented');
  }

  get(name: string): ICommand | null {
    throw new Error('Not implemented');
  }

  getAll(): ICommand[] {
    throw new Error('Not implemented');
  }

  async execute(input: string, context: CommandContext): Promise<CommandResult> {
    throw new Error('Not implemented');
  }

  parse(input: string): ParsedCommand {
    throw new Error('Not implemented');
  }

  search(query: string): ICommand[] {
    throw new Error('Not implemented');
  }
}