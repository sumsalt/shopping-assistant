/**
 * 关键词搜索分流与响应映射测试
 */

import { describe, it, expect } from 'vitest';
import { isNumericProductQuery } from './utils/product-query';
import { mapKeywordSearchResult, type YishouKeywordSearchData } from './adapters/yishou/mappers';

describe('isNumericProductQuery - 库存查询页搜索分流', () => {
  it('单个纯数字（含首尾空格）走原有库存查询', () => {
    expect(isNumericProductQuery('1379202997')).toBe(true);
    expect(isNumericProductQuery('340210132')).toBe(true);
    expect(isNumericProductQuery(' 1379202997 ')).toBe(true);
  });

  it('多个 ID（半角 / 全角逗号）不再走库存查询', () => {
    expect(isNumericProductQuery('1379202997,1379200621')).toBe(false);
    expect(isNumericProductQuery('1379202997， 1379200621')).toBe(false);
  });

  it('含文字 / 符号 / 混合输入 / 空串走关键词搜索', () => {
    expect(isNumericProductQuery('闲觉 邻居淑女')).toBe(false);
    expect(isNumericProductQuery('毛衣')).toBe(false);
    expect(isNumericProductQuery('823256#')).toBe(false);
    expect(isNumericProductQuery('1379202997 红色')).toBe(false);
    expect(isNumericProductQuery('1379202997,毛衣')).toBe(false);
    expect(isNumericProductQuery('')).toBe(false);
    expect(isNumericProductQuery('   ')).toBe(false);
    expect(isNumericProductQuery(',,,')).toBe(false);
  });
});

describe('mapKeywordSearchResult - 搜索响应映射', () => {
  const raw: YishouKeywordSearchData = {
    goods_list: [
      {
        goods_id: '340142590',
        goods_no: '1379200621',
        goods_name: '【闲觉】毛衣 823256#',
        goods_img: 'https://img.example.com/a.webp',
        brand_name: '闲觉XIANJUE',
        cat_name: '毛衣',
        shop_price: '??.??',
        sales: '104',
        is_on_sale: '1',
      },
      {
        goods_id: '340210132',
        goods_no: '1379202997',
        goods_name: '另一件商品',
        goods_thumb: 'https://img.example.com/b.webp',
        shop_price: '178.99',
        is_on_sale: '0',
      },
    ],
    page_total: '539',
    totals: '21538',
  };

  it('隐藏价格 "??.??" 归一成无 price，真实价格保留', () => {
    const result = mapKeywordSearchResult(raw, '闲觉', 1);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].price).toBeUndefined();
    expect(result.items[1].price).toBe(178.99);

    expect(result.items[0].productNo).toBe('1379200621');
    expect(result.items[0].name).toContain('闲觉');
    expect(result.items[0].image).toContain('a.webp');
    expect(result.items[0].brandName).toBe('闲觉XIANJUE');
    expect(result.items[0].sales).toBe(104);
    expect(result.items[0].onSale).toBe(true);
    // 无 goods_img 时回退 goods_thumb
    expect(result.items[1].image).toContain('b.webp');
    expect(result.items[1].onSale).toBe(false);
  });

  it('页码 / 总数解析，空响应不炸', () => {
    const result = mapKeywordSearchResult(raw, '闲觉', 2);
    expect(result.keyword).toBe('闲觉');
    expect(result.page).toBe(2);
    expect(result.pageTotal).toBe(539);
    expect(result.totals).toBe(21538);

    const empty = mapKeywordSearchResult(undefined, '无结果', 1);
    expect(empty.items).toEqual([]);
    expect(empty.pageTotal).toBe(0);
    expect(empty.totals).toBe(0);

    const badCounts = mapKeywordSearchResult(
      { goods_list: [], page_total: '', totals: 'abc' },
      'x',
      1
    );
    expect(badCounts.pageTotal).toBe(0);
    expect(badCounts.totals).toBe(0);
  });
});
