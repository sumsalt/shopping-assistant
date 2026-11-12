/**
 * 一手下单「协议层」：selected 构造 + 原始响应类型 + 埋点 ID
 *
 * 抓包（2.1~2.15）还原的真实下单链路里，四个接口的 selected 结构各不相同，
 * 且 cart_id 是贯穿结算/建单的关键枢纽——它只能来自 get_carts_by_supply 的 detail[]：
 *
 *   add_goods_to_cart   按颜色分组，item 复用 add_cart_goods_info 的原始规格，只覆盖 num
 *   cart/activities     按商品分组，detail 带 cart_id
 *   confirm_order_v4    sku 级明细，带 cart_id
 *   create_order_v4     sku 级明细，带 from/piece_together_num，不带 cart_id
 *
 * 这些协议细节全部收敛在本文件的纯函数里，order-api.ts 只负责「发请求 + 调用构造器」，
 * auto-order.ts（编排层）完全不接触 selected / cart_id / express，只表达「买哪些规格、几件」。
 *
 * 【对齐抓包的接口取舍】
 * 必要：add_cart_goods_info → add_goods_to_cart → get_carts_by_supply
 *       → cart/activities → confirm_order_v4 → create_order_v4
 * 跳过（无数据依赖 / 纯展示 / 拼单增值）：goods_activities、get_add_cart_recommend、
 *       Goods/get_cart_recommend、get_carts_filter、get_pinkage_activity、
 *       get_order_advanced_check_list、piece_together/*、重复的 add_cart_goods_info。
 *       这些接口的结果不被后续任何一步消费，跳过不影响建单正确性。
 */

import type { CheckoutLine, CheckoutSettledItem, YishouAddress } from '../../types';

// ==================== 原始响应类型（只声明链路真正读取的字段） ====================

/** add_cart_goods_info 的 attribute[].item[]：一个尺码规格的原始结构 */
export interface YishouCartSkuRaw {
  sku: string;
  size: string;
  num: string;
  stock: number | string;
  sale_stock: number | string;
  [key: string]: unknown;
}

/** add_cart_goods_info 的 attribute[]：按颜色分组 */
export interface YishouCartColorRaw {
  color: string;
  color_id: string;
  is_recommend: string;
  item: YishouCartSkuRaw[];
  [key: string]: unknown;
}

/** add_cart_goods_info 响应 data */
export interface YishouCartGoodsInfoRaw {
  goods_id: string;
  goods_no: string;
  shop_price: string;
  attribute: YishouCartColorRaw[];
  [key: string]: unknown;
}

/** get_carts_by_supply 的 detail[]：购物车里的一行规格（cart_id 的唯一来源） */
export interface YishouCartLineRaw {
  cart_id: string;
  sku: string;
  color: string;
  size: string;
  num: string;
  goods_id: string;
  is_alone: string;
  is_stock_now: string;
  sku_tag: string;
  sale_stock_now: string;
  color_style_id: string;
  color_style_name: string;
  color_style_icon: string;
  ys_instock_num: string;
  sale_stock: string;
  add_cart_id: string;
  shop_price: string;
  [key: string]: unknown;
}

/** get_carts_by_supply 的 in_stock.group_data[].stock_data[].item[]：一个购物车商品 */
export interface YishouCartGroupItemRaw {
  goods_id: string;
  goods_no: string;
  rec_id: string;
  origin: string;
  special_id: string;
  price_total: string;
  total: string;
  is_goods_in_stock: string;
  is_new_goods: string;
  is_goods_original_price: string;
  detail: YishouCartLineRaw[];
  cart_ids: string[];
  [key: string]: unknown;
}

/** get_carts_by_supply 响应 data */
export interface YishouCartsBySupplyRaw {
  in_stock?: {
    group_data?: Array<{ stock_data?: Array<{ item?: YishouCartGroupItemRaw[] }> }>;
  };
  [key: string]: unknown;
}

/** confirm_order_v4 返回的 stock[]：真正会写进订单的行 */
export interface YishouConfirmStockRaw {
  cart_id?: string;
  sku: string;
  color: string;
  size: string;
  num: string;
  goods_id: string;
  is_stock_now: string;
  ys_instock_num: string;
  [key: string]: unknown;
}

