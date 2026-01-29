/**
 * 库存查询 - 主函数
 */

import { StockCheckError, StockCheckErrorType } from './types';
import type { StockCheckRequest, StockCheckResult, CollectionStockCheckResult, ProductSkuResult, Platform } from './types';
import { getAdapter } from './adapters';
import type { AdapterConfig } from './adapters';

/**
 * 库存查询配置
 */
export interface CheckStockOptions {
  /** 平台认证配置 */
  adapterConfig?: AdapterConfig;
}

/**
 * 收藏夹库存查询请求参数
 */
export interface CollectionStockRequest {
  /** 平台类型 */
  platform: Platform;
  /** 页码，默认为1 */
  page?: number;
  /** 每页数量，默认为20 */
  pageSize?: number;
}

/**
 * 商品 SKU 查询请求参数
 */
export interface ProductSkuRequest {
  /** 平台类型 */
  platform: Platform;
  /** 商品货号 */
  productNo: string;
}

/**
 * 查询商品库存状态
 * 
 * @param request 库存查询请求参数
 * @param options 查询选项（包含平台认证配置等）
 * @returns 库存查询结果
 * 
 * @example
 * ```typescript
 * const result = await checkStock(
 *   { platform: 'yishou', productId: '123456' },
 *   { adapterConfig: { uid: 'xxx', token: 'xxx', sign: 'xxx' } }
 * );
 * 
 * if (result.inStock) {
 *   console.log('商品有货！');
 * } else {
 *   console.log('商品无货，可以设置到货提醒');
 * }
 * ```
 */
export const checkStock = async (
  request: StockCheckRequest,
  options: CheckStockOptions = {}
): Promise<StockCheckResult> => {
  const { platform, productId, sku } = request;
  const { adapterConfig = {} } = options;

  // 校验参数
  if (!platform) {
    throw new StockCheckError(
      StockCheckErrorType.API_ERROR,
      '缺少必要参数: platform'
    );
  }

  if (!productId) {
    throw new StockCheckError(
      StockCheckErrorType.API_ERROR,
      '缺少必要参数: productId'
    );
  }

  // 获取对应平台的适配器
  const adapter = getAdapter(platform, adapterConfig);

  // 调用适配器查询库存
  return adapter.checkStock(productId, sku);
};

/**
 * 查询收藏夹内商品的库存状态
 * 
 * @param request 收藏夹库存查询请求参数
 * @param options 查询选项（包含平台认证配置等）
 * @returns 收藏夹库存查询结果
 * 
 * @example
 * ```typescript
 * const result = await checkCollectionStock(
 *   { platform: 'yishou', page: 1, pageSize: 20 },
 *   { adapterConfig: { uid: 'xxx', token: 'xxx' } }
 * );
 * 
 * console.log(`有货商品: ${result.inStockCount} 件`);
 * console.log(`无货商品: ${result.outOfStockCount} 件`);
 * 
 * // 遍历有货商品
 * result.inStockItems.forEach(item => {
 *   console.log(`${item.productName} - ¥${item.price}`);
 * });
 * ```
 */
export const checkCollectionStock = async (
  request: CollectionStockRequest,
  options: CheckStockOptions = {}
): Promise<CollectionStockCheckResult> => {
  const { platform, page = 1, pageSize = 20 } = request;
  const { adapterConfig = {} } = options;

  // 校验参数
  if (!platform) {
    throw new StockCheckError(
      StockCheckErrorType.API_ERROR,
      '缺少必要参数: platform'
    );
  }

  // 获取对应平台的适配器
  const adapter = getAdapter(platform, adapterConfig);

  // 调用适配器查询收藏夹库存
  return adapter.checkCollectionStock(page, pageSize);
};

/**
 * 获取商品的所有 SKU 信息
 * 
 * @param request SKU 查询请求参数
 * @param options 查询选项（包含平台认证配置等）
 * @returns 商品 SKU 查询结果
 * 
 * @example
 * ```typescript
 * const result = await getProductSkus(
 *   { platform: 'yishou', productNo: '1349201542' },
 *   { adapterConfig: { uid: 'xxx', token: 'xxx' } }
 * );
 * 
 * console.log(`商品名称: ${result.productName}`);
 * console.log(`可用颜色: ${result.colors.join(', ')}`);
 * console.log(`可用尺码: ${result.sizes.join(', ')}`);
 * console.log(`有货 SKU: ${result.inStockSkuCount} / ${result.totalSkuCount}`);
 * 
 * // 遍历所有有货的 SKU
 * result.skuList
 *   .filter(sku => sku.inStock)
 *   .forEach(sku => {
 *     console.log(`${sku.color} - ${sku.size}: 库存 ${sku.saleStock}`);
 *   });
 * ```
 */
export const getProductSkus = async (
  request: ProductSkuRequest,
  options: CheckStockOptions = {}
): Promise<ProductSkuResult> => {
  const { platform, productNo } = request;
  const { adapterConfig = {} } = options;

  // 校验参数
  if (!platform) {
    throw new StockCheckError(
      StockCheckErrorType.API_ERROR,
      '缺少必要参数: platform'
    );
  }

  if (!productNo) {
    throw new StockCheckError(
      StockCheckErrorType.API_ERROR,
      '缺少必要参数: productNo'
    );
  }

  // 获取对应平台的适配器
  const adapter = getAdapter(platform, adapterConfig);

  // 调用适配器获取商品 SKU
  return adapter.getProductSkus(productNo);
};
