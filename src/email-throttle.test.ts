import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const sendMail = vi.fn()

vi.mock('nodemailer', () => ({
  createTransport: () => ({
    sendMail,
    verify: vi.fn().mockResolvedValue(true),
    close: vi.fn(),
  }),
}))

import {
  configureEmailService,
  configureEmailThrottle,
  getEmailThrottleOptions,
  resetEmailThrottle,
  sendEmail,
} from './email'

const config = {
  host: 'smtp.example.com',
  port: 465,
  user: 'helper@example.com',
  pass: 'secret',
}

const mail = (subject: string) => ({ to: 'someone@example.com', subject, text: 'x' })

describe('邮件发送节流', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sendMail.mockReset()
    sendMail.mockImplementation(async () => ({ messageId: 'm1', response: '250 OK' }))
    resetEmailThrottle()
    configureEmailService(config)
  })

  afterEach(() => {
    vi.useRealTimers()
    resetEmailThrottle()
  })

  it('默认参数为 6 秒间隔、每分钟 10 封', () => {
    expect(getEmailThrottleOptions()).toEqual({ minGapMs: 6000, perMinute: 10 })
  })

  it('环境变量可以覆盖默认值', () => {
    process.env.EMAIL_MIN_GAP_MS = '2000'
    process.env.EMAIL_PER_MINUTE = '5'
    try {
      expect(getEmailThrottleOptions()).toEqual({ minGapMs: 2000, perMinute: 5 })
    } finally {
      delete process.env.EMAIL_MIN_GAP_MS
      delete process.env.EMAIL_PER_MINUTE
    }
  })

  it('并发调用按最小间隔串行发送，不会同时登录 SMTP', async () => {
    configureEmailThrottle({ minGapMs: 1000, perMinute: 0 })

    const first = sendEmail(mail('1'))
    const second = sendEmail(mail('2'))

    await vi.advanceTimersByTimeAsync(0)
    expect(sendMail).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(999)
    expect(sendMail).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2)
    expect(sendMail).toHaveBeenCalledTimes(2)

    await Promise.all([first, second])
  })

  it('超过每分钟上限时排队到窗口滑出后再发', async () => {
    configureEmailThrottle({ minGapMs: 0, perMinute: 2 })

    const all = [sendEmail(mail('1')), sendEmail(mail('2')), sendEmail(mail('3'))]

    await vi.advanceTimersByTimeAsync(0)
    expect(sendMail).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(59_000)
    expect(sendMail).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(1_500)
    expect(sendMail).toHaveBeenCalledTimes(3)

    await Promise.all(all)
  })

  it('第一封失败不会卡住后续邮件', async () => {
    configureEmailThrottle({ minGapMs: 0, perMinute: 0 })
    sendMail.mockRejectedValueOnce(new Error('535 Login fail'))

    const results = await Promise.all([sendEmail(mail('1')), sendEmail(mail('2'))])

    expect(results[0].success).toBe(false)
    expect(results[0].error).toContain('535')
    expect(results[1].success).toBe(true)
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it('等待期间会输出节流日志，便于排查发信延迟', async () => {
    configureEmailThrottle({ minGapMs: 5000, perMinute: 0 })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const first = sendEmail(mail('1'))
    const second = sendEmail(mail('2'))
    await vi.advanceTimersByTimeAsync(6000)
    await Promise.all([first, second])

    expect(log.mock.calls.some(args => String(args[0]).includes('发信节流'))).toBe(true)
    log.mockRestore()
  })
})
