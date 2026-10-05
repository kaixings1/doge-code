import { describe, it, expect } from 'vitest';
import { buildFollowCommand } from '../../components/TerminalPanel/TerminalPanelView';

describe('buildFollowCommand', () => {
  it('空路径或纯空白返回 null', () => {
    expect(buildFollowCommand(null)).toBeNull();
    expect(buildFollowCommand('')).toBeNull();
    expect(buildFollowCommand('   ')).toBeNull();
  });

  it('win32 必须显式指定 -Encoding utf8（否则默认 ANSI 会把 UTF-8 中文读成乱码）', () => {
    const cmd = buildFollowCommand('./f.txt', 'win32');
    expect(cmd).not.toBeNull();
    const command = cmd![cmd!.length - 1];
    // 防回归：缺了 -Encoding utf8，日志面板的中文会变「绔偣鏉ユ簮」这类乱码
    expect(command).toContain('-Encoding utf8');
    expect(command).toContain('Get-Content');
    expect(command).toContain('-Wait');
    expect(command).toContain('-Tail 50');
  });

  it('win32 对含单引号的路径做双写转义，避免提前闭合字符串造成注入', () => {
    const cmd = buildFollowCommand("C:\\a'.log", 'win32');
    const command = cmd![cmd!.length - 1];
    // 单引号必须变 ''（PowerShell 字符串转义），否则 ' 会闭合引号
    expect(command).toContain("'C:\\a''.log'");
  });

  it('非 win32 走 tail，且路径以 argv 传参（shell 解析不了注入）', () => {
    const cmd = buildFollowCommand('/var/log/app.log', 'linux');
    expect(cmd).toEqual(['tail', '-n', '50', '-f', '/var/log/app.log']);
  });
});
