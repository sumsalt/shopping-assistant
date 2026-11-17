/**
 * 一手平台适配器 - 库存状态判断逻辑测试
 */

import { describe, it, expect } from 'vitest';
import { isInStock, getStockMessage, mapToStockResult, isCollectionItemInStock, getCollectionItemMessage, mapCollectionItemToResult, mapGoodsToSkuResult, mapToPriceSnapshot, mapTabItemToResult } from './index';
import type { YishouGoodsData, YishouCollectionGoodsData } from '../../types';

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

  it('当 is_on_sale 为 "0" 时，应返回 false（停售）', () => {
    const data = createMockGoodsData({ is_on_sale: '0' });
    expect(isInStock(data)).toBe(false);
  });

  it('当 goods_status 为 "2" 时，应返回 false（下架）', () => {
    const data = createMockGoodsData({ goods_status: '2' });
    expect(isInStock(data)).toBe(false);
  });
});

describe('mapToPriceSnapshot - 价格快照同时带出库存状态', () => {
  it('有货时 inStock 为 true，文案说明可购买', () => {
    const snapshot = mapToPriceSnapshot(createMockGoodsData());
    expect(snapshot.inStock).toBe(true);
    expect(snapshot.stockMessage).toBe('商品有货，可以购买');
    expect(snapshot.shopPrice).toBe(99);
  });

  it('缺货时 inStock 为 false，文案说明原因', () => {
    const snapshot = mapToPriceSnapshot(createMockGoodsData({ is_stockout: '1' }));
    expect(snapshot.inStock).toBe(false);
    expect(snapshot.stockMessage).toBe('商品暂时缺货');
  });

  it('下架时 inStock 为 false，文案取 remind_off_sale', () => {
    const snapshot = mapToPriceSnapshot(
      createMockGoodsData({ goods_status: '2', remind_off_sale: '已下架，不再补货' })
    );
    expect(snapshot.inStock).toBe(false);
    expect(snapshot.stockMessage).toContain('下架');
  });
});

