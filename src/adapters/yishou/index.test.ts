/**
 * 一手平台适配器 - 库存状态判断逻辑测试
 */

import { describe, it, expect } from 'vitest';
import { isInStock, getStockMessage, mapToStockResult, isCollectionItemInStock, getCollectionItemMessage, mapCollectionItemToResult } from './index';
import { YishouGoodsData, YishouCollectionGoodsData } from '../../types';

// 创建测试用的商品数据工厂函数
const createMockGoodsData = (overrides: Partial<YishouGoodsData> = {}): YishouGoodsData => ({
  goods_id: '123456',
  goods_no: 'GN001',
  goods_name: '测试商品',
  shop_price: '99.00',
  goods_thumb: 'https://example.com/image.jpg',
  goods_status: '1',
  is_on_sale: '1',
  is_stockout: '0',
  buy_status: '1',
  color: '红色',
  size: 'M',
  remind_off_sale: '',
  ...overrides,
});

describe('isInStock - 库存状态判断', () => {
  it('当所有状态正常时，应返回 true（有货）', () => {
    const data = createMockGoodsData();
    expect(isInStock(data)).toBe(true);
  });

  it('当 is_stockout 为 "1" 时，应返回 false（缺货）', () => {
    const data = createMockGoodsData({ is_stockout: '1' });
    expect(isInStock(data)).toBe(false);
  });

  it('当 buy_status 为 "2" 时，应返回 false（已售罄）', () => {
    const data = createMockGoodsData({ buy_status: '2' });
    expect(isInStock(data)).toBe(false);
  });

  it('当 buy_status 为 "3" 时，应返回 false（已下架）', () => {
    const data = createMockGoodsData({ buy_status: '3' });
    expect(isInStock(data)).toBe(false);
  });

  it('当 is_on_sale 为 "0" 时，应返回 false（停售）', () => {
    const data = createMockGoodsData({ is_on_sale: '0' });
    expect(isInStock(data)).toBe(false);
  });

  it('当 goods_status 为 "2" 时，应返回 false（下架）', () => {
    const data = createMockGoodsData({ goods_status: '2' });
    expect(isInStock(data)).toBe(false);
  });
});

describe('getStockMessage - 库存状态描述', () => {
  it('当有货时，应返回"商品有货，可以购买"', () => {
    const data = createMockGoodsData();
    expect(getStockMessage(data, true)).toBe('商品有货，可以购买');
  });

  it('当缺货时，应返回"商品暂时缺货"', () => {
    const data = createMockGoodsData({ is_stockout: '1' });
    expect(getStockMessage(data, false)).toBe('商品暂时缺货');
  });

  it('当售罄时，应返回"商品已售罄"', () => {
    const data = createMockGoodsData({ buy_status: '2' });
    expect(getStockMessage(data, false)).toBe('商品已售罄');
  });

  it('当下架时，应返回下架提示信息', () => {
    const data = createMockGoodsData({ 
      buy_status: '3', 
      remind_off_sale: '该商品已经下架，无法购买' 
    });
    expect(getStockMessage(data, false)).toBe('该商品已经下架，无法购买');
  });

  it('当下架且无提示信息时，应返回默认下架信息', () => {
    const data = createMockGoodsData({ buy_status: '3', remind_off_sale: '' });
    expect(getStockMessage(data, false)).toBe('商品已下架');
  });

  it('当停售时，应返回"商品已停售"', () => {
    const data = createMockGoodsData({ is_on_sale: '0' });
    expect(getStockMessage(data, false)).toBe('商品已停售');
  });
});

describe('mapToStockResult - 数据转换', () => {
  it('应正确转换商品数据为库存查询结果', () => {
    const data = createMockGoodsData();
    const result = mapToStockResult(data);

    expect(result).toEqual({
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
    });
  });

  it('当只有颜色时，sku 应只包含颜色', () => {
    const data = createMockGoodsData({ color: '蓝色', size: '' });
    const result = mapToStockResult(data);
    expect(result.sku).toBe('蓝色');
  });

  it('当只有尺码时，sku 应只包含尺码', () => {
    const data = createMockGoodsData({ color: '', size: 'L' });
    const result = mapToStockResult(data);
    expect(result.sku).toBe('L');
  });

  it('当颜色和尺码都为空时，sku 应为 undefined', () => {
    const data = createMockGoodsData({ color: '', size: '' });
    const result = mapToStockResult(data);
    expect(result.sku).toBeUndefined();
  });

  it('当价格为无效字符串时，应返回 0', () => {
    const data = createMockGoodsData({ shop_price: 'invalid' });
    const result = mapToStockResult(data);
    expect(result.price).toBe(0);
  });

  it('当商品无货时，inStock 应为 false', () => {
    const data = createMockGoodsData({ is_stockout: '1' });
    const result = mapToStockResult(data);
    expect(result.inStock).toBe(false);
    expect(result.message).toBe('商品暂时缺货');
  });
});

