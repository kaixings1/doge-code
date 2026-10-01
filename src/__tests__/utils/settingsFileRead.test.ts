import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseSettingsFile } from '../../utils/settings/settings.js';
import { resetSettingsCache } from '../../utils/settings/settingsCache.js';

/**
 * 回归测试：settings.ts 曾缺失 readFileSync 的 import。
 *
 * 症状（修复前）：Bun 下 globalThis.readFileSync 为 undefined，调用抛 TypeError
 * 并被 parseSettingsFileUncached 的 catch 吞掉，导致：
 *   返回 { settings: null, errors: [] }
 * 即所有配置文件读取静默失效（env、hooks、permissions、模型配置）。
 *
 * 关键识别特征：errors 为空数组 —— schema 校验失败会填充 errors，
 * 空 errors + null settings 只可能是异常分支。
 */
describe('parseSettingsFile 读取配置文件', () => {
  let tmpDir: string;
  let file: string;

  beforeEach(() => {
    resetSettingsCache();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doge-settings-'));
    file = path.join(tmpDir, 'settings.json');
  });

  afterEach(() => {
    resetSettingsCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('能读取含 env 字段的有效配置（根因回归）', () => {
    const payload = { env: { CLAUDE_CODE_PROBE: 'probe-value' } };
    fs.writeFileSync(file, JSON.stringify(payload), 'utf8');

    const result = parseSettingsFile(file);

    // 修复前此处为 null —— 正是缺 import 导致的静默失败
    expect(result.settings).toEqual(payload);
    expect(result.errors).toEqual([]);
  });

  it('能读取含多层嵌套的配置', () => {
    const payload = {
      model: 'sonnet',
      permissions: { allow: ['Bash(ls)'] },
      env: { A: '1', B: '2' },
    };
    fs.writeFileSync(file, JSON.stringify(payload), 'utf8');

    const result = parseSettingsFile(file);
    expect(result.settings).not.toBeNull();
    expect((result.settings as Record<string, unknown>).model).toBe('sonnet');
  });

  it('空文件返回空对象而非 null', () => {
    fs.writeFileSync(file, '', 'utf8');
    const result = parseSettingsFile(file);
    expect(result.settings).toEqual({});
  });

  it('JSON 语法错误时 settings 为 null（与读取失败区分）', () => {
    fs.writeFileSync(file, '{ broken json', 'utf8');
    const result = parseSettingsFile(file);
    // 语法错误路径：settings 为 null，但不应与"读取异常"混淆
    expect(result.settings).toBeNull();
  });

  it('文件不存在时返回 null 且不抛异常', () => {
    const result = parseSettingsFile(path.join(tmpDir, 'not-exist.json'));
    expect(result.settings).toBeNull();
  });
});
