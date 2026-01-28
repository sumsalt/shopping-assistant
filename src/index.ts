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
  PlatformAdapter,
  AdapterConfig,
  BaseAdapter,
  YishouAdapter,
} from './adapters';

// 导出工具函数
export { httpRequest, httpPost } from './utils/http';

// 导出库存查询主函数
export { checkStock, checkCollectionStock, CheckStockOptions, CollectionStockRequest } from './stock-check';
