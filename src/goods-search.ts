/**
 * 关键词商品搜索
 *
 * 库存查询页的第二种搜索：纯数字（商品 ID / 货号，支持逗号批量）走原有
 * checkStock / checkStockBatch；含文字的关键词走一手 Goods/keyword_search。
 *
 * 搜索链路**不带登录信息**：服务端按匿名配置剔除 uid/token，走 1 秒匿名桶。
 * 匿名可返回商品列表，但 shop_price 会降级成 "??.??"，真实价格进详情页查看。
 */

import { getAdapter } from './adapters';
import type { AdapterConfig } from './adapters/types';
import { StockCheckError, StockCheckErrorType } from './types';
import type { KeywordSearchResult } from './types';

// 分流判定是零依赖纯函数，单独放一份供前端按深路径引入（避免把 Node 依赖打进客户端）
export { isNumericProductQuery } from './utils/product-query';

export interface KeywordSearchRequest {
  keyword: string;
  /** 页码，从 1 开始 */
  page?: number;
}

export interface KeywordSearchOptions {
  /** 匿名适配器配置（不带 uid/token）；不传则用默认 wx 匿名参数 */
  adapterConfig?: AdapterConfig;
}

/** 关键词搜索商品列表（能力检测后委托给平台适配器） */
export const searchGoodsByKeyword = async (
  request: KeywordSearchRequest,
  options: KeywordSearchOptions = {}
): Promise<KeywordSearchResult> => {
  const keyword = (request.keyword ?? '').trim();
  if (!keyword) {
    throw new StockCheckError(StockCheckErrorType.API_ERROR, '搜索关键词不能为空');
  }

  const page = Math.min(1000, Math.max(1, Math.floor(Number(request.page) || 1)));
  const adapter = getAdapter('yishou', options.adapterConfig ?? {});

  if (typeof adapter.searchByKeyword !== 'function') {
    throw new StockCheckError(
      StockCheckErrorType.PLATFORM_NOT_SUPPORTED,
      '当前平台不支持关键词搜索'
    );
  }

  return adapter.searchByKeyword(keyword, page);
};
