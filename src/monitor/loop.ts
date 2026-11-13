/**
 * 统一的监控循环骨架
 *
 * 四类监控的轮次体各不相同，但「取消 / 时长 / 间隔抖动 / 错误计数 / 进度回调」
 * 完全一致。这里只保留这一份实现，轮次体由调用方传入。
 *
 * 约定：
 * - runRound 抛错不会中断循环，除非 onError 返回 'fatal'
 * - shouldStop 在每轮前后各判断一次，命中即正常结束
 * - sleep 可被 AbortSignal 打断，进程退出不会被拖住
 */

export type LoopStopReason = 'abort' | 'duration' | 'done' | 'fatal'

export interface MonitorLoopOptions {
  signal: AbortSignal
  /** 轮次间隔（秒） */
  intervalSeconds: number
  /** 硬下限（秒），低于它的配置按它执行 */
  minIntervalSeconds?: number
  /** 总时长（秒）；不传表示不限时 */
  durationSeconds?: number
  /** 每轮额外随机抖动上限（毫秒），默认 0 */
  jitterMs?: number
  /** 是否已经完成（到货命中 / 已下单） */
  shouldStop?: () => boolean
  /** 执行一轮 */
  runRound: (round: number) => Promise<void> | void
  /** 轮次异常处理：返回 'fatal' 会向上抛出，由任务层标记 stopped */
  onError?: (error: unknown, round: number) => 'continue' | 'fatal' | void
  /** 每轮结束（成功或失败） */
  onRoundEnd?: (info: LoopRoundInfo) => void
  /** 每轮进度（睡眠前） */
  onProgress?: (info: LoopRoundInfo) => void
  /** 可注入，便于测试 */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  /** 时钟，便于测试 */
  now?: () => number
}

export interface LoopRoundInfo {
  round: number
  elapsedSeconds: number
}

export interface MonitorLoopResult {
  rounds: number
  stoppedBy: LoopStopReason
}

/** 可被取消打断的等待 */
export const sleepInterruptible = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise(resolve => {
    if (ms <= 0 || signal.aborted) return resolve()
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

export const runMonitorLoop = async (
  options: MonitorLoopOptions
): Promise<MonitorLoopResult> => {
  const {
    signal,
    minIntervalSeconds = 0,
    durationSeconds,
    jitterMs = 0,
    shouldStop,
    runRound,
    onError,
    onRoundEnd,
    onProgress,
    sleep = sleepInterruptible,
    now = Date.now,
  } = options

  if (!Number.isFinite(options.intervalSeconds) || options.intervalSeconds <= 0) {
    throw new Error('循环间隔时间必须大于 0')
  }
  if (durationSeconds !== undefined && durationSeconds <= 0) {
    throw new Error('循环总时长必须大于 0')
  }

  const interval = Math.max(minIntervalSeconds, options.intervalSeconds)
  const startTime = now()
  let round = 0

  while (!signal.aborted) {
    const elapsedSeconds = Math.floor((now() - startTime) / 1000)

    if (durationSeconds !== undefined && elapsedSeconds >= durationSeconds) {
      return { rounds: round, stoppedBy: 'duration' }
    }
    if (shouldStop?.()) {
      return { rounds: round, stoppedBy: 'done' }
    }

    round++

    try {
      await runRound(round)
    } catch (error) {
      const decision = onError?.(error, round)
      if (decision === 'fatal') {
        throw error
      }
    }

    onRoundEnd?.({ round, elapsedSeconds: Math.floor((now() - startTime) / 1000) })

    if (signal.aborted) break
    if (shouldStop?.()) return { rounds: round, stoppedBy: 'done' }

    onProgress?.({ round, elapsedSeconds: Math.floor((now() - startTime) / 1000) })

    const elapsedAfter = Math.floor((now() - startTime) / 1000)
    if (durationSeconds !== undefined && elapsedAfter + interval >= durationSeconds) {
      return { rounds: round, stoppedBy: 'duration' }
    }

    await sleep(interval * 1000 + Math.random() * jitterMs, signal)
  }

  return { rounds: round, stoppedBy: 'abort' }
}
