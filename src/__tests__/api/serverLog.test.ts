import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createServerLogger } from '../../server/serverLog.js';

describe('createServerLogger', () => {
  it('写文件时包含时间戳和级别', () => {
    const dir = mkdtempSync(join(tmpdir(), 'log-test-'));
    const file = join(dir, 'server.log');
    try {
      const logger = createServerLogger({ console: false, file });
      logger.info('hello world');
      const content = readFileSync(file, 'utf-8');
      expect(content).toContain('hello world');
      expect(content).toContain('[INFO]');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('级别过滤：低于阈值的级别不写入', () => {
    const dir = mkdtempSync(join(tmpdir(), 'log-test-'));
    const file = join(dir, 'server.log');
    try {
      const logger = createServerLogger({ console: false, file, level: 'warn' });
      logger.debug('debug-msg');
      logger.info('info-msg');
      logger.warn('warn-msg');
      logger.error('error-msg');
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain('debug-msg');
      expect(content).not.toContain('info-msg');
      expect(content).toContain('warn-msg');
      expect(content).toContain('error-msg');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('raw 写入原始行', () => {
    const dir = mkdtempSync(join(tmpdir(), 'log-test-'));
    const file = join(dir, 'server.log');
    try {
      const logger = createServerLogger({ console: false, file });
      logger.raw('RAW LINE');
      const content = readFileSync(file, 'utf-8');
      expect(content).toContain('RAW LINE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('console 输出模式不抛错', () => {
    const logger = createServerLogger({ console: true, file: undefined });
    expect(() => {
      logger.info('test');
      logger.error('test');
      logger.warn('test');
      logger.debug('test');
    }).not.toThrow();
  });
});
