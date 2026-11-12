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

/** 商品详情（按 goods_no 查 SKU，匿名可用） */
export const GOODS_DETAIL = `${BASE}/wechat/add_cart_goods_info`;

/**
 * 下单取商品规格（App 通道，登录态）
 *
 * 抓包 2.1 `cart/add_cart_goods_info`：返回 attribute[] 原始规格，
 * 是加购 selected 的构造原料。与 GOODS_DETAIL 响应结构一致，但下单链路必须用这个端点
 * 才能拿到与真机一致的完整规格字段。
 */
export const CART_GOODS_INFO = `${BASE}/cart/add_cart_goods_info`;

/** 购物车明细（按供应商分组）：cart_id 的唯一来源，抓包 2.6 */
export const CARTS_BY_SUPPLY = `${BASE}/cart/get_carts_by_supply`;

/** 算折 / 活动金额，抓包 2.7 */
export const CART_ACTIVITIES = `${BASE}/cart/activities`;

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

/** 订单列表（登录态；每页最多 10 条，无总数） */
export const ORDER_LIST = `${BASE}/order/get_order_list`;

/** 订单详情 */
export const ORDER_DETAIL = `${BASE}/order/get_order_detail_v2`;

/**
 * 待支付订单续期确认（抓包 1.1）
 *
 * 只传 order_sn，返回重新结算上下文：stock / default_address / order_remark /
 * pay_tool / express_options_v2 / cancel_expire / current_timestamp。
 */
export const ORDER_CONFIRM_WAIT_PAY = `${BASE}/order/confirm_wait_pay_order`;

/**
 * 重新提交待支付订单（抓包 1.4）
 *
 * 真正刷新支付有效期的一步：用 1.1 的实时上下文重新发起支付单，
 * 不新建订单、不扣款。参数由 renew.ts 的 buildReloadRequest 组装。
 */
export const ORDER_RELOAD_WAIT_PAY = `${BASE}/order/reload_wait_pay_order`;

/** 商品 H5 链接前缀 */
export const GOODS_URL_PREFIX = 'https://www.yishouapp.com/goods/';

/**
 * 当前用户信息
 *
 * 必须登录，且会校验 uid + token + udid 三元组；用于账号登录态自检。
 */
export const USER_INFO = `${BASE}/users/get_user_info`;
