/**
 * 库存查询 - 主函数
 */

import { StockCheckError, StockCheckErrorType } from './types';
import type {
  StockCheckRequest,
  StockCheckResult,
  BatchStockCheckRequest,
  BatchStockCheckResult,
  CollectionStockCheckResult,
  OrderListResult,
  ProductSkuResult,
  Platform
} from './types';
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
 * 订单列表查询请求参数
 */
export interface OrderListRequest {
  /** 平台类型 */
  platform: Platform;
  /** 页码，从 1 开始 */
  page?: number;
  /** 每页数量，平台上限 10 */
  pageSize?: number;
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
 * 批量查询商品库存状态
 *
 * @param request 批量库存查询请求参数
 * @param options 查询选项（包含平台认证配置等）
 * @returns 批量库存查询结果
 *
 * @example
 * ```typescript
 * const result = await checkStockBatch(
 *   {
 *     platform: 'yishou',
 *     productIds: ['123456', '123457', '123458'],
 *     skus: ['红色-M', '蓝色-L', '黑色-XL']
 *   },
 *   { adapterConfig: { uid: 'xxx', token: 'xxx' } }
 * );
 *
 * console.log(`成功查询: ${result.successCount} 件`);
 * console.log(`查询失败: ${result.failedCount} 件`);
 *
 * // 遍历成功查询的商品
 * result.successItems.forEach(item => {
 *   if (item.inStock) {
 *     console.log(`${item.productName} 有货！`);
 *   }
 * });
 *
 * // 查看失败的商品
 * result.failedItems.forEach(item => {
 *   console.log(`商品 ${item.productId} 查询失败: ${item.error}`);
 * });
 * ```
 */
export const checkStockBatch = async (
  request: BatchStockCheckRequest,
  options: CheckStockOptions = {}
): Promise<BatchStockCheckResult> => {
  const { platform, productIds, skus } = request;
  const { adapterConfig = {} } = options;

  // 校验参数
  if (!platform) {
    throw new StockCheckError(
      StockCheckErrorType.API_ERROR,
      '缺少必要参数: platform'
    );
  }

  if (!productIds || productIds.length === 0) {
    throw new StockCheckError(
      StockCheckErrorType.API_ERROR,
      '商品ID列表不能为空'
    );
  }

  // 校验 skus 长度（如果提供）
  if (skus && skus.length > 0 && skus.length !== productIds.length) {
    throw new StockCheckError(
      StockCheckErrorType.API_ERROR,
      'skus 列表长度必须与 productIds 列表长度一致'
    );
  }

  // 获取对应平台的适配器
  const adapter = getAdapter(platform, adapterConfig);

  // 串行查询所有商品，每次查询后等待 0.5 秒
  const results: PromiseSettledResult<StockCheckResult>[] = [];

  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];
    const sku = skus?.[i];

    try {
      const result = await adapter.checkStock(productId, sku);
      results.push({ status: 'fulfilled', value: result });
    } catch (error) {
      results.push({ status: 'rejected', reason: { productId, error } });
    }

    // 等待 0.5 秒后继续（最后一个商品不需要等待）
    if (i < productIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 分类处理结果
  const successItems: StockCheckResult[] = [];
  const failedItems: Array<{
    productId: string;
    error: string;
    errorType: StockCheckErrorType;
  }> = [];

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      successItems.push(result.value);
    } else {
      const { productId, error } = result.reason;
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const errorType = error instanceof StockCheckError ? error.type : StockCheckErrorType.UNKNOWN_ERROR;
      failedItems.push({
        productId,
        error: errorMessage,
        errorType,
      });
    }
  });

  return {
    platform,
    successItems,
    failedItems,
    total: productIds.length,
    successCount: successItems.length,
    failedCount: failedItems.length,
  };
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
 * 查询订单列表
 *
 * 订单比收藏夹敏感：必须登录态，且不支持匿名降级。
 * 一手没有总数，hasMore 只能按「本页是否满页」判断。
 *
 * @param request 订单列表请求参数
 * @param options 查询选项（包含平台认证配置等）
 * @returns 订单列表
 */
export const getOrderList = async (
  request: OrderListRequest,
  options: CheckStockOptions = {}
): Promise<OrderListResult> => {
  const { platform, page = 1, pageSize = 10 } = request;
  const { adapterConfig = {} } = options;

  if (!platform) {
    throw new StockCheckError(StockCheckErrorType.API_ERROR, '缺少必要参数: platform');
  }

  const adapter = getAdapter(platform, adapterConfig);
  if (typeof adapter.getOrderList !== 'function') {
    throw new StockCheckError(
      StockCheckErrorType.PLATFORM_NOT_SUPPORTED,
      `平台 "${platform}" 暂不支持查询订单`
    );
  }

  return adapter.getOrderList(page, pageSize);
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
