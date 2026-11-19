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

/** 自动下单所需的能力键（显式声明，集中在此，避免 duck typing 散落） */
const ORDER_CAPABILITIES: ReadonlyArray<keyof AutoOrderAdapter> = [
  'getAddresses',
  'getOrderProductSkus',
  'prepareCheckout',
  'createOrder',
  'discardCheckout',
];

/** 订单续期所需的能力键 */
const RENEW_CAPABILITIES: ReadonlyArray<keyof RenewOrderAdapter> = [
  'getOrderList',
  'confirmWaitPayOrder',
  'reloadWaitPayOrder',
];

/** 运行时能力检测：对象是否具备全部指定方法 */
const hasCapabilities = <T>(value: unknown, keys: ReadonlyArray<keyof T>): value is T =>
  Boolean(value) &&
  typeof value === 'object' &&
  keys.every((key) => typeof (value as Record<string, unknown>)[key as string] === 'function');

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
  const adapter: unknown = getAdapter(platform, config);
  return hasCapabilities<AutoOrderAdapter>(adapter, ORDER_CAPABILITIES) ? adapter : null;
};

/**
 * 获取支持「待支付订单续期」的适配器
 *
 * 续期走 order.renew flow（闸门限频），与下单的 bypass 通道分离。
 * 若适配器提供续期专用视图（asRenewAdapter），用它取绑定了正确 flow 的对象。
 */
export const getRenewAdapter = (
  platform: Platform,
  config: AdapterConfig = {}
): RenewOrderAdapter | null => {
  const raw: unknown = getAdapter(platform, config);
  const candidate =
    raw && typeof (raw as { asRenewAdapter?: unknown }).asRenewAdapter === 'function'
      ? (raw as { asRenewAdapter: () => unknown }).asRenewAdapter()
      : raw;
  return hasCapabilities<RenewOrderAdapter>(candidate, RENEW_CAPABILITIES) ? candidate : null;
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
