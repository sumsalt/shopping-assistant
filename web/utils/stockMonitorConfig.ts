/**
 * 到货监控配置的纯转换逻辑（不依赖 Nuxt，便于单测）
 *
 * 自动下单只是到货监控的一个可选开关：
 * - 关闭：只发到货邮件，不带 autoOrder 字段，服务端走匿名检测桶
 * - 开启：携带下单参数，服务端要求 uid + token 并走登录态
 */

/** 默认监控时长（秒）：24 小时，与价格监控保持一致 */
export const DEFAULT_STOCK_MONITOR_DURATION = 24 * 60 * 60

/** 可选的监控时长 */
export const STOCK_MONITOR_DURATION_OPTIONS = [
  { value: 3600, label: '1 小时' },
  { value: 7200, label: '2 小时' },
  { value: 21600, label: '6 小时' },
  { value: 43200, label: '12 小时' },
  { value: 86400, label: '24 小时' },
  { value: 172800, label: '48 小时' },
  { value: 259200, label: '72 小时' },
  { value: 604800, label: '7 天' },
] as const

/** 表单里的值 */
export interface StockMonitorFormValues {
  duration: number
  autoOrderEnabled: boolean
  num: number
  payTool: '1' | '4'
  addressId?: string
  /** 只监控这些规格（skuId）；空表示全部规格 */
  skus?: string[]
}

/** 提交给 useMonitor / 创建接口的配置 */
export interface StockMonitorPayload {
  duration: number
  /** 只监控这些规格（skuId）；不传表示全部规格 */
  skus?: string[]
  autoOrder?: {
    enabled: true
    num: number
    payTool: '1' | '4'
    addressId?: string
  }
}

/**
 * 表单值 → 创建任务配置
 *
 * 普通到货监控刻意不写入 autoOrder 字段，避免服务端与任务列表把它误判成下单任务。
 */
export const buildStockMonitorConfig = (
  values: StockMonitorFormValues
): StockMonitorPayload => {
  const config: StockMonitorPayload = {
    duration:
      Number.isFinite(values.duration) && values.duration > 0
        ? values.duration
        : DEFAULT_STOCK_MONITOR_DURATION,
  }

  // 不选规格表示监控全部；选了就只在这些规格里判断到货与下单
  const skus = [...new Set((values.skus || []).map(item => item.trim()).filter(Boolean))]
  if (skus.length > 0) {
    config.skus = skus
  }

  if (values.autoOrderEnabled) {
    config.autoOrder = {
      enabled: true,
      num: Math.max(1, Math.min(99, Math.floor(values.num) || 1)),
      payTool: values.payTool === '1' ? '1' : '4',
      ...(values.addressId ? { addressId: values.addressId } : {}),
    }
  }

  return config
}

/**
 * 时长按天 / 小时 / 分钟自适应显示，避免任务列表出现「604800 秒」这种数字。
 */
export const formatMonitorDuration = (seconds?: number): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return '不限时长'
  }
  if (seconds % 86400 === 0) {
    return `${seconds / 86400} 天`
  }
  if (seconds % 3600 === 0) {
    return `${seconds / 3600} 小时`
  }
  if (seconds % 60 === 0) {
    return `${seconds / 60} 分钟`
  }
  return `${seconds} 秒`
}
