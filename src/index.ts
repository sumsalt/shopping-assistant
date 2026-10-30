/**
 * 购物助手 - 库存查询核心功能
 */

// 导出类型
export * from './types';

// 导出适配器相关
export { 
  getAdapter, 
  getSupportedPlatforms, 
  registerAdapter,
  BaseAdapter,
  YishouAdapter,
} from './adapters';
export type { PlatformAdapter, AdapterConfig } from './adapters';

// 导出工具函数
export { httpRequest, httpPost } from './utils/http';

// 导出库存查询主函数
export { checkStock, checkStockBatch, checkCollectionStock, getProductSkus } from './stock-check';
export type { CheckStockOptions, CollectionStockRequest, ProductSkuRequest } from './stock-check';

// 导出邮件服务
export {
  EmailService,
  configureEmailService,
  getEmailService,
  sendEmail,
  verifyEmailConfig,
  createBackInStockTemplate,
  createStockReportTemplate,
  createPriceChangeTemplate,
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
} from './tab-list-monitor';
export type {
  TabMonitorConfig,
  TabMonitorTask,
  TabMonitorResult,
  TabMonitorProgress,
  TabChangeInfo,
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
  DEFAULT_NOTIFY_COOLDOWN,
  DEFAULT_MIN_PRICE_DELTA,
} from './price-monitor';
export type {
  PriceMonitorConfig,
  PriceMonitorTask,
  PriceMonitorResult,
  PriceMonitorProgress,
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
export type {
  GateContext,
  GateOptions,
  GateStats,
  GateBucketStats,
  GateTaskStats,
  GateTaskKind,
} from './utils/request-gate';
