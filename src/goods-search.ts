/**
 * 关键词商品搜索
 *
 * 库存查询页的第二种搜索：单个纯数字（商品 ID / 货号）走原有 checkStock；
 * 含文字的关键词走一手 Goods/keyword_search。批量 ID 查询已下线。
 *
 * 登录态由调用方通过 AdapterConfig 决定：服务端传当前账号的完整快照（带
 * uid/token）时，接口返回真实 shop_price（拿货价）；匿名请求会把它降级成
 * "??.??"，映射层归一成「无价格」，由前端兜底。
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
  /** 适配器配置（服务端按当前账号解析，带登录态才能拿到真实价格）；不传则用默认匿名参数 */
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
