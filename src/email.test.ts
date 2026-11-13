import { describe, it, expect } from 'vitest'
import { createTabChangeTemplate, createRenewEndingSoonTemplate } from './email'

const mkProduct = (i: number) => ({
  productId: `p${i}`,
  productName: `商品${i}`,
  price: 100 + i,
  productUrl: `https://www.goofish.com/item/${i}`,
  productImage: `https://img.example.com/${i}.jpg`,
  brandName: `店铺${i}`,
  marketName: `市场${i}`,
})

describe('createTabChangeTemplate - 两列布局 / 上限50 / schema / 无时间', () => {
  it('累计模式：两列表格 + 商品点击唤起一手 App 深链 + schema + 无检测时间', () => {
    const info = {
      mode: 'accumulate' as const,
      newProducts: [mkProduct(1), mkProduct(2)],
      currentTotal: 10,
      seenTotal: 20,
    }
    const html = createTabChangeTemplate('TabA', info, '123')

    // 两列表格（邮件用 table 模拟页面 grid-cols-2）
    expect(html).toContain('role="presentation"')
    // 商品点击唤起一手 App（与页面手机端同一条深链），不再跳 H5 网页
    expect(html).toContain('yishou://fmkj/openyishou')
    expect(html).toContain('p1')
    expect(html).not.toContain('goofish.com')
    expect(html).toContain('¥101.00')
    // schema.org 结构化操作，跳转到一手 App 深链
    expect(html).toContain('application/ld+json')
    expect(html).toContain('EmailMessage')
    expect(html).toContain('ViewAction')
    expect(html).toContain('"@type":"ViewAction"')
    // 邮箱不再展示检测时间
    expect(html).not.toContain('检测时间')
  })

  it('累计模式：超过 50 个时截断并提示剩余', () => {
    const info = {
      mode: 'accumulate' as const,
      newProducts: Array.from({ length: 60 }, (_, i) => mkProduct(i)),
      currentTotal: 60,
      seenTotal: 60,
    }
    const html = createTabChangeTemplate('TabA', info, '123')

    expect(html).toContain('还有 10 个新商品')
    // 第 51 个（下标 50）不应出现
    expect(html).not.toContain('p50')
    // 前 50 个应出现
    expect(html).toContain('p0')
    expect(html).toContain('p49')
    // 全部使用一手 App 深链，不含 H5 链接
    expect(html).toContain('yishou://fmkj/openyishou')
    expect(html).not.toContain('goofish.com')
  })

  it('对比模式：新增与下架两组、各自两列、schema、无检测时间', () => {
    const info = {
      mode: 'diff' as const,
      changeType: 'both' as const,
      previousTotal: 5,
      currentTotal: 8,
      newProducts: [mkProduct(1)],
      removedProducts: [mkProduct(2)],
    }
    const html = createTabChangeTemplate('TabA', info, '123')

    expect(html).toContain('role="presentation"')
    expect(html).toContain('application/ld+json')
    expect(html).toContain('EmailMessage')
    expect(html).not.toContain('检测时间')
    // 新增与下架商品都展示，且都唤起一手 App
    expect(html).toContain('p1')
    expect(html).toContain('p2')
    expect(html).toContain('yishou://fmkj/openyishou')
  })

  it('schema 的 ViewAction 指向一手 App 深链', () => {
    const info = {
      mode: 'accumulate' as const,
      newProducts: [mkProduct(1)],
      currentTotal: 1,
      seenTotal: 1,
    }
    const html = createTabChangeTemplate('TabA', info, '123')
    expect(html).toContain('application/ld+json')
    expect(html).toContain('"@type":"ViewAction"')
    expect(html).toContain('yishou://fmkj/openyishou')
  })
})

describe('createTabChangeTemplate - 手机端版式（窄留白 / 固定图高 / 字号）', () => {
  const info = {
    mode: 'accumulate' as const,
    newProducts: [mkProduct(1), mkProduct(2)],
    currentTotal: 2,
    seenTotal: 2,
  }

  it('主体限宽 640、左右留白压到最小（不再用 800 + 30px 内层 padding）', () => {
    const html = createTabChangeTemplate('TabA', info, '123')
    expect(html).toContain('max-width:640px')
    expect(html).not.toContain('max-width: 800px')
    expect(html).not.toContain('padding: 30px')
    // 卡片间距用 cellspacing（td 加 padding 会撑破 50% 宽度导致两列溢出）
    expect(html).toContain('cellspacing="6"')
  })

  it('商品图固定高度，避免竖长图在客户端里被拉成长条', () => {
    const html = createTabChangeTemplate('TabA', info, '123')
    expect(html).toContain(`height:190px`)
    expect(html).toContain('object-fit:cover')
    // aspect-ratio 在 Gmail 等客户端不生效，不再依赖
    expect(html).not.toContain('aspect-ratio')
  })

  it('标题与正文字号明确设值（不再依赖 h1/h3 默认大小）', () => {
    const html = createTabChangeTemplate('TabA', info, '123')
    expect(html).toContain('font-size:17px')
    expect(html).not.toContain('<h1>')
    expect(html).not.toContain('<h3')
  })
})

describe('createRenewEndingSoonTemplate - 自动续期结束前提醒', () => {
  const params = {
    accountName: '测试账号 13800000000',
    endsAt: new Date('2026-11-14T12:00:00+08:00').getTime(),
    durationHours: 12,
    checkCount: 700,
    renewedCount: 23,
    finishedCount: 2,
  }

  it('包含结束提示、结束时间、账号与累计统计', () => {
    const html = createRenewEndingSoonTemplate(params)
    expect(html).toContain('订单自动续期即将结束')
    expect(html).toContain('10 分钟后')
    expect(html).toMatch(/结束时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
    expect(html).toContain('测试账号 13800000000')
    expect(html).toContain('12 小时')
    expect(html).toContain('700 轮')
    expect(html).toContain('23 次')
    expect(html).toContain('2 笔')
    expect(html).toContain('不再自动刷新待付款订单的有效期')
  })

  it('按钮唤起一手 App，并对账号备注做 HTML 转义', () => {
    const html = createRenewEndingSoonTemplate({
      ...params,
      accountName: '<script>alert(1)</script> & "备注"',
    })
    expect(html).toContain('yishou://fmkj/openyishou')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&amp;')
  })
})
