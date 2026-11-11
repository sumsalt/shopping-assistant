/**
 * 一手接口端点表
 *
 * 所有 URL 收敛到这里，适配器与下单 API 只引用常量，
 * 避免 URL 散落在多个方法里、改域名时到处搜。
 */

const BASE = 'https://api.yishouapp.com';

/** 商品详情（按 goods_id 查，库存 / 价格都用它） */
export const GOODS_INFO = `${BASE}/goods/get_goods_info_v2`;

/** 收藏夹商品列表 */
export const COLLECTION_LIST = `${BASE}/users/get_goods_collection_list`;

/** 商品详情（按 goods_no 查 SKU） */
export const GOODS_DETAIL = `${BASE}/wechat/add_cart_goods_info`;

/** H5 Tab 商品列表 */
export const TAB_GOODS_LIST = `${BASE}/template/getNewTemplateH5Tab`;

/** 收货地址列表 */
export const ADDRESS_LIST = `${BASE}/userAddress/get_user_address`;

/** 加入购物车 */
export const CART_ADD = `${BASE}/cart/add_goods_to_cart`;

/** 删除购物车商品 */
export const CART_DELETE = `${BASE}/cart/del_cart`;

/** 结算确认（只算钱、不建单、可反复调用） */
export const ORDER_CONFIRM = `${BASE}/order/confirm_order_v4`;

/** 创建订单（失败会锁单，调用前必须先 confirm） */
export const ORDER_CREATE = `${BASE}/order/create_order_v4`;

/** 订单详情 */
export const ORDER_DETAIL = `${BASE}/order/get_order_detail_v2`;

/** 商品 H5 链接前缀 */
export const GOODS_URL_PREFIX = 'https://www.yishouapp.com/goods/';

/**
 * 当前用户信息
 *
 * 必须登录，且会校验 uid + token + udid 三元组；用于账号登录态自检。
 */
export const USER_INFO = `${BASE}/users/get_user_info`;
