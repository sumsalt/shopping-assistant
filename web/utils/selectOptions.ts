/**
 * 下拉选项常量（价格监控 / 到货监控 / 订单续期共用）
 *
 * 统一放在这里，避免各对话框各写一份、时长档位逐渐漂移。
 */

/** 1 ~ 72 小时：价格监控与订单续期的时长档位 */
export const HOUR_DURATION_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 3600, label: '1 小时' },
  { value: 7200, label: '2 小时' },
  { value: 10800, label: '3 小时' },
  { value: 21600, label: '6 小时' },
  { value: 43200, label: '12 小时' },
  { value: 86400, label: '24 小时' },
  { value: 172800, label: '48 小时' },
  { value: 259200, label: '72 小时' },
]

/** 自动下单的支付方式：4 = 微信，1 = 支付宝 */
export const PAY_TOOL_OPTIONS: Array<{ value: '1' | '4'; label: string }> = [
  { value: '4', label: '微信' },
  { value: '1', label: '支付宝' },
]
