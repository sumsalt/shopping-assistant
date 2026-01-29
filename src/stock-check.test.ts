/**
 * 库存查询主函数测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkStock } from './stock-check';
import { StockCheckError, StockCheckErrorType } from './types';

// Mock 适配器模块
vi.mock('./adapters', () => {
  const mockCheckStock = vi.fn();
  const mockCheckCollectionStock = vi.fn();
  const mockGetProductSkus = vi.fn();
  return {
    getAdapter: vi.fn(() => ({
      platform: 'yishou',
      checkStock: mockCheckStock,
      checkCollectionStock: mockCheckCollectionStock,
      getProductSkus: mockGetProductSkus,
    })),
    getSupportedPlatforms: vi.fn(() => ['yishou']),
  };
});

describe('checkStock - 库存查询主函数', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('缺少 platform 参数时，应抛出错误', async () => {
    await expect(
      checkStock({ platform: '' as any, productId: '123' })
    ).rejects.toThrow('缺少必要参数: platform');
  });

  it('缺少 productId 参数时，应抛出错误', async () => {
    await expect(
      checkStock({ platform: 'yishou', productId: '' })
    ).rejects.toThrow('缺少必要参数: productId');
  });

  it('应正确调用适配器并返回结果', async () => {
    const { getAdapter } = await import('./adapters');
    const mockAdapter = {
      platform: 'yishou' as const,
      checkStock: vi.fn().mockResolvedValue({
        platform: 'yishou',
        productId: '123456',
        productName: '测试商品',
        productNo: 'GN001',
        inStock: true,
        price: 99,
        productUrl: 'https://www.yishouapp.com/goods/123456',
        productImage: 'https://example.com/image.jpg',
        message: '商品有货，可以购买',
      }),
      checkCollectionStock: vi.fn(),
      getProductSkus: vi.fn(),
    };
    
    vi.mocked(getAdapter).mockReturnValue(mockAdapter);

    const result = await checkStock(
      { platform: 'yishou', productId: '123456' },
      { adapterConfig: { uid: 'test', token: 'test' } }
    );

    expect(getAdapter).toHaveBeenCalledWith('yishou', { uid: 'test', token: 'test' });
    expect(mockAdapter.checkStock).toHaveBeenCalledWith('123456', undefined);
    expect(result.inStock).toBe(true);
  });

  it('应正确传递 sku 参数', async () => {
    const { getAdapter } = await import('./adapters');
    const mockAdapter = {
      platform: 'yishou' as const,
      checkStock: vi.fn().mockResolvedValue({
        platform: 'yishou',
        productId: '123456',
        productName: '测试商品',
        productNo: 'GN001',
        sku: '红色 / M',
        inStock: true,
        price: 99,
        productUrl: 'https://www.yishouapp.com/goods/123456',
        productImage: 'https://example.com/image.jpg',
        message: '商品有货，可以购买',
      }),
      checkCollectionStock: vi.fn(),
      getProductSkus: vi.fn(),
    };
    
    vi.mocked(getAdapter).mockReturnValue(mockAdapter);

    await checkStock(
      { platform: 'yishou', productId: '123456', sku: '红色 / M' },
      { adapterConfig: { uid: 'test', token: 'test' } }
    );

    expect(mockAdapter.checkStock).toHaveBeenCalledWith('123456', '红色 / M');
  });
});
