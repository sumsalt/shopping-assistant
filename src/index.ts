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
export { checkStock, checkCollectionStock, getProductSkus } from './stock-check';
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
} from './email';
export type {
  EmailConfig,
  EmailContent,
  EmailAttachment,
  EmailResult,
} from './email';
