/**
 * 平台适配器 - 注册与导出
 */

import { StockCheckError, StockCheckErrorType } from '../types';
import type { Platform } from '../types';
import type { PlatformAdapter, AdapterConfig, RenewOrderAdapter } from './types';
import { YishouAdapter } from './yishou';
import type { AutoOrderAdapter } from '../auto-order';

// 适配器注册表
const adapterRegistry = new Map<Platform, new (config: AdapterConfig) => PlatformAdapter>();

/**
 * 注册适配器
 */
export const registerAdapter = (
  platform: Platform,
  AdapterClass: new (config: AdapterConfig) => PlatformAdapter
): void => {
  adapterRegistry.set(platform, AdapterClass);
};

/**
 * 获取支持自动下单的适配器
 *
 * 下单能力不是所有平台都有，这里做一次运行时能力检查，
 * 不支持时返回 null，由调用方降级为普通到货提醒。
 */
export const getOrderAdapter = (
  platform: Platform,
  config: AdapterConfig = {}
): AutoOrderAdapter | null => {
  const adapter = getAdapter(platform, config) as unknown as AutoOrderAdapter;

  const capable =
    typeof adapter.getAddresses === 'function' &&
    typeof adapter.getProductSkus === 'function' &&
    typeof adapter.prepareCheckout === 'function' &&
    typeof adapter.createOrder === 'function' &&
    typeof adapter.discardCheckout === 'function';

  return capable ? adapter : null;
};

/**
 * 获取支持「待支付订单续期」的适配器
 *
 * 独立于 getOrderAdapter 做能力检测：不改动下单的 5 项检测，
 * 避免影响既有自动下单契约测试里只有 5 个方法的 mock adapter。
 */
export const getRenewAdapter = (
  platform: Platform,
  config: AdapterConfig = {}
): RenewOrderAdapter | null => {
  const adapter = getAdapter(platform, config) as unknown as RenewOrderAdapter;

  const capable =
    typeof adapter.getOrderList === 'function' &&
    typeof adapter.confirmWaitPayOrder === 'function' &&
    typeof adapter.reloadWaitPayOrder === 'function';

  return capable ? adapter : null;
};

/**
 * 获取适配器实例
 * @param platform 平台类型
 * @param config 适配器配置
 * @returns 平台适配器实例
 * @throws StockCheckError 如果平台不支持
 */
export const getAdapter = (platform: Platform, config: AdapterConfig = {}): PlatformAdapter => {
  const AdapterClass = adapterRegistry.get(platform);
  
  if (!AdapterClass) {
    throw new StockCheckError(
      StockCheckErrorType.PLATFORM_NOT_SUPPORTED,
      `平台 "${platform}" 暂不支持，当前支持的平台：${getSupportedPlatforms().join(', ')}`
    );
  }
  
  return new AdapterClass(config);
};

/**
 * 获取支持的平台列表
 */
export const getSupportedPlatforms = (): Platform[] => {
  return Array.from(adapterRegistry.keys());
};

// 注册一手平台适配器
registerAdapter('yishou', YishouAdapter);

// 导出类型和适配器
export * from './types';
export { BaseAdapter } from './base-adapter';
export { YishouAdapter } from './yishou';
export { checkYishouAuth } from './yishou/auth-check';
export type { AuthCheckResult } from './yishou/auth-check';
