/**
 * 适配器工厂测试
 */

import { describe, it, expect } from 'vitest';
import { getAdapter, getSupportedPlatforms } from './index';
import { StockCheckError, StockCheckErrorType } from '../types';
import { YishouAdapter } from './yishou';

describe('getAdapter - 适配器工厂', () => {
  it('应返回一手平台适配器实例', () => {
    const adapter = getAdapter('yishou', { uid: 'test', token: 'test' });
    expect(adapter).toBeInstanceOf(YishouAdapter);
    expect(adapter.platform).toBe('yishou');
  });

  it('当平台不支持时，应抛出 PLATFORM_NOT_SUPPORTED 错误', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getAdapter('jd' as any)).toThrow(StockCheckError);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getAdapter('jd' as any);
    } catch (error) {
      expect(error).toBeInstanceOf(StockCheckError);
      expect((error as StockCheckError).type).toBe(StockCheckErrorType.PLATFORM_NOT_SUPPORTED);
      expect((error as StockCheckError).message).toContain('jd');
      expect((error as StockCheckError).message).toContain('yishou');
    }
  });
});

describe('getSupportedPlatforms - 获取支持的平台', () => {
  it('应返回当前支持的平台列表', () => {
    const platforms = getSupportedPlatforms();
    expect(platforms).toContain('yishou');
    expect(Array.isArray(platforms)).toBe(true);
  });
});
