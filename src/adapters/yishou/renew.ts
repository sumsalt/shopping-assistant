/**
 * 一手「待支付订单续期」协议层（抓包 1.1 / 1.4）
 *
 * 待支付订单有 20 分钟支付有效期，到期自动关闭。在 App「我的订单 → 去支付」
 * 重新提交支付单会顺延有效期，链路只有两步有数据依赖：
 *
 *   1.1 confirm_wait_pay_order(order_sn)
 *        返回重新结算上下文：stock[] / default_address / order_remark /
 *        pay_tool[] / express_options_v2[] / cancel_expire / current_timestamp
 *   1.4 reload_wait_pay_order(...)
 *        用 1.1 的实时上下文重新发起支付单，刷新有效期
 *
 * 抓包 1.2 get_order_advanced_check_list、1.3 check_piece_together_data 的结果
 * 都没有被 1.4 消费（1.4 传空 advanced_check_selected，selected 用固定
 * from=""/piece_together_num="0"），与下单链路重构的取舍一致，跳过。
 *
 * 与建单 2.15 的关系：1.4 的 selected 是同一套 sku 级 9 字段，
 * 直接复用 checkout.ts 的 buildCreateSelected / resolveSelectedExpress。
 * 差异仅在：rsa 来源是「我的订单页」而非「进货车」、不传 pay_id、
 * 多带 custom_note/sender_name/sender_tel、advanced_check_selected 固定空串。
 *
 * 本文件只做「原始响应 → 领域结果 / 协议句柄」与「协议句柄 → 请求参数」的纯转换，
 * 发请求、登录态校验、错误处理都在 order-api.ts。
 */

import type { WaitPayConfirmData, YishouAddress } from '../../types';
import type { YishouAddressRaw } from './mappers';
import { mapYishouAddress } from './mappers';
import {
  buildCreateSelected,
  resolveSelectedExpress,
  type YishouConfirmStockRaw,
  type YishouExpressOptionRaw,
} from './checkout';

// ==================== 原始响应类型 ====================

/** confirm_wait_pay_order 的 order_remark */
export interface YishouOrderRemarkRaw {
  custom_note?: string;
  sender_name?: string;
  sender_tel?: string;
  [key: string]: unknown;
}

/** confirm_wait_pay_order 响应 data（抓包 1.1） */
export interface YishouWaitPayConfirmRaw {
  stock?: YishouConfirmStockRaw[];
  default_address?: YishouAddressRaw;
  order_remark?: YishouOrderRemarkRaw;
  pay_tool?: Array<{ pay_tool?: string | number; [key: string]: unknown }>;
  express_options_v2?: YishouExpressOptionRaw[];
  /** 支付截止时间戳（秒级绝对值） */
  cancel_expire?: string | number;
  /** 服务端当前时间（秒级），与 cancel_expire 同源 */
  current_timestamp?: string | number;
  [key: string]: unknown;
}

