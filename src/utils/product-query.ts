/**
 * 库存查询页的搜索分流判定
 *
 * 纯函数、零依赖：前端按深路径 `@core/utils/product-query` 引入，
 * 不会把 core 的适配器 / Node 依赖打进客户端 bundle。
 */

/**
 * 是否为「纯数字商品 ID / 货号」查询
 *
 * 逗号（半角 / 全角）分隔的批量查询仍属于旧搜索；只要有一项含非数字字符，
 * 整条输入就按关键词搜索处理。
 */
export const isNumericProductQuery = (query: string): boolean => {
  const parts = query
    .split(/[,，]/)
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every(part => /^\d+$/.test(part));
};
