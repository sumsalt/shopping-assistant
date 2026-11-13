import { describe, it, expect } from 'vitest'
import { createTabChangeTemplate } from './email'

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
  it('累计模式：两列表格 + 商品可点击 + schema + 无检测时间', () => {
    const info = {
      mode: 'accumulate' as const,
      newProducts: [mkProduct(1), mkProduct(2)],
      currentTotal: 10,
      seenTotal: 20,
    }
    const html = createTabChangeTemplate('TabA', info, '123')

    // 两列表格（邮件用 table 模拟页面 grid-cols-2）
    expect(html).toContain('role="presentation"')
    // 商品可点击跳转一手链接
    expect(html).toContain('https://www.goofish.com/item/1')
    expect(html).toContain('¥101.00')
    // schema.org 结构化操作，让邮件里可直接跳转
    expect(html).toContain('application/ld+json')
    expect(html).toContain('EmailMessage')
    expect(html).toContain('ViewAction')
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
    expect(html).not.toContain('https://www.goofish.com/item/50')
    // 前 50 个应出现
    expect(html).toContain('https://www.goofish.com/item/0')
    expect(html).toContain('https://www.goofish.com/item/49')
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
    // 新增与下架商品都展示
    expect(html).toContain('https://www.goofish.com/item/1')
    expect(html).toContain('https://www.goofish.com/item/2')
  })

  it('schema 在无商品链接时回退为空', () => {
    const info = {
      mode: 'accumulate' as const,
      newProducts: [{ ...mkProduct(1), productUrl: '' }],
      currentTotal: 1,
      seenTotal: 1,
    }
    const html = createTabChangeTemplate('TabA', info, '123')
    expect(html).not.toContain('application/ld+json')
  })
})
