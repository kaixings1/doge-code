import { describe, it, expect } from 'vitest';
import { parseCcshareId } from '../../utils/ccshareResume.js';

describe('parseCcshareId', () => {
  it('从 URL 路径提取 ID', () => {
    expect(parseCcshareId('https://go/ccshare/boris-20260311-211036')).toBe('boris-20260311-211036');
  });

  it('裸 ID 原样返回', () => {
    expect(parseCcshareId('boris-20260311-211036')).toBe('boris-20260311-211036');
  });

  it('从查询参数提取 ID', () => {
    expect(parseCcshareId('https://example.com/ccshare?id=abc-123')).toBe('abc-123');
  });

  it('ccshare: 前缀形式', () => {
    expect(parseCcshareId('ccshare:my-session-20260101')).toBe('my-session-20260101');
  });

  it('空输入返回 null', () => {
    expect(parseCcshareId('')).toBeNull();
    expect(parseCcshareId('   ')).toBeNull();
    expect(parseCcshareId(null as unknown as string)).toBeNull();
  });

  it('过短的 ID 返回 null', () => {
    expect(parseCcshareId('abc')).toBeNull();
  });
});