// ==================== 收藏夹商品测试 ====================

// 创建测试用的收藏夹商品数据工厂函数
const createMockCollectionData = (overrides: Partial<YishouCollectionGoodsData> = {}): YishouCollectionGoodsData => ({
  goods_id: '269438110',
  goods_no: '1355102034',
  goods_name: '测试收藏商品',
  brand_name: '测试品牌',
  shop_price: '417.23',
  goods_thumb: 'https://example.com/thumb.jpg',
  goods_img: 'https://example.com/img.jpg',
  goods_status: '1',
  is_on_sale: '1',
  is_stockout: '0',
  is_replenish: '2',
  collect_id: '352571190',
  one_market_name: '广州沙河',
  sales_of_7: 22,
  video_url: '',
  ...overrides,
});

describe('isCollectionItemInStock - 收藏夹商品库存状态判断', () => {
  it('当所有状态正常时，应返回 true（有货）', () => {
    const data = createMockCollectionData();
    expect(isCollectionItemInStock(data)).toBe(true);
  });

  it('当 is_stockout 为 "1" 时，应返回 false（缺货）', () => {
    const data = createMockCollectionData({ is_stockout: '1' });
    expect(isCollectionItemInStock(data)).toBe(false);
  });

  it('当 is_on_sale 为 "0" 时，应返回 false（停售）', () => {
    const data = createMockCollectionData({ is_on_sale: '0' });
    expect(isCollectionItemInStock(data)).toBe(false);
  });

  it('当 goods_status 为 "2" 时，应返回 false（下架）', () => {
    const data = createMockCollectionData({ goods_status: '2' });
    expect(isCollectionItemInStock(data)).toBe(false);
  });
});

describe('getCollectionItemMessage - 收藏夹商品状态描述', () => {
  it('当有货时，应返回"商品有货，可以购买"', () => {
    const data = createMockCollectionData();
    expect(getCollectionItemMessage(data, true)).toBe('商品有货，可以购买');
  });

  it('当缺货且未补货时，应返回"商品暂时缺货"', () => {
    const data = createMockCollectionData({ is_stockout: '1', is_replenish: '2' });
    expect(getCollectionItemMessage(data, false)).toBe('商品暂时缺货');
  });

  it('当缺货且补货中时，应返回"商品缺货补货中"', () => {
    const data = createMockCollectionData({ is_stockout: '1', is_replenish: '1' });
    expect(getCollectionItemMessage(data, false)).toBe('商品缺货补货中');
  });

  it('当下架时，应返回"商品已下架"', () => {
    const data = createMockCollectionData({ goods_status: '2' });
    expect(getCollectionItemMessage(data, false)).toBe('商品已下架');
  });

  it('当停售时，应返回"商品已停售"', () => {
    const data = createMockCollectionData({ is_on_sale: '0' });
    expect(getCollectionItemMessage(data, false)).toBe('商品已停售');
  });
});

describe('mapCollectionItemToResult - 收藏夹商品数据转换', () => {
  it('应正确转换收藏夹商品数据为库存查询结果', () => {
    const data = createMockCollectionData();
    const result = mapCollectionItemToResult(data);

    expect(result).toEqual({
      platform: 'yishou',
      productId: '269438110',
      productName: '测试收藏商品',
      brandName: '测试品牌',
      productNo: '1355102034',
      inStock: true,
      price: 417.23,
      productUrl: 'https://www.yishouapp.com/goods/269438110',
      productImage: 'https://example.com/img.jpg',
      marketName: '广州沙河',
      salesOf7: 22,
      message: '商品有货，可以购买',
      collectId: '352571190',
    });
  });

  it('当 goods_img 为空时，应使用 goods_thumb', () => {
    const data = createMockCollectionData({ goods_img: '' });
    const result = mapCollectionItemToResult(data);
    expect(result.productImage).toBe('https://example.com/thumb.jpg');
  });

  it('当价格为无效字符串时，应返回 0', () => {
    const data = createMockCollectionData({ shop_price: 'invalid' });
    const result = mapCollectionItemToResult(data);
    expect(result.price).toBe(0);
  });

  it('当 sales_of_7 为 undefined 时，应返回 0', () => {
    const data = createMockCollectionData({ sales_of_7: undefined as unknown as number });
    const result = mapCollectionItemToResult(data);
    expect(result.salesOf7).toBe(0);
  });

  it('当商品无货时，inStock 应为 false', () => {
    const data = createMockCollectionData({ is_stockout: '1' });
    const result = mapCollectionItemToResult(data);
    expect(result.inStock).toBe(false);
    expect(result.message).toBe('商品暂时缺货');
  });
});
