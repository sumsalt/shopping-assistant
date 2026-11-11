/**
 * 一手原始响应 → 内部领域模型
 *
 * 纯函数、无 IO，便于单测覆盖。所有字段兼容（"1"/"0" 字符串、价格字符串等）
 * 都收敛在这里，适配器只负责发请求。
 */

import type {
  CollectionStockResult,
  PriceSnapshot,
  ProductSkuResult,
  SkuInfo,
  StockCheckResult,
  YishouCartDetailData,
  YishouCollectionGoodsData,
  YishouConfirmStockItem,
  YishouGoodsData,
  YishouTabGoodsData,
  YishouAddress,
} from '../../types';
import { GOODS_URL_PREFIX } from './endpoints';

/** 商品链接 */
export const goodsUrl = (goodsId: string): string => `${GOODS_URL_PREFIX}${goodsId}`;

/** 字符串价格转数字，空值 / 非法值返回 undefined */
export const toOptionalNumber = (value?: string | number): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * 商品详情价格
 *
 * 匿名请求时一手不会报错，而是把 `shop_price` 静默降级成 `"??.??"`（会员字段一并清空），
 * 但 `alone_price`（单独购买价）仍然是真实可售价格，实测与登录态拿货价同值。
 * 因此按 `shop_price → alone_price` 顺序取值，并标记来源，避免把游客价当成拿货价比价。
 */
export const resolveGoodsPrice = (
  data: Pick<YishouGoodsData, 'shop_price' | 'alone_price'>
): { price: number; guest: boolean } => {
  const shopPrice = toOptionalNumber(data.shop_price);
  if (shopPrice !== undefined && shopPrice > 0) return { price: shopPrice, guest: false };

  const alonePrice = toOptionalNumber(data.alone_price);
  if (alonePrice !== undefined && alonePrice > 0) return { price: alonePrice, guest: true };

  return { price: 0, guest: false };
};

/** 一手地址原始字段（snake_case） */
export interface YishouAddressRaw {
  address_id?: string | number;
  consignee?: string;
  province?: string | number;
  city?: string | number;
  district?: string | number;
  address?: string;
  mobile?: string;
  area?: string;
}

/** 地址转内部结构 */
export const mapYishouAddress = (raw: YishouAddressRaw): YishouAddress => ({
  addressId: String(raw.address_id ?? ''),
  consignee: raw.consignee ?? '',
  province: String(raw.province ?? ''),
  city: String(raw.city ?? ''),
  district: String(raw.district ?? ''),
  address: raw.address ?? '',
  mobile: raw.mobile ?? '',
  area: raw.area ?? '',
});

// ==================== 有货判定 ====================

/**
 * 有货判定（商品详情 / 收藏夹 / Tab 列表共用）
 *
 * 任一条件成立即视为无货：
 *   1. is_stockout === '1'（缺货）
 *   2. is_on_sale === '0'（停售）
 *   3. goods_status === '2'（下架）
 */
const isAvailable = (data: {
  is_stockout?: string;
  is_on_sale?: string;
  goods_status?: string;
}): boolean => {
  if (data.is_stockout === '1') return false;
  if (data.is_on_sale === '0') return false;
  if (data.goods_status === '2') return false;
  return true;
};

export const isInStock = (data: YishouGoodsData): boolean => isAvailable(data);

export const isCollectionItemInStock = (data: YishouCollectionGoodsData): boolean =>
  isAvailable(data);

/** 商品详情状态文案 */
export const getStockMessage = (data: YishouGoodsData, inStock: boolean): string => {
  if (inStock) return '商品有货，可以购买';
  if (data.is_stockout === '1') return '商品暂时缺货';
  if (data.goods_status === '2') return data.remind_off_sale || '商品已下架';
  if (data.is_on_sale === '0') return '商品已停售';
  return '商品无货';
};

/** 收藏夹 / Tab 商品状态文案（收藏夹多一个「补货中」） */
export const getCollectionItemMessage = (
  data: YishouCollectionGoodsData,
  inStock: boolean
): string => {
  if (inStock) return '商品有货，可以购买';
  if (data.is_stockout === '1') {
    return data.is_replenish === '1' ? '商品缺货补货中' : '商品暂时缺货';
  }
  if (data.goods_status === '2') return '商品已下架';
  if (data.is_on_sale === '0') return '商品已停售';
  return '商品无货';
};

// ==================== 领域映射 ====================

/** 商品详情 → 库存查询结果 */
export const mapToStockResult = (data: YishouGoodsData): StockCheckResult => {
  const inStock = isInStock(data);
  const sku =
    data.color || data.size
      ? [data.color, data.size].filter(Boolean).join(' / ')
      : undefined;
  const { price, guest } = resolveGoodsPrice(data);

  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    productNo: data.goods_no,
    sku,
    inStock,
    price,
    ...(guest ? { priceNote: '游客参考价' } : {}),
    productUrl: goodsUrl(data.goods_id),
    productImage: data.goods_thumb,
    message: getStockMessage(data, inStock),
  };
};