/** reload_wait_pay_order 响应 data（抓包 1.4） */
export interface YishouReloadWaitPayRaw {
  order_sn?: string;
  pay_status?: string;
  order_amount?: string | number;
  cancel_expire?: string | number;
  /** 内部渠道码（实测 "12"），不是支付方式，别用它 */
  pay_tool?: string;
  /** 真正的支付方式（实测 "1"） */
  current_pay_tool?: string;
  trade_order_no?: string;
  pay_params?: string | Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * 不透明协议句柄：confirm 产出、reload 消费。
 * 编排层原样回传，不解读里面任何字段。
 */
export interface YishouRenewProtocol {
  orderSn: string;
  stock: YishouConfirmStockRaw[];
  selectedExpress: Array<{ origin: string; express_id: string }>;
  address: YishouAddress;
  orderRemark: { custom_note: string; sender_name: string; sender_tel: string };
  /** 1.1 可用支付方式里挑定的值，reload 时原样回传，编排层不参与 */
  payTool: string;
}

const EMPTY_ADDRESS: YishouAddress = {
  addressId: '',
  consignee: '',
  province: '',
  city: '',
  district: '',
  address: '',
  mobile: '',
  area: '',
};

// ==================== 埋点 / 固定参数 ====================

/**
 * reload_wait_pay_order 的 rsa 埋点（抓包 1.4）
 *
 * 与 buildRsa() 的差异只有 previous_vc_sorce：这里是「我的订单」发起的重新支付，
 * 建单是「进货车」。刻意并列两个函数，不改 buildRsa —— 建单的契约测试对旧值有精确断言。
 */
export const buildReloadRsa = (): string =>
  JSON.stringify({
    previous_vc_sorce: 'YiShou.MyOrderViewController',
    buy_channel: '支付页',
    system_os: 'APP',
    app_entrance: '支付页',
  });

/** reload_wait_pay_order 固定参数（抓包 1.4） */
export const RENEW_CONSTANTS = {
  /** 高级质检未勾选；抓包原文是两个换行，不是空数组 `[]` */
  advanced_check_selected: '[\n\n]',
  app_code: '0',
  is_balance_pay: '0',
  user_address_tag: '0',
} as const;

/** 从 confirm 的可用支付方式里挑一个；缺失时回落到抓包值「1」（支付宝） */
export const resolveRenewPayTool = (payTools: string[]): string => payTools[0] || '1';

// ==================== 响应 → 领域结果 / 协议句柄 ====================

const toPositiveNumber = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * 解析 1.1 响应
 *
 * remainingSeconds 用服务端自己的「cancel_expire - current_timestamp」计算，
 * 编排层据此复判是否进入 5 分钟窗口，避免本地时钟被篡改或漂移影响。
 */
export const parseWaitPayConfirm = (
  raw: YishouWaitPayConfirmRaw | null | undefined,
  orderSn: string
): WaitPayConfirmData => {
  const stock: YishouConfirmStockRaw[] = Array.isArray(raw?.stock) ? raw!.stock : [];
  const selectedExpress = resolveSelectedExpress(raw?.express_options_v2);
  const address = raw?.default_address ? mapYishouAddress(raw.default_address) : undefined;
  const payTools = (raw?.pay_tool || [])
    .map(item => String(item?.pay_tool ?? ''))
    .filter(Boolean);

  const cancelExpireSec = toPositiveNumber(raw?.cancel_expire);
  const currentTs = toPositiveNumber(raw?.current_timestamp);
  const cancelExpireAt = cancelExpireSec !== undefined ? cancelExpireSec * 1000 : undefined;
  const currentTimestamp = currentTs;
  const remainingSeconds =
    cancelExpireSec !== undefined && currentTs !== undefined
      ? cancelExpireSec - currentTs
      : undefined;

  const remark = raw?.order_remark ?? {};
  const protocol: YishouRenewProtocol = {
    orderSn,
    stock,
    selectedExpress,
    address: address ?? EMPTY_ADDRESS,
    orderRemark: {
      custom_note: String(remark.custom_note ?? ''),
      sender_name: String(remark.sender_name ?? ''),
      sender_tel: String(remark.sender_tel ?? ''),
    },
    payTool: resolveRenewPayTool(payTools),
  };

  return {
    orderSn,
    ...(cancelExpireAt !== undefined ? { cancelExpireAt } : {}),
    ...(currentTimestamp !== undefined ? { currentTimestamp } : {}),
    ...(remainingSeconds !== undefined ? { remainingSeconds } : {}),
    payTools,
    hasExpress: selectedExpress.length > 0,
    hasAddress: Boolean(address?.consignee && address?.address && address?.mobile),
    protocol,
  };
};

// ==================== 协议句柄 → 请求参数 ====================

/**
 * 组装 1.4 请求体（不含公共参数；uid/token/t_t/sign 由 YishouClient 注入）
 *
 * 严格按抓包发：selected 用建单同款 9 字段、selected_express 取 selected:"1" 的快递、
 * 地址与备注来自 1.1、固定常量；**不发 pay_id / rec_ids / is_df**（抓包没有）。
 */
export const buildReloadRequest = (ctx: YishouRenewProtocol): Record<string, string> => ({
  order_sn: ctx.orderSn,
  selected: buildCreateSelected(ctx.stock),
  selected_express: JSON.stringify(ctx.selectedExpress),
  rsa: buildReloadRsa(),
  ...RENEW_CONSTANTS,
  consignee: ctx.address.consignee,
  province: ctx.address.province,
  city: ctx.address.city,
  district: ctx.address.district,
  address: ctx.address.address,
  mobile: ctx.address.mobile,
  custom_note: ctx.orderRemark.custom_note,
  sender_name: ctx.orderRemark.sender_name,
  sender_tel: ctx.orderRemark.sender_tel,
  pay_tool: ctx.payTool,
});