/** confirm_order_v4 的 express_options_v2[].express_list[] */
export interface YishouExpressOptionRaw {
  origin: number | string;
  express_list?: Array<{ express_id?: string; selected?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** confirm_order_v4 响应 data */
export interface YishouConfirmRaw {
  stock?: YishouConfirmStockRaw[];
  out_stock?: YishouConfirmStockRaw[];
  /** 一手把 total 拼成了 tolal，这里两个都读 */
  price_tolal?: string;
  goods_amount_total?: string;
  shipping_fee?: string;
  shipping_fee_total?: string;
  num_total?: string | number;
  pay_tool?: Array<{ pay_tool?: string | number; [key: string]: unknown }>;
  express_options_v2?: YishouExpressOptionRaw[];
  default_address?: Record<string, unknown>;
  [key: string]: unknown;
}

/** cart/activities 响应里链路关心的字段 */
export interface YishouCartActivitiesRaw {
  order_amount?: string;
  discount_amount?: string;
  goods_amount_total?: string;
  [key: string]: unknown;
}

// ==================== selected 构造（严格对齐抓包） ====================

/**
 * 加购 selected（抓包 2.3）
 *
 * 按颜色分组，item 直接用 add_cart_goods_info 返回的原始规格（服务端认这套完整字段），
 * 只把选中 SKU 的 num 覆盖成实际件数；未选中的规格与颜色组全部剔除。
 * 颜色组的 is_recommend 固定 "0"（抓包值）。
 */
export const buildAddCartSelected = (
  attributes: YishouCartColorRaw[],
  lines: CheckoutLine[]
): string => {
  const wanted = new Map(lines.map(line => [String(line.sku), line.num]));
  const groups: Array<Record<string, unknown>> = [];

  for (const color of attributes || []) {
    const items = (color.item || [])
      .filter(item => wanted.has(String(item.sku)))
      .map(item => ({ ...item, num: String(wanted.get(String(item.sku))) }));
    if (items.length > 0) {
      groups.push({ color: color.color, is_recommend: '0', item: items });
    }
  }

  return JSON.stringify(groups);
};

/** 从 get_carts_by_supply 里挑出本次加购商品（按 rec_id + goods_id/goods_no 定位） */
export const pickCartGroup = (
  data: YishouCartsBySupplyRaw,
  filter: { recId: string; goodsId: string; goodsNo: string }
): YishouCartGroupItemRaw | null => {
  for (const group of data?.in_stock?.group_data || []) {
    for (const stockData of group.stock_data || []) {
      for (const item of stockData.item || []) {
        const sameGoods =
          String(item.goods_id ?? '') === filter.goodsId ||
          String(item.goods_no ?? '') === filter.goodsNo;
        if (String(item.rec_id ?? '') === filter.recId && sameGoods) {
          return item;
        }
      }
    }
  }
  return null;
};

/**
 * 只保留本次要买的规格行
 *
 * 购物车里可能有上一轮没清掉的条目，用选中 SKU 集合过滤，避免把残留规格算进订单。
 */
export const pickCartLines = (
  group: YishouCartGroupItemRaw,
  lines: CheckoutLine[]
): YishouCartLineRaw[] => {
  const wanted = new Set(lines.map(line => String(line.sku)));
  return (group.detail || []).filter(line => wanted.has(String(line.sku)));
};

/** 算折 select_goods（抓包 2.7）：按商品分组，detail 带 cart_id */
export const buildSelectGoods = (
  group: YishouCartGroupItemRaw,
  cartLines: YishouCartLineRaw[],
  addCartId: string
): string => {
  const detail = cartLines.map(line => ({
    add_cart_id: addCartId,
    shop_price: String(line.shop_price ?? ''),
    is_alone: String(line.is_alone ?? '0'),
    sku: String(line.sku ?? ''),
    sku_tag: String(line.sku_tag ?? ''),
    color: String(line.color ?? ''),
    size: String(line.size ?? ''),
    is_stock_now: String(line.is_stock_now ?? '0'),
    num: String(line.num ?? ''),
    cart_id: String(line.cart_id ?? ''),
    color_style_name: String(line.color_style_name ?? ''),
    goods_id: String(line.goods_id ?? ''),
    color_style_icon: String(line.color_style_icon ?? ''),
    sale_stock_now: String(line.sale_stock_now ?? ''),
    color_style_id: String(line.color_style_id ?? ''),
    ys_instock_num: String(line.ys_instock_num ?? ''),
    sale_stock: String(line.sale_stock ?? ''),
  }));

  return JSON.stringify([
    {
      number: String(group.total ?? detail.reduce((sum, d) => sum + Number(d.num || 0), 0)),
      is_original_price: String(group.is_goods_original_price ?? '0'),
      is_goods_in_stock: String(group.is_goods_in_stock ?? '1'),
      detail,
      buy_price: String(group.price_total ?? ''),
      presale_discount_total: '',
      special_id: String(group.special_id ?? ''),
      is_new_goods: String(group.is_new_goods ?? '0'),
      goods_id: String(group.goods_id ?? ''),
    },
  ]);
};

/** 结算 selected（抓包 2.11）：sku 级明细，必须带真实 cart_id */
export const buildConfirmSelected = (cartLines: YishouCartLineRaw[]): string =>
  JSON.stringify(
    cartLines.map(line => ({
      ys_instock_num: String(line.ys_instock_num ?? '1'),
      color: String(line.color ?? ''),
      sku: String(line.sku ?? ''),
      size: String(line.size ?? ''),
      cart_id: String(line.cart_id ?? ''),
      num: String(line.num ?? ''),
      is_stock_now: String(line.is_stock_now ?? '0'),
      goods_id: String(line.goods_id ?? ''),
    }))
  );

/**
 * 建单 selected（抓包 2.15）
 *
 * 与结算的差异：去掉 cart_id，补 from=""/piece_together_num="0"（跳过拼单接口后的固定值）。
 * 来源用 confirm 返回的 stock——库存削减后以结算认可的明细为准。
 */
export const buildCreateSelected = (stock: YishouConfirmStockRaw[]): string =>
  JSON.stringify(
    stock.map(item => ({
      from: '',
      color: String(item.color ?? ''),
      ys_instock_num: String(item.ys_instock_num ?? '1'),
      sku: String(item.sku ?? ''),
      piece_together_num: '0',
      size: String(item.size ?? ''),
      num: String(item.num ?? ''),
      is_stock_now: String(item.is_stock_now ?? '0'),
      goods_id: String(item.goods_id ?? ''),
    }))
  );

/**
 * selected_express（抓包 2.15）
 *
 * 从 confirm 的 express_options_v2 里取所有 selected:"1" 的快递，
 * 组回 [{origin, express_id}]；抓包里是杭州仓的「平台匹配快递」9999。
 */
export const resolveSelectedExpress = (
  options: YishouExpressOptionRaw[] | undefined
): Array<{ origin: string; express_id: string }> => {
  const result: Array<{ origin: string; express_id: string }> = [];
  for (const group of options || []) {
    for (const express of group.express_list || []) {
      if (String(express.selected ?? '') === '1' && express.express_id) {
        result.push({ origin: String(group.origin ?? ''), express_id: String(express.express_id) });
      }
    }
  }
  return result;
};

// ==================== 埋点 / 幂等 ID（对齐抓包形态） ====================

/** `${uid}_${秒级时间戳}`：add_cart_id / pay_id 用（抓包 2.3 / 2.15） */
export const buildTrackingId = (uid: string, seconds: number): string => `${uid}_${seconds}`;

/** `${uid}_${毫秒时间戳}`：event_id / landing_event_id 用（抓包 2.3） */
export const buildEventId = (uid: string, millis: number): string => `${uid}_${millis}`;

/** create_order_v4 的 rsa 埋点（抓包 2.15，固定文案） */
export const buildRsa = (): string =>
  JSON.stringify({
    previous_vc_sorce: '进货车',
    buy_channel: '支付页',
    system_os: 'APP',
    app_entrance: '支付页',
  });

/** add_goods_to_cart 加购来源参数（抓包 2.3） */
export const CART_ADD_SOURCE = {
  is_select_refund_insurance: '2',
  is_select_super_refund_insurance: '2',
  source: '3',
  sources: '3',
  position: '1',
  ss_type: '0',
} as const;

/** create_order_v4 固定参数（抓包 2.15） */
export const CREATE_ORDER_CONSTANTS = {
  is_balance_pay: '0',
  user_address_tag: '0',
} as const;

/** 结算响应 → 编排层的明细（sku + 件数） */
export const toSettledItems = (stock: YishouConfirmStockRaw[]): CheckoutSettledItem[] =>
  stock
    .map(item => ({ sku: String(item.sku ?? '').trim(), num: Number.parseInt(String(item.num ?? ''), 10) }))
    .filter(item => item.sku && Number.isFinite(item.num) && item.num > 0);

/** 结算明细里的实际总件数：优先 num_total，缺失时累加 stock[].num */
export const resolveSettledNum = (raw: YishouConfirmRaw, stock: YishouConfirmStockRaw[]): number => {
  const total = Number(raw.num_total);
  if (Number.isFinite(total) && total > 0) return total;
  return stock.reduce((sum, item) => sum + (Number.parseInt(String(item.num ?? ''), 10) || 0), 0);
};

/**
 * 不透明协议上下文：prepareCheckout 产出，createOrder / discardCheckout 消费。
 * 编排层原样透传，不解读。
 */
export interface YishouCheckoutProtocol {
  /** 加购返回的购物车商品级 ID（= goods_no），confirm / create / del_cart 都传它 */
  recIds: string;
  goodsId: string;
  goodsNo: string;
  /** 结算确认的 stock，建单 selected 来源 */
  stock: YishouConfirmStockRaw[];
  /** 选定的快递（confirm 的 express_options_v2） */
  selectedExpress: Array<{ origin: string; express_id: string }>;
  /** 结算认可的收货地址 */
  address: YishouAddress;
  /** `${uid}_秒` 幂等 ID，create 的 pay_id */
  payId: string;
  /** 登录 uid，用于埋点 */
  uid: string;
}
