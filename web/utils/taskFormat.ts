/**
 * 任务展示格式化
 *
 * 三类任务卡片用的是同一套状态文案与时间格式，之前各写一遍且实现略有差异。
 */

const STATUS_TEXT: Record<string, string> = {
  running: '监控中',
  stopped: '已停止',
  completed: '已完成',
}

const STATUS_COLOR: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  running: 'info',
  stopped: 'default',
  completed: 'success',
}

export const getStatusText = (status: string): string => STATUS_TEXT[status] || status

export const getStatusColor = (
  status: string
): 'default' | 'success' | 'warning' | 'danger' | 'info' => STATUS_COLOR[status] || 'default'

/** 相对时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / 日期 */
export const formatTime = (date: string | number | Date): string => {
  const target = new Date(date)
  const diff = Date.now() - target.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return target.toLocaleDateString('zh-CN')
}

/** 秒数转可读时长：自动选秒 / 分钟 / 小时 / 天 */
export const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '不限时'
  if (seconds < 60) return `${Math.round(seconds)} 秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)} 分钟`
  if (seconds < 86400) {
    const hours = seconds / 3600
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`
  }

  const days = Math.floor(seconds / 86400)
  const restHours = Math.round((seconds - days * 86400) / 3600)
  return restHours > 0 ? `${days} 天 ${restHours} 小时` : `${days} 天`
}

/** 金额：¥59.81 */
export const formatAmount = (amount?: number): string => {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '-'
  return `¥${amount.toFixed(2)}`
}

/** 支付截止时间：MM-DD HH:mm */
export const formatExpire = (expireAt?: number): string => {
  if (!expireAt) return ''
  const date = new Date(expireAt)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 剩余秒数 → 倒计时：02:34 / 1:02:03；已过期返回「已超时」 */
export const formatRemaining = (seconds: number): string => {
  if (seconds <= 0) return '已超时'
  const pad = (value: number) => String(value).padStart(2, '0')
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = Math.floor(seconds % 60)
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`
}
