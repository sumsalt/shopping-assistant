/**
 * 平台适配器 - 基础抽象类
 */

import { Platform, StockCheckResult, CollectionStockCheckResult, ProductSkuResult } from '../types';
import { PlatformAdapter, AdapterConfig } from './types';

/**
 * 基础适配器抽象类
 * 提供适配器通用功能和模板方法
 */
export abstract class BaseAdapter implements PlatformAdapter {
  abstract readonly platform: Platform;
  
  protected config: AdapterConfig;

  constructor(config: AdapterConfig = {}) {
    this.config = config;
  }

  /**
   * 更新适配器配置
   */
  updateConfig(config: Partial<AdapterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 查询商品库存状态（抽象方法，子类必须实现）
   */
  abstract checkStock(productId: string, sku?: string): Promise<StockCheckResult>;

  /**
   * 查询收藏夹内商品的库存状态（抽象方法，子类必须实现）
   */
  abstract checkCollectionStock(page?: number, pageSize?: number): Promise<CollectionStockCheckResult>;

  /**
   * 获取商品的所有 SKU 信息（抽象方法，子类必须实现）
   */
  abstract getProductSkus(productNo: string): Promise<ProductSkuResult>;
}
