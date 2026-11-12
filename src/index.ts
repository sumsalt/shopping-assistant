/**
 * 购物助手 - 库存查询核心功能
 */

// 导出类型
export * from './types';

// 导出适配器相关
export { 
  getAdapter, 
  getOrderAdapter,
  getSupportedPlatforms, 
  registerAdapter,
  BaseAdapter,
  YishouAdapter,
  checkYishouAuth,
} from './adapters';
export {
  buildAdapterConfigFromProfile,
  toAnonymousAdapterConfig,
  stripAuthParams,
  hasProfileCredential,
  DEFAULT_WX_ADAPTER_CONFIG,
} from './adapter-config';
export type { StoredRequestProfile } from './adapter-config';
export { placeAutoOrder, precheckAutoOrder, DEFAULT_AUTO_ORDER_PAY_TOOL, MAX_AUTO_ORDER_NUM } from './auto-order';
export type { AutoOrderAdapter, PlaceOrderParams, PrecheckOrderResult } from './auto-order';
export type { PlatformAdapter, AdapterConfig, AuthCheckResult } from './adapters';

// 订单列表分页上限与状态枚举（一手服务端硬限制）
export { ORDER_LIST_PAGE_SIZE, ORDER_STATUS_TABS, normalizeOrderStatus } from './adapters/yishou/order-api';

// 导出工具函数
export { httpRequest, httpPost } from './utils/http';

// 导出库存查询主函数
export { checkStock, checkStockBatch, checkCollectionStock, getProductSkus, getOrderList } from './stock-check';
export type { CheckStockOptions, CollectionStockRequest, ProductSkuRequest, OrderListRequest } from './stock-check';

// 导出邮件服务
export {
  EmailService,
  configureEmailService,
  configureTabEmailService,
  loadEmailConfigFromEnv,
  loadTabEmailConfigFromEnv,
  getEmailService,
  sendEmail,
  sendTabEmail,
  verifyEmailConfig,
  createBackInStockTemplate,
  createStockReportTemplate,
  createPriceChangeTemplate,
  createAutoOrderTemplate,
  createAutoOrderFailedTemplate,
} from './email';
export type {
  EmailConfig,
  EmailContent,
  EmailAttachment,
  EmailResult,
} from './email';

// 导出库存监控
export {
  monitorStock,
  monitorSingleStock,
  createCancellableMonitor,
  MIN_STOCK_MONITOR_INTERVAL,
} from './stock-monitor';
export type {
  StockMonitorConfig,
  MonitorTask,
  MonitorResult,
  MonitorProgress,
  ProgressCallback,
  ResultCallback,
} from './stock-monitor';

// 导出Tab商品列表监控
export {
  monitorTabList,
  createCancellableTabMonitor,
  MAX_TAB_FULL_SCAN_PAGE_COUNT,
  MAX_TAB_SEEN_PRODUCTS,
} from './tab-list-monitor';
export type {
  TabMonitorConfig,
  TabMonitorTask,
  TabMonitorResult,
  TabMonitorProgress,
  TabChangeInfo,
  TabSeenProduct,
  TabProgressCallback,
  TabResultCallback,
} from './tab-list-monitor';

// 导出价格监控
export {
  monitorPrice,
  createCancellablePriceMonitor,
  comparePrice,
  shouldNotifyPriceChange,
  MIN_PRICE_MONITOR_INTERVAL,
  DEFAULT_PRICE_MONITOR_INTERVAL,
  DEFAULT_MIN_PRICE_DELTA,
} from './price-monitor';
export type {
  PriceMonitorConfig,
  PriceMonitorTask,
  PriceMonitorResult,
  PriceMonitorProgress,
  PriceAutoOrderConfig,
  PriceChangeInfo,
  PriceNotifyOn,
  PriceProgressCallback,
  PriceResultCallback,
} from './price-monitor';

// 导出全局请求闸门
export {
  acquireRequestSlot,
  configureRequestGate,
  getGateContext,
  getGateOptions,
  getGateStats,
  resetRequestGate,
  runWithGateContext,
  GateTimeoutError,
} from './utils/request-gate';
export {
  activeSecondsBetween,
  isWithinActiveWindow,
  msUntilActiveWindowStart,
  normalizeActiveWindow,
  parseTimeOfDay,
} from './utils/active-window';
export type { ActiveWindow } from './utils/active-window';
export type {
  GateContext,
  GateOptions,
  GateStats,
  GateBucketStats,
  GateTaskStats,
  GateTaskKind,
} from './utils/request-gate';
