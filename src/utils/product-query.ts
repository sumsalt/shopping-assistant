/**
 * 库存查询页的搜索分流判定
 *
 * 纯函数、零依赖：前端按深路径 `@core/utils/product-query` 引入，
 * 不会把 core 的适配器 / Node 依赖打进客户端 bundle。
 */

/**
 * 是否为「单个纯数字商品 ID / 货号」查询
 *
 * 批量 ID 查询已下线：含逗号（半角 / 全角）的输入不再走库存查询，
 * 整条输入按关键词搜索处理（前端会对多 ID 额外给出提示）。
 */
export const isNumericProductQuery = (query: string): boolean =>
  /^\d+$/.test(query.trim());
