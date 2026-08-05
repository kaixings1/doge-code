import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { extractUpSection, extractCommands, findClaudeMd } from '../../cli/up.js';

describe('extractUpSection', () => {
  it('提取 # claude up 节到下一个标题', () => {
    const content = [
      '# 项目文档',
      '',
      '## claude up',
      'echo hello',
      'echo world',
      '',
      '## 其他',
      '内容',
    ].join('\n');
    const section = extractUpSection(content);
    expect(section).toContain('echo hello');
    expect(section).toContain('echo world');
    expect(section).not.toContain('内容');
  });

  it('支持 ### 级别标题', () => {
    const content = [
      '# Main',
      '### claude up',
      'npm install',
      '### Next Section',
      'ignored',
    ].join('\n');
    const section = extractUpSection(content);
    expect(section).toContain('npm install');
    expect(section).not.toContain('ignored');
  });

  it('没有 claude up 节返回 null', () => {
    const content = '# 只有文档\n没有 up 节';
    expect(extractUpSection(content)).toBeNull();
  });

  it('节末尾（文件末尾）也正确', () => {
    const content = '# claude up\n最后一行命令';
    const section = extractUpSection(content);
    expect(section).toContain('最后一行命令');
  });
});

describe('extractCommands', () => {
  it('提取 bash 代码块内的命令', () => {
    const section = [
      '```bash',
      'npm install',
      '# 注释行',
      'npm run build',
      '```',
    ].join('\n');
    expect(extractCommands(section)).toEqual(['npm install', 'npm run build']);
  });

  it('提取普通指令行（含 $ 前缀）', () => {
    const section = 'npm install\n$ npm test\n# 注释';
    expect(extractCommands(section)).toEqual(['npm install', 'npm test']);
  });

  it('空节返回空数组', () => {
    expect(extractCommands('')).toEqual([]);
    expect(extractCommands('# 只有注释')).toEqual([]);
  });

  it('支持 shell/sh 代码块语言标记', () => {
    const section = ['```sh', 'echo hi', '```'].join('\n');
    expect(extractCommands(section)).toEqual(['echo hi']);
  });
});

describe('findClaudeMd', () => {
  let dir: string;
  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('在当前目录找到 CLAUDE.md', () => {
    dir = mkdtempSync(join(tmpdir(), 'up-test-'));
    writeFileSync(join(dir, 'CLAUDE.md'), '# test', 'utf-8');
    expect(findClaudeMd(dir)).toBe(join(dir, 'CLAUDE.md'));
  });

  it('优先 CLAUDE.local.md', () => {
    dir = mkdtempSync(join(tmpdir(), 'up-test-'));
    writeFileSync(join(dir, 'CLAUDE.md'), '# test', 'utf-8');
    writeFileSync(join(dir, 'CLAUDE.local.md'), '# local', 'utf-8');
    expect(findClaudeMd(dir)).toBe(join(dir, 'CLAUDE.local.md'));
  });

  it('向父目录查找', () => {
    dir = mkdtempSync(join(tmpdir(), 'up-test-'));
    writeFileSync(join(dir, 'CLAUDE.md'), '# test', 'utf-8');
    const sub = join(dir, 'sub', 'deep');
    expect(findClaudeMd(sub)).toBe(join(dir, 'CLAUDE.md'));
  });

  it('找不到返回 null', () => {
    dir = mkdtempSync(join(tmpdir(), 'up-test-'));
    expect(findClaudeMd(dir)).toBeNull();
  });
});
