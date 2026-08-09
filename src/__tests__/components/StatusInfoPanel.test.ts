import { describe, it, expect } from 'vitest';
import { formatBytes } from '../../components/LogoV2/StatusInfoPanel';

describe('StatusInfoPanel', () => {
  describe('formatBytes', () => {
    it('应该返回 0B 当字节数为 0', () => {
      expect(formatBytes(0)).toBe('0B');
    });

    it('应该正确格式化字节', () => {
      expect(formatBytes(500)).toBe('500B');
    });

    it('应该正确格式化 KB', () => {
      expect(formatBytes(1024)).toBe('1.000KB');
      expect(formatBytes(1536)).toBe('1.500KB');
    });

    it('应该正确格式化 MB', () => {
      expect(formatBytes(1048576)).toBe('1.000MB');
      expect(formatBytes(1572864)).toBe('1.500MB');
    });

    it('应该正确格式化 GB', () => {
      expect(formatBytes(1073741824)).toBe('1.000GB');
      expect(formatBytes(1610612736)).toBe('1.500GB');
    });
  });
});
