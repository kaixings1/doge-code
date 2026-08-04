import { describe, it, expect } from 'vitest';
import { parseConnectUrl } from '../../server/parseConnectUrl.js';

describe('parseConnectUrl', () => {
  it('解析 cc:// URL（带 token）', () => {
    expect(parseConnectUrl('cc://localhost:8080?token=abc')).toEqual({
      serverUrl: 'http://localhost:8080',
      authToken: 'abc',
    });
  });

  it('解析 cc:// URL 带路径', () => {
    expect(parseConnectUrl('cc://host:1234/api?token=k')).toEqual({
      serverUrl: 'http://host:1234/api',
      authToken: 'k',
    });
  });

  it('解析 cc+unix:// URL', () => {
    expect(parseConnectUrl('cc+unix:///tmp/doge.sock?token=xyz')).toEqual({
      serverUrl: 'unix:/tmp/doge.sock',
      authToken: 'xyz',
    });
  });

  it('解析 http(s) URL', () => {
    expect(parseConnectUrl('https://example.com?token=t')).toEqual({
      serverUrl: 'https://example.com',
      authToken: 't',
    });
  });

  it('无 token 时返回空字符串', () => {
    expect(parseConnectUrl('cc://host:1')).toEqual({
      serverUrl: 'http://host:1',
      authToken: '',
    });
  });

  it('无法识别的输入原样返回', () => {
    expect(parseConnectUrl('random-input')).toEqual({
      serverUrl: 'random-input',
      authToken: '',
    });
  });
});
