import { describe, it, expect } from 'vitest';
import { formatBytes } from '../../components/LogoV2/StatusInfoPanel';

describe('StatusInfoPanel syntax', () => {
  it('组件模块可正常加载（含 useEffect/useState 自刷新逻辑）', () => {
    expect(typeof formatBytes).toBe('function');
    expect(formatBytes(2048)).toBe('2.000KB');
  });
});
