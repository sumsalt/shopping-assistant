import { describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref, watch } from 'vue'

// Nuxt 里这些是自动导入的全局函数，单测里补上
vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)

/** 模拟 config store：activeAccount 可变，用来复现「登录态异步到位」 */
const activeAccount = ref<{ hasCredential: boolean } | null>(null)

vi.stubGlobal('useConfigStore', () => ({
  get activeAccount() {
    return activeAccount.value
  },
}))

vi.stubGlobal('useToast', () => ({ success: () => {}, error: () => {}, warning: () => {} }))

const calls: string[] = []

vi.stubGlobal('$fetch', (url: string) => {
  calls.push(url)
  if (url.startsWith('/api/stock/skus/')) {
    return Promise.resolve({
      success: true,
      data: { skuList: [{ skuId: 'sku-1', color: '红', size: 'M', saleStock: 3 }] },
    })
  }
  if (url === '/api/order/addresses') {
    return Promise.resolve({
      success: true,
      data: {
        addresses: [
          { addressId: 'addr-1', consignee: '张三', mobile: '13800000000', area: '四川成都', address: '某路 1 号' },
        ],
      },
    })
  }
  return Promise.resolve({ success: false })
})

const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await nextTick()
    await new Promise(r => setTimeout(r, 0))
  }
}

const countOf = (prefix: string) => calls.filter(url => url.startsWith(prefix)).length

const makeForm = async () => {
  const { useAutoOrderForm } = await import('./useAutoOrderForm')
  return useAutoOrderForm({
    resolveProductNo: () => 'PN1',
    resolveProductId: () => 'PID1',
    withTrigger: true,
    defaultNum: 5,
    defaultEnabled: true,
    defaultMode: 'discount',
    defaultTargetDiscount: '2.1',
    isActive: () => true,
  })
}

describe('打开弹窗时自动下单数据预取', () => {
  it('首次打开：开关默认打开、按 2.1 折触发，并且地址与规格都拉取', async () => {
    activeAccount.value = { hasCredential: true }
    calls.length = 0
    const form = await makeForm()
    form.open()
    await flush()

    expect(form.autoOrderEnabled.value).toBe(true)
    expect(form.autoOrderMode.value).toBe('discount')
    expect(form.targetDiscountInput.value).toBe('2.1')
    expect(form.addresses.value.length).toBe(1)
    expect(form.skus.value.length).toBe(1)
  })

  it('第二次打开（开关本来就是开的状态）也要重新拉取', async () => {
    activeAccount.value = { hasCredential: true }
    calls.length = 0
    const form = await makeForm()
    form.open()
    await flush()
    expect(countOf('/api/order/addresses')).toBe(1)

    // 关闭再打开
    form.reset()
    await flush()

    expect(form.autoOrderEnabled.value).toBe(true)
    expect(form.addresses.value.length).toBe(1)
    expect(form.skus.value.length).toBe(1)
    expect(countOf('/api/order/addresses')).toBe(2)
    expect(countOf('/api/stock/skus/')).toBe(2)
  })

  it('登录态晚到：到齐后自动补开开关并拉取', async () => {
    activeAccount.value = null
    calls.length = 0
    const form = await makeForm()
    form.open()
    await flush()

    expect(form.autoOrderEnabled.value).toBe(false)
    expect(countOf('/api/order/addresses')).toBe(0)

    activeAccount.value = { hasCredential: true }
    await flush()

    expect(form.autoOrderEnabled.value).toBe(true)
    expect(form.addresses.value.length).toBe(1)
    expect(form.skus.value.length).toBe(1)
  })

  it('用户手动关掉后，登录态变化不会再强行打开', async () => {
    activeAccount.value = { hasCredential: true }
    const form = await makeForm()
    form.open()
    await flush()

    form.autoOrderEnabled.value = false
    await flush()

    activeAccount.value = null
    await flush()
    activeAccount.value = { hasCredential: true }
    await flush()

    expect(form.autoOrderEnabled.value).toBe(false)
  })

  it('到货监控（skusOnOpen）：没有登录态也读规格，只是不拉地址', async () => {
    activeAccount.value = null
    calls.length = 0
    const { useAutoOrderForm } = await import('./useAutoOrderForm')
    const form = useAutoOrderForm({
      resolveProductNo: () => 'PN1',
      resolveProductId: () => 'PID1',
      withTrigger: false,
      defaultNum: 5,
      defaultEnabled: false,
      defaultMode: 'discount',
      defaultTargetDiscount: '2.1',
      skusOnOpen: true,
      isActive: () => true,
    })
    form.open()
    await flush()

    expect(form.skus.value.length).toBe(1)
    expect(form.selectedSkus.value).toEqual([])
    expect(countOf('/api/stock/skus/')).toBe(1)
    expect(countOf('/api/order/addresses')).toBe(0)
  })
})
