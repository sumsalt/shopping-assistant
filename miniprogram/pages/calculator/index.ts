// pages/calculator/index.ts
import { OrderPoolingSolver } from '@shared/OrderPoolingSolver'
import type { OrderItem } from '@shared/OrderPoolingSolver'

interface ItemData {
  price: string
  required: boolean
}

interface ResultData {
  selectedItems: OrderItem[]
  totalPrice: string
  orderCount: number
  orders: Array<{
    items: OrderItem[]
    total: string
  }>
  unusedItems: number
  allSolutions: Array<{
    items: OrderItem[]
    orders: Array<{
      items: OrderItem[]
      total: string
    }>
    totalPrice: string
    orderCount: number
  }>
}

interface PageData {
  bulkInput: string
  items: ItemData[]
  targetPrice: string
  targetQuantity: string
  result: ResultData | null
  hasCalculated: boolean
  validItemCount: number
  totalPrice: string
  meetsRequirements: boolean
  priceDiff: number
  quantityDiff: number
}

Page<PageData, WechatMiniprogram.Page.CustomOption>({
  data: {
    bulkInput: '',
    items: [
      { price: '', required: false },
      { price: '', required: false },
      { price: '', required: false }
    ],
    targetPrice: '',
    targetQuantity: '1',
    result: null,
    hasCalculated: false,
    validItemCount: 0,
    totalPrice: '0.00',
    meetsRequirements: false,
    priceDiff: 0,
    quantityDiff: 0
  },

  // 批量输入变化
  onBulkInputChange(e: WechatMiniprogram.Input) {
    const value = e.detail.value
    this.data.bulkInput = value

    // 处理批量输入
    const input = value.trim()
    if (!input) {
      return
    }

    // 支持逗号（中英文）和空格分隔
    const prices = input
      .split(/[,，\s]+/)
      .map(p => parseFloat(p))
      .filter(p => !isNaN(p) && p > 0)

    if (prices.length > 0) {
      // 将解析出的价格填充到 items
      this.setData({
        items: prices.map(price => ({ price: price.toString(), required: false })),
        bulkInput: ''
      })
      this.updateStats()
      wx.showToast({
        title: `已添加 ${prices.length} 个商品`,
        icon: 'success'
      })
    }
  },

  // 商品价格变化
  onItemPriceChange(e: WechatMiniprogram.CustomEvent) {
    const index = Number((e.currentTarget as any).dataset.index)
    const value = (e.detail as string).toString()
    this.data.items[index].price = value
    this.updateStats()
  },

  // 切换必选状态
  toggleRequired(e: WechatMiniprogram.CustomEvent) {
    const index = Number((e.currentTarget as any).dataset.index)
    this.data.items[index].required = !this.data.items[index].required
    this.setData({
      items: this.data.items
    })
  },

  // 凑单价格变化
  onTargetPriceChange(e: WechatMiniprogram.Input) {
    this.setData({
      targetPrice: e.detail.value
    })
    this.updateStats()
  },

  // 凑单数量变化
  onTargetQuantityChange(e: WechatMiniprogram.Input) {
    this.setData({
      targetQuantity: e.detail.value
    })
    this.updateStats()
  },

  // 添加商品
  addItem() {
    const items = [...this.data.items, { price: '', required: false }]
    this.setData({ items })
  },

  // 移除商品
  removeItem(e: WechatMiniprogram.CustomEvent) {
    const index = Number((e.currentTarget as any).dataset.index)
    if (this.data.items.length > 1) {
      const items = this.data.items.filter((_, i) => i !== index)
      this.setData({ items })
      this.updateStats()
    }
  },

  // 更新统计信息
  updateStats() {
    const validItems = this.data.items.filter(item => {
      const price = parseFloat(item.price)
      return !isNaN(price) && price > 0
    })

    const validItemCount = validItems.length
    const totalPrice = validItems.reduce((sum, item) => sum + parseFloat(item.price), 0)
    const target = parseFloat(this.data.targetPrice)
    const qty = parseInt(this.data.targetQuantity) || 1

    const meetsRequirements = target > 0 && totalPrice >= target * qty && validItemCount >= qty
    const priceDiff = target > 0 ? totalPrice - target * qty : 0
    const quantityDiff = validItemCount - qty

    this.setData({
      validItemCount,
      totalPrice: totalPrice.toFixed(2),
      meetsRequirements,
      priceDiff,
      quantityDiff
    })
  },

  // 计算凑单方案
  calculate() {
    // 获取有效的商品价格
    const validItems: OrderItem[] = this.data.items
      .map((item, index) => ({
        id: index,
        name: `商品 ${index + 1}`,
        price: parseFloat(item.price),
        required: item.required
      }))
      .filter(item => !isNaN(item.price) && item.price > 0)

    if (validItems.length === 0) {
      wx.showToast({
        title: '请至少输入一个有效的商品价格',
        icon: 'none'
      })
      return
    }

    const target = parseFloat(this.data.targetPrice)
    if (isNaN(target) || target <= 0) {
      wx.showToast({
        title: '请输入有效的凑单价格',
        icon: 'none'
      })
      return
    }

    const targetQty = parseInt(this.data.targetQuantity) || 1

    // 检查是否有足够的商品总价值
    const totalValue = validItems.reduce((sum, item) => sum + item.price, 0)
    const minValueNeeded = target * targetQty

    if (totalValue < minValueNeeded) {
      wx.showToast({
        title: `商品总价 ¥${totalValue.toFixed(2)} 不足以凑满 ${targetQty} 个订单`,
        icon: 'none',
        duration: 3000
      })
      this.setData({
        result: null,
        hasCalculated: true
      })
      return
    }

    wx.showLoading({
      title: '计算中...'
    })

    setTimeout(() => {
      try {
        // 使用算法类计算
        const solver = new OrderPoolingSolver(validItems, target, targetQty)
        const calculationResult = solver.solve()

        if (!calculationResult.best) {
          const requiredItems = validItems.filter(item => item.required)
          const requiredTotal = requiredItems.reduce((sum, item) => sum + item.price, 0)

          if (requiredItems.length > 0) {
            wx.showToast({
              title: `无法凑单：必选商品 ${requiredItems.length} 件`,
              icon: 'none',
              duration: 3000
            })
          } else {
            wx.showToast({
              title: '无法凑单，请检查商品组合',
              icon: 'none'
            })
          }

          this.setData({
            result: null,
            hasCalculated: true
          })
          wx.hideLoading()
          return
        }

        // 转换结果格式
        const bestSolution = calculationResult.best
        const allSolutions = [bestSolution, ...calculationResult.alternatives]

        const result: ResultData = {
          selectedItems: bestSolution.orders.flatMap(order => order.items),
          totalPrice: bestSolution.totalPrice.toFixed(2),
          orderCount: bestSolution.orders.length,
          orders: bestSolution.orders.map(order => ({
            items: order.items,
            total: order.subtotal.toFixed(2)
          })),
          unusedItems: bestSolution.unusedItems.length,
          allSolutions: allSolutions.map(sol => ({
            items: sol.orders.flatMap(order => order.items),
            orders: sol.orders.map(order => ({
              items: order.items,
              total: order.subtotal.toFixed(2)
            })),
            totalPrice: sol.totalPrice.toFixed(2),
            orderCount: sol.orders.length
          }))
        }

        this.setData({
          result,
          hasCalculated: true
        })

        wx.showToast({
          title: `找到 ${allSolutions.length} 种凑单方案`,
          icon: 'success'
        })
      } catch (error) {
        console.error('计算失败:', error)
        wx.showToast({
          title: '计算失败，请重试',
          icon: 'none'
        })
      }

      wx.hideLoading()
    }, 100)
  }
})