/** 商品详情 → 价格快照（登录态下才有 coupons_new / check_status） */
export const mapToPriceSnapshot = (data: YishouGoodsData): PriceSnapshot => {
  const coupons = (data.coupons ?? []).map(coupon => ({
    couponId: String(coupon.coupon_id ?? ''),
    typeTitle: coupon.coupon_type_title ?? '',
    title: coupon.coupon_title ?? '',
  }));

  const couponsNew = (data.coupons_new ?? []).map(coupon => ({
    couponId: String(coupon.coupon_id ?? ''),
    threshold: Number(coupon.condition_goods_amount) || 0,
    reduce: Number(coupon.reduce_amount) || 0,
  }));

  const authState: PriceSnapshot['authState'] =
    Array.isArray(data.coupons_new) || typeof data.check_status === 'string'
      ? 'logged_in'
      : 'guest';

  // 价格与库存同属一次详情响应：顺手把商品级有货状态带出去，
  // 价格到点需要下单时就能先挡掉「注定买不到」的情况
  const inStock = isInStock(data);

  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    productNo: data.goods_no,
    productImage: data.goods_thumb,
    productUrl: goodsUrl(data.goods_id),
    shopPrice: toOptionalNumber(data.shop_price) ?? 0,
    shopPriceNote: data.shop_price_note || undefined,
    alonePrice: toOptionalNumber(data.alone_price),
    shoppePrice: toOptionalNumber(data.shoppe_price),
    authState,
    inStock,
    stockMessage: getStockMessage(data, inStock),
    coupons,
    couponsNew,
    capturedAt: Date.now(),
  };
};

/** 收藏夹商品 → 库存结果 */
export const mapCollectionItemToResult = (
  data: YishouCollectionGoodsData
): CollectionStockResult => {
  const inStock = isCollectionItemInStock(data);

  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    brandName: data.brand_name,
    productNo: data.goods_no,
    inStock,
    price: Number.parseFloat(data.shop_price) || 0,
    productUrl: goodsUrl(data.goods_id),
    productImage: data.goods_img || data.goods_thumb,
    marketName: data.one_market_name,
    salesOf7: data.sales_of_7 || 0,
    message: getCollectionItemMessage(data, inStock),
    collectId: data.collect_id || '',
  };
};

/** Tab 商品 → 库存结果 */
export const mapTabItemToResult = (data: YishouTabGoodsData): CollectionStockResult => {
  const inStock = isCollectionItemInStock(data);

  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    ...(data.goods_name_without_brand_name
      ? { productNameWithoutBrand: data.goods_name_without_brand_name }
      : {}),
    brandName: data.brand_name,
    productNo: data.goods_no,
    inStock,
    price: Number.parseFloat(data.shop_price) || 0,
    productUrl: goodsUrl(data.goods_id),
    productImage: data.goods_img || data.goods_thumb,
    marketName: data.one_market_name,
    ...(data.supply_id ? { supplyId: String(data.supply_id) } : {}),
    salesOf7: data.sales_of_7 || 0,
    ...(data.first_sale_period ? { firstSalePeriod: String(data.first_sale_period) } : {}),
    ...(data.format_first_sale_time ? { firstSaleText: data.format_first_sale_time } : {}),
    isNew: data.is_new === '1',
    message: getCollectionItemMessage(data, inStock),
    collectId: '0',
  };
};

/** 商品详情 → SKU 列表 */
export const mapCartDetailToSkuResult = (data: YishouCartDetailData): ProductSkuResult => {
  const skuList: SkuInfo[] = [];
  const colors: string[] = [];
  const sizesSet = new Set<string>();

  for (const colorAttr of data.attribute || []) {
    colors.push(colorAttr.color);

    for (const item of colorAttr.item || []) {
      sizesSet.add(item.size);

      const stock = Number.parseInt(item.stock, 10) || 0;
      const saleStock = Number.parseInt(item.sale_stock, 10) || 0;

      skuList.push({
        skuId: item.sku,
        color: colorAttr.color,
        colorId: colorAttr.color_id,
        size: item.size,
        stock,
        saleStock,
        inStock: saleStock > 0,
        colorImage: colorAttr.card_thumb || colorAttr.color_card,
      });
    }
  }

  return {
    platform: 'yishou',
    productId: data.goods_id,
    productName: data.goods_name,
    productNo: data.goods_no,
    price: Number.parseFloat(data.shop_price) || 0,
    productImage: data.goods_thumb,
    productUrl: goodsUrl(data.goods_id),
    sales: Number.parseInt(data.sales, 10) || 0,
    colors,
    sizes: Array.from(sizesSet),
    skuList,
    inStockSkuCount: skuList.filter(sku => sku.inStock).length,
    totalSkuCount: skuList.length,
    restrictionNumber: data.restriction_number,
  };
};

/**
 * 下单时回传的 stock 项：只保留标量字段
 *
 * 一手要求把 confirm_order_v4 返回的 stock 原样传回，只传 sku + num 会 500 并触发锁单；
 * 但 tag_list / 图片等嵌套结构必须丢弃。
 */
export const pickScalarFields = (
  item: YishouConfirmStockItem
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === null || value === undefined || typeof value === 'object') continue;
    result[key] = value;
  }
  return result;
};
