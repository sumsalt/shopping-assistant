/**
 * 库存查询页的搜索分流判定
 *
 * 纯函数、零依赖：前端按深路径 `@core/utils/product-query` 引入，
 * 不会把 core 的适配器 / Node 依赖打进客户端 bundle。
 */

/**
 * 是否为「单个纯数字商品 ID / 货号」查询
 *
 * 只认单个纯数字：含逗号（半角 / 全角）或其他字符的输入不走库存查询，
 * 前端会对多 ID 输入给出单独提示。
 */
export const isNumericProductQuery = (query: string): boolean =>
  /^\d+$/.test(query.trim());
