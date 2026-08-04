import { describe, it, expect } from 'vitest';

describe('示例测试套件', () => {
  it('基础数学运算', () => {
    expect(1 + 1).toBe(2);
    expect(2 * 3).toBe(6);
  });

  it('字符串操作', () => {
    expect('hello'.toUpperCase()).toBe('HELLO');
    expect('doge-code').toContain('doge');
  });

  it('数组操作', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
    expect(arr.map((x) => x * 2)).toEqual([2, 4, 6]);
  });
});