describe('getStockMessage - 库存状态描述', () => {  it('当有货时，应返回"商品有货，可以购买"', () => {
    const data = createMockGoodsData();
    expect(getStockMessage(data, true)).toBe('商品有货，可以购买');
  });

  it('当缺货时，应返回"商品暂时缺货"', () => {
    const data = createMockGoodsData({ is_stockout: '1' });
    expect(getStockMessage(data, false)).toBe('商品暂时缺货');
  });

  it('当下架时，应返回下架提示信息', () => {
    const data = createMockGoodsData({
      goods_status: '2',
      remind_off_sale: '该商品已经下架，无法购买',
    });
    expect(getStockMessage(data, false)).toBe('该商品已经下架，无法购买');
  });

  it('当下架且无提示信息时，应返回默认下架信息', () => {
    const data = createMockGoodsData({ goods_status: '2', remind_off_sale: '' });
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

  it('匿名查询 shop_price 降级为 ??.?? 时，应回退单独购买价并标注游客参考价', () => {
    const data = createMockGoodsData({ shop_price: '??.??', alone_price: '108.99' });
    const result = mapToStockResult(data);
    expect(result.price).toBe(108.99);
    expect(result.priceNote).toBe('游客参考价');
  });

  it('登录态 shop_price 有效时不回退，且不标注游客参考价', () => {
    const data = createMockGoodsData({ shop_price: '108.99', alone_price: '128.00' });
    const result = mapToStockResult(data);
    expect(result.price).toBe(108.99);
    expect(result.priceNote).toBeUndefined();
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

// ==================== SKU 数据转换测试 ====================

// 创建测试用的商品详情数据工厂函数
const createMockSkuGoodsData = (overrides: Partial<YishouGoodsData> = {}): YishouGoodsData => ({
  goods_id: '269437752',
  goods_no: '1348205483',
  goods_name: '测试商品详情',
  shop_price: '62.04',
  goods_thumb: 'https://example.com/thumb.jpg',
  sales: '22',
  color: '黑色、白色',
  size: 'S/M、L/XL',
  goods_status: '1',
  is_on_sale: '1',
  is_stockout: '0',
  remind_off_sale: '',
  restriction_number: -1,
  attribute: [
    {
      color: '黑色',
      color_id: '1017',
      color_card: 'https://example.com/black.jpg',
      card_thumb: 'https://example.com/black_thumb.jpg',
      is_recommend: '2',
      item: [
        {
          size: 'S/M',
          sku: '74762763',
          stock: '998',
          sale_stock: '998',
          sort: '2',
          sku_tag: '',
          is_show_stock: '0',
          is_stock_now: '0',
        },
        {
          size: 'L/XL',
          sku: '74762764',
          stock: '997',
          sale_stock: '997',
          sort: '1',
          sku_tag: '',
          is_show_stock: '0',
          is_stock_now: '0',
        },
      ],
    },
    {
      color: '白色',
      color_id: '2350',
      color_card: 'https://example.com/white.jpg',
      card_thumb: 'https://example.com/white_thumb.jpg',
      is_recommend: '2',
      item: [
        {
          size: 'S/M',
          sku: '74762765',
          stock: '997',
          sale_stock: '0',
          sort: '2',
          sku_tag: '',
          is_show_stock: '0',
          is_stock_now: '0',
        },
        {
          size: 'L/XL',
          sku: '74762766',
          stock: '997',
          sale_stock: '500',
          sort: '1',
          sku_tag: '',
          is_show_stock: '0',
          is_stock_now: '0',
        },
      ],
    },
  ],
  ...overrides,
});

describe('mapGoodsToSkuResult - SKU 数据转换', () => {
  it('应正确转换商品详情数据为 SKU 查询结果', () => {
    const data = createMockSkuGoodsData();
    const result = mapGoodsToSkuResult(data);

    expect(result.platform).toBe('yishou');
    expect(result.productId).toBe('269437752');
    expect(result.productName).toBe('测试商品详情');
    expect(result.productNo).toBe('1348205483');
    expect(result.price).toBe(62.04);
    expect(result.sales).toBe(22);
    expect(result.restrictionNumber).toBe(-1);
  });

  it('应正确提取所有颜色', () => {
    const data = createMockSkuGoodsData();
    const result = mapGoodsToSkuResult(data);

    expect(result.colors).toEqual(['黑色', '白色']);
  });

  it('应正确提取所有尺码（去重）', () => {
    const data = createMockSkuGoodsData();
    const result = mapGoodsToSkuResult(data);

    expect(result.sizes).toContain('S/M');
    expect(result.sizes).toContain('L/XL');
    expect(result.sizes.length).toBe(2);
  });

  it('应正确生成 SKU 列表', () => {
    const data = createMockSkuGoodsData();
    const result = mapGoodsToSkuResult(data);

    expect(result.skuList.length).toBe(4);
    expect(result.totalSkuCount).toBe(4);
  });

  it('应正确判断 SKU 是否有货', () => {
    const data = createMockSkuGoodsData();
    const result = mapGoodsToSkuResult(data);

    // 黑色 S/M 有货（saleStock: 998）
    const blackSM = result.skuList.find(sku => sku.color === '黑色' && sku.size === 'S/M');
    expect(blackSM?.inStock).toBe(true);
    expect(blackSM?.saleStock).toBe(998);

    // 白色 S/M 无货（saleStock: 0）
    const whiteSM = result.skuList.find(sku => sku.color === '白色' && sku.size === 'S/M');
    expect(whiteSM?.inStock).toBe(false);
    expect(whiteSM?.saleStock).toBe(0);
  });

  it('应正确计算有货 SKU 数量', () => {
    const data = createMockSkuGoodsData();
    const result = mapGoodsToSkuResult(data);

    // 黑色 S/M(998) + 黑色 L/XL(997) + 白色 L/XL(500) = 3 个有货
    expect(result.inStockSkuCount).toBe(3);
  });

  it('当 attribute 为空时，应返回空的 SKU 列表', () => {
    const data = createMockSkuGoodsData({ attribute: [] });
    const result = mapGoodsToSkuResult(data);

    expect(result.skuList).toEqual([]);
    expect(result.colors).toEqual([]);
    expect(result.sizes).toEqual([]);
    expect(result.totalSkuCount).toBe(0);
    expect(result.inStockSkuCount).toBe(0);
  });

  it('当价格为无效字符串时，应返回 0', () => {
    const data = createMockSkuGoodsData({ shop_price: 'invalid' });
    const result = mapGoodsToSkuResult(data);
    expect(result.price).toBe(0);
  });

  it('当销量为无效字符串时，应返回 0', () => {
    const data = createMockSkuGoodsData({ sales: 'invalid' });
    const result = mapGoodsToSkuResult(data);
    expect(result.sales).toBe(0);
  });

  it('SKU 应包含正确的颜色图片', () => {
    const data = createMockSkuGoodsData();
    const result = mapGoodsToSkuResult(data);

    const blackSku = result.skuList.find(sku => sku.color === '黑色');
    expect(blackSku?.colorImage).toBe('https://example.com/black_thumb.jpg');
  });
});

describe('收藏状态透传（一手 collect_id）', () => {
  it('库存结果带出 collectId，可直接用于判断是否已收藏', () => {
    expect(mapToStockResult(createMockGoodsData({ collect_id: '374805600' })).collectId).toBe('374805600');
    expect(mapToStockResult(createMockGoodsData({ collect_id: '0' })).collectId).toBe('0');
  });

  it('接口没返回 collect_id 时不带字段，避免把「未知」误判成未收藏', () => {
    expect('collectId' in mapToStockResult(createMockGoodsData())).toBe(false);
    expect('collectId' in mapToStockResult(createMockGoodsData({ collect_id: '' }))).toBe(false);
  });

  it('标签列表按响应原样带出 collect_id（0 表示未收藏）', () => {
    const base = {
      goods_id: '340219457',
      goods_no: '1381206701',
      goods_name: '测试商品',
      brand_name: '测试店铺',
      shop_price: '43.80',
      goods_thumb: '',
      goods_img: 'https://example.com/a.jpg',
      goods_status: '1',
      is_on_sale: '1',
      is_stockout: '0',
      is_replenish: '2',
      goods_kh: '',
      market_id: '',
      market_one_id: '',
      one_market_name: '',
      sales_of_7: 1,
      video_url: '',
      is_new: '0',
    } as unknown as Parameters<typeof mapTabItemToResult>[0];

    expect(mapTabItemToResult({ ...base, collect_id: '374805600' }).collectId).toBe('374805600');
    expect(mapTabItemToResult({ ...base, collect_id: '0' }).collectId).toBe('0');
    // 老接口没返回时按未收藏处理（列表字段是必填的，前端据此展示未收藏）
    expect(mapTabItemToResult(base).collectId).toBe('0');
  });
});

describe('mapGoodsToSkuResult - 原价与折扣', () => {
  it('优先用划线价 old_price 作为原价', () => {
    const result = mapGoodsToSkuResult(
      createMockSkuGoodsData({ old_price: '124.08', shoppe_price: '130.00' })
    );
    expect(result.price).toBe(62.04);
    expect(result.originalPrice).toBe(124.08);
  });

  it('划线价为空时回落到门市价 shoppe_price', () => {
    const result = mapGoodsToSkuResult(
      createMockSkuGoodsData({ old_price: '0.00', shoppe_price: '124.08' })
    );
    expect(result.originalPrice).toBe(124.08);
  });

  it('游客态把 shop_price（零售价）当原价，现价取 alone_price', () => {
    const result = mapGoodsToSkuResult(
      createMockSkuGoodsData({ shop_price: '198.00', alone_price: '62.04' }),
      { guest: true }
    );
    expect(result.price).toBe(62.04);
    expect(result.originalPrice).toBe(198);
  });

  it('原价不高于现价或缺失时不下发 originalPrice', () => {
    expect(mapGoodsToSkuResult(createMockSkuGoodsData()).originalPrice).toBeUndefined();
    expect(
      mapGoodsToSkuResult(createMockSkuGoodsData({ shoppe_price: '62.04' })).originalPrice
    ).toBeUndefined();
    expect(
      mapGoodsToSkuResult(createMockSkuGoodsData({ shoppe_price: 'invalid' })).originalPrice
    ).toBeUndefined();
  });

  it('现价为 0 时不计算原价，避免无价商品显示折扣', () => {
    const result = mapGoodsToSkuResult(
      createMockSkuGoodsData({ shop_price: '0', alone_price: '0', shoppe_price: '99.00' })
    );
    expect(result.price).toBe(0);
    expect(result.originalPrice).toBeUndefined();
  });
});

describe('mapGoodsToSkuResult - 图集与详情展示字段', () => {
  it('图集去重去空，保留一手给的图片处理参数', () => {
    const result = mapGoodsToSkuResult(
      createMockSkuGoodsData({
        goods_img: [
          'https://img.example.com/1.jpg?x-oss-process=webp',
          'https://img.example.com/1.jpg?x-oss-process=webp', // 重复
          '', // 空值
          'https://img.example.com/2.jpg?x-oss-process=webp',
        ],
      })
    );
    expect(result.images).toEqual([
      'https://img.example.com/1.jpg?x-oss-process=webp',
      'https://img.example.com/2.jpg?x-oss-process=webp',
    ]);
  });

  it('无图集时用 main_img / goods_thumb 兜底', () => {
    expect(mapGoodsToSkuResult(createMockSkuGoodsData()).images).toEqual([
      'https://example.com/thumb.jpg',
    ]);
    expect(
      mapGoodsToSkuResult(createMockSkuGoodsData({ goods_img: [], main_img: 'https://img.example.com/main.jpg' })).images
    ).toEqual(['https://img.example.com/main.jpg']);
  });

  it('属性优先展示 fabric_display，过滤空项', () => {
    const result = mapGoodsToSkuResult(
      createMockSkuGoodsData({
        prop_list: [
          { label: '面料', value: '狐狸毛(含量100%)', fabric_display: '100%狐狸毛' },
          { label: '配件', value: '可拆卸狐狸毛球围脖' },
          { label: '', value: '无标签' },
          { label: '季节', value: '' },
        ],
      })
    );
    expect(result.props).toEqual([
      { label: '面料', value: '100%狐狸毛' },
      { label: '配件', value: '可拆卸狐狸毛球围脖' },
    ]);
  });

  it('档口 / 标签 / 发货地 / 视频 / 文案按接口原样带出', () => {
    const result = mapGoodsToSkuResult(
      createMockSkuGoodsData({
        goods_tags: ['可拆卸围脖', ''],
        video_url: 'https://img.example.com/v.mp4',
        provider: {
          provider_id: '33723',
          provider_name: '美美桑蕾',
          provider_market: '海宁',
          supplier_address: '杭州-海宁',
          provider_image: 'https://img.example.com/store.jpg',
        },
        origin_name: '杭州发货商品',
        desc: '5件成团，已拼5件',
        remind_note: '清仓现货仅剩1件',
      })
    );
    expect(result.tags).toEqual(['可拆卸围脖']);
    expect(result.videoUrl).toBe('https://img.example.com/v.mp4');
    expect(result.provider).toEqual({
      supplyId: '33723',
      name: '美美桑蕾',
      market: '海宁',
      address: '杭州-海宁',
      image: 'https://img.example.com/store.jpg',
    });
    expect(result.originName).toBe('杭州发货商品');
    expect(result.saleNote).toBe('5件成团，已拼5件');
    expect(result.remindNote).toBe('清仓现货仅剩1件');
  });

  it('无档口信息时不下发 provider，避免展示空卡片', () => {
    const result = mapGoodsToSkuResult(createMockSkuGoodsData());
    expect(result.provider).toBeUndefined();
    expect(result.tags).toEqual([]);
    expect(result.props).toEqual([]);
  });
});

describe('mapGoodsToSkuResult - 优惠券', () => {
  it('映射可领红包与新版满减券', () => {
    const result = mapGoodsToSkuResult(
      createMockSkuGoodsData({
        coupons: [
          { coupon_id: '269120', coupon_type_title: '平台红包', coupon_title: '商品参与满减' },
          { coupon_id: '269121', coupon_type_title: '档口红包', coupon_title: '关注领券' },
        ],
        coupons_new: [
          { coupon_id: '284446', condition_goods_amount: '1500', reduce_amount: '600' },
          { coupon_id: '284447', condition_goods_amount: '800', reduce_amount: '300' },
        ],
      })
    );
    expect(result.coupons).toEqual([
      { couponId: '269120', typeTitle: '平台红包', title: '商品参与满减' },
      { couponId: '269121', typeTitle: '档口红包', title: '关注领券' },
    ]);
    expect(result.couponsNew).toEqual([
      { couponId: '284446', threshold: 1500, reduce: 600 },
      { couponId: '284447', threshold: 800, reduce: 300 },
    ]);
  });

  it('无券或脏数据时返回空数组，不产生 NaN', () => {
    const empty = mapGoodsToSkuResult(createMockSkuGoodsData());
    expect(empty.coupons).toEqual([]);
    expect(empty.couponsNew).toEqual([]);

    const dirty = mapGoodsToSkuResult(
      createMockSkuGoodsData({
        coupons_new: [{ coupon_id: 'x', condition_goods_amount: 'bad', reduce_amount: '' }],
      })
    );
    expect(dirty.couponsNew).toEqual([{ couponId: 'x', threshold: 0, reduce: 0 }]);
  });
});

describe('mapGoodsToSkuResult - 商品级可售状态', () => {
  it('规格有货但商品停售时，商品级 inStock 为 false', () => {
    const result = mapGoodsToSkuResult(
      createMockSkuGoodsData({
        is_on_sale: '0',
        attribute: [
          {
            color: '粉色',
            color_id: '1018',
            color_card: 'https://example.com/pink.jpg',
            card_thumb: 'https://example.com/pink_thumb.jpg',
            is_recommend: '2',
            item: [
              {
                size: '均码',
                sku: '850001',
                stock: '1',
                sale_stock: '1',
                sort: '1',
                sku_tag: '',
                is_show_stock: '0',
                is_stock_now: '0',
              },
            ],
          },
        ],
      })
    );
    // 规格级仍显示有货（sale_stock=1）
    expect(result.inStockSkuCount).toBe(1);
    expect(result.skuList[0].inStock).toBe(true);
    // 但商品级权威判定为不可售，文案提示停售
    expect(result.inStock).toBe(false);
    expect(result.stockMessage).toBe('商品已停售');
  });

  it('正常在售商品 inStock 为 true', () => {
    const result = mapGoodsToSkuResult(createMockSkuGoodsData({ is_on_sale: '1', goods_status: '1' }));
    expect(result.inStock).toBe(true);
    expect(result.stockMessage).toBe('商品有货，可以购买');
  });
});
