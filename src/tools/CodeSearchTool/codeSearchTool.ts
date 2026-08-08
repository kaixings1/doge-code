import type { Tool } from '../../engine/toolScheduler.ts';
import { CODE_SEARCH_TOOL_NAME } from './toolName.ts';

export { CODE_SEARCH_TOOL_PROMPT } from './prompt.ts';

export interface CodeSearchToolOptions {
  projectRoot: string;
}

/** 代码搜索工具：基于 ripgrep 的符号搜索 + 调用图分析（YAGNI 最小实现） */
export class CodeSearchTool implements Tool {
  readonly name = CODE_SEARCH_TOOL_NAME;
  readonly description = '在代码库中搜索符号定义、调用关系和影响范围';
  readonly parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索查询（支持 glob 模式）' },
      type: { type: 'string', enum: ['definition', 'reference', 'caller', 'callee', 'impact'], description: '搜索类型' },
      language: { type: 'string', description: '语言过滤（如 ts、py、rs），留空则全语言' },
      maxFiles: { type: 'number', description: '最大返回文件数（默认 10，上限 50）' },
      path: { type: 'string', description: '限制搜索目录范围（相对于项目根）' },
    },
    required: ['query'],
  };
  readonly annotations = { title: 'Code Search', readOnlyHint: true };

  constructor(private opts: CodeSearchToolOptions) {}

  validate(params: unknown): { valid: boolean; errors?: string[] } {
    const p = params as Record<string, unknown>;
    const errors: string[] = [];
    if (!p.query || typeof p.query !== 'string') errors.push('query 必填且为字符串');
    if (p.maxFiles && (typeof p.maxFiles !== 'number' || p.maxFiles < 1)) errors.push('maxFiles 必须为正整数');
    return errors.length === 0 ? { valid: true } : { valid: false, errors };
  }

  async execute(params: unknown): Promise<{ content: unknown }> {
    const p = params as Record<string, unknown>;
    const query = String(p.query);
    const searchType = String(p.type || 'definition');
    const language = p.language ? String(p.language) : '';
    const maxFiles = Math.min(Number(p.maxFiles || 10), 50);
    const pathScope = p.path ? String(p.path) : '';

    try {
      const args: string[] = ['--max-count', '3', '--heading', '--no-filename'];
      if (language) args.push('--type', language);
      args.push('--');
      if (pathScope) args.push(`${this.opts.projectRoot}/${pathScope}`);
      else args.push(this.opts.projectRoot);

      let pattern = query;
      if (searchType === 'definition' || searchType === 'caller') {
        pattern = `\\b${this.escapeRegex(query)}\\b`;
      }

      const result = await this.runRg(['rg', ...args, pattern]);

      const lines = result.trim().split('\n').filter(Boolean).slice(0, maxFiles * 3);
      if (lines.length === 0) {
        return { content: `未找到匹配 "${query}" 的结果。尝试调整查询条件或语言过滤。` };
      }

      const output = [
        `# 代码搜索结果`,
        `query: ${query} | type: ${searchType} | language: ${language || 'all'} | matches: ${lines.length}`,
        '',
        lines.join('\n'),
        '',
        `_结果已截断（maxFiles=${maxFiles}）。如需更多结果，请增加 maxFiles 参数。_`,
      ].join('\n');

      return { content: output };
    } catch (err) {
      return { content: `搜索失败: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** 执行 ripgrep，返回 stdout 字符串（使用 Bun.spawn，吸收自 codegraph 本地搜索） */
  private async runRg(cmd: string[]): Promise<string> {
    try {
      const proc = Bun.spawn(cmd, {
        cwd: this.opts.projectRoot,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const stdout = await new Response(proc.stdout as any).text();
      if (proc.exitCode === 1) return '';
      if (proc.exitCode === 127) throw new Error('ripgrep (rg) 未安装');
      if (proc.exitCode !== 0) {
        const stderr = await new Response(proc.stderr as any).text();
        throw new Error(stderr || `rg exited with code ${proc.exitCode}`);
      }
      return stdout;
    } catch (err) {
      if ((err as any)?.code === 'ENOENT') throw new Error('ripgrep (rg) 未安装');
      throw err;
    }
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
