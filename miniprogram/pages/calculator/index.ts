// pages/calculator/index.ts
import { OrderPoolingSolver } from '../../OrderPoolingSolver'
import type { OrderItem } from '../../OrderPoolingSolver'

interface ItemData {
  name: string
  price: string
  required: boolean
}

interface Solution {
  items: OrderItem[]
  orders: Array<{
    items: OrderItem[]
    total: string
  }>
  totalPrice: string
  orderCount: number
  priceDiff: string
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
  priceDiff: string
  quantityDiff: number
  otherSolutions: Solution[]
}

interface HistoryItem {
  timestamp: string
  items: ItemData[]
  itemsPreview: ItemData[]
  targetPrice: string
  targetQuantity: string
  totalPrice: string
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
  priceDiffAbs: number
  quantityDiffAbs: number
  priceDiffText: string
  quantityDiffText: string
  showHistory: boolean
  historyList: HistoryItem[]
}

Page<PageData, WechatMiniprogram.Page.CustomOption>({
  data: {
    bulkInput: '',
    items: [
      { name: '', price: '', required: false },
      { name: '', price: '', required: false },
      { name: '', price: '', required: false }
    ],
    targetPrice: '',
    targetQuantity: '1',
    result: null,
    hasCalculated: false,
    validItemCount: 0,
    totalPrice: '0.00',
    meetsRequirements: false,
    priceDiff: 0,
    quantityDiff: 0,
    priceDiffAbs: 0,
    quantityDiffAbs: 0,
    priceDiffText: '相差',
    quantityDiffText: '相差',
    showHistory: false,
    historyList: []
  },

  onLoad() {
    this.loadHistory()
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: '凑单计算器 - 智能计算最优凑单方案',
      path: '/pages/calculator/index',
      imageUrl: ''
    }
  },

  onShareTimeline() {
    return {
      title: '凑单计算器 - 智能计算最优凑单方案',
      query: '',
      imageUrl: ''
    }
  },

  // 批量输入变化
  onBulkInputChange(e: WechatMiniprogram.Input) {
    const value = e.detail.value
    this.setData({
      bulkInput: value
    })

    // 处理批量输入
    const input = value.trim()
    if (!input) {
      return
    }

    const parsedItems = this.parseJielongInput(input)

    if (parsedItems.length > 0) {
      const newItems = parsedItems.map(item => ({
        name: item.name || '',
        price: item.price.toString(),
        required: false
      }))
      this.setData({ items: newItems })
      this.updateStats()
    }
  },

  /**
   * 解析接龙输入格式
   * 支持多种格式：
   * 1. 接龙格式：以 #接龙 开头，如 "#接龙\n1. 张三 123.45"
   * 2. 纯数字格式：逗号或空格分隔的数字，如 "59.9,88,129.5"
   */
  parseJielongInput(input: string): Array<{ name: string; price: number }> {
    const result: Array<{ name: string; price: number }> = []

    // 判断是否是接龙格式（以 #接龙 开头）
    const isJielongFormat = input.includes('#接龙')

    if (isJielongFormat) {
      // 接龙格式：按行解析
      const lines = input.split(/\n/).filter(line => line.trim())

      for (const line of lines) {
        const trimmedLine = line.trim()

        // 跳过空行和标题行
        if (!trimmedLine ||
            trimmedLine.startsWith('#') ||
            trimmedLine.startsWith('例') ||
            trimmedLine.includes('接龙标题') ||
            trimmedLine.includes('接龙描述') ||
            trimmedLine.includes('接龙例子')) {
          continue
        }

        // 先移除序号前缀（如 "1. "、"2. " 等）
        let content = trimmedLine
        const numberedPrefixMatch = content.match(/^\d+[\.、]\s*/)
        if (numberedPrefixMatch) {
          content = content.substring(numberedPrefixMatch[0].length)
        }

        // 查找所有数字（包括整数和小数）
        const allNumbers = content.matchAll(/(\d+\.?\d*)/g)
        const numbers = Array.from(allNumbers)

        if (numbers.length > 0) {
          // 优先尝试找到小数作为价格（价格通常带小数点）
          // 从后向前查找，优先选择小数
          let price = 0
          let priceIndex = -1

          // 第一步：优先查找小数
          for (let i = numbers.length - 1; i >= 0; i--) {
            const match = numbers[i]
            const candidatePrice = parseFloat(match[1])

            // 检查是否是小数（包含小数点）
            const isDecimal = match[0].includes('.')

            if (!isNaN(candidatePrice) && candidatePrice > 0 && isDecimal) {
              price = candidatePrice
              priceIndex = match.index
              break
            }
          }

          // 第二步：如果没找到小数，使用最大的数字
          if (price === 0) {
            let maxPrice = 0
            for (let i = 0; i < numbers.length; i++) {
              const match = numbers[i]
              const candidatePrice = parseFloat(match[1])
              if (!isNaN(candidatePrice) && candidatePrice > maxPrice) {
                maxPrice = candidatePrice
                price = maxPrice
                priceIndex = match.index
              }
            }
          }

          if (!isNaN(price) && price > 0 && priceIndex >= 0) {
            const name = content.substring(0, priceIndex).trim()
            result.push({ name, price })
            continue
          }
        }
      }
    } else {
      // 纯数字格式：按逗号、空格、中文逗号分隔
      const prices = input.split(/[,，\s]+/).filter(p => p.trim())
      for (const p of prices) {
        const price = parseFloat(p)
        if (!isNaN(price) && price > 0) {
          result.push({ name: '', price })
        }
      }
    }

    return result
  },

  // 商品名称变化
  onItemNameChange(e: WechatMiniprogram.Input) {
    const index = Number((e.currentTarget as any).dataset.index)
    const value = e.detail.value
    const items = [...this.data.items]
    items[index].name = value
    this.setData({ items })
  },

  // 商品价格变化
  onItemPriceChange(e: WechatMiniprogram.Input) {
    const index = Number((e.currentTarget as any).dataset.index)
    const value = e.detail.value
    const items = [...this.data.items]
    items[index].price = value
    this.setData({ items })
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
    const items = [...this.data.items, { name: '', price: '', required: false }]
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

    const priceDiffAbs = Math.abs(priceDiff)
    const quantityDiffAbs = Math.abs(quantityDiff)
    const priceDiffText = priceDiff >= 0 ? '超出' : '相差'
    const quantityDiffText = quantityDiff >= 0 ? '超出' : '相差'

    this.setData({
      validItemCount,
      totalPrice: totalPrice.toFixed(2),
      meetsRequirements,
      priceDiff,
      quantityDiff,
      priceDiffAbs,
      quantityDiffAbs,
      priceDiffText,
      quantityDiffText
    })
  },

  // 计算凑单方案
  calculate() {
    // 获取有效的商品价格
    const validItems: OrderItem[] = this.data.items
      .map((item, index) => ({
        id: index,
        name: item.name || `商品 ${index + 1}`,
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

        // 保存到历史记录
        this.saveHistory()

                // 转换结果格式
                const bestSolution = calculationResult.best
                const allSolutions = [bestSolution, ...calculationResult.alternatives]

                // 计算超出目标的价格
                const targetTotal = target * targetQty
                const priceDiff = (bestSolution.totalPrice - targetTotal).toFixed(2)

                // 计算超出目标的数量
                const selectedItemCount = bestSolution.orders.flatMap(order => order.items).length
                const quantityDiff = selectedItemCount - bestSolution.orders.length

                // 提取其他方案（排除最优解，最多显示 5 个）
                const otherSolutions = allSolutions
                  .slice(1, 6)
                  .map(sol => ({
                    items: sol.orders.flatMap(order => order.items),
                    orders: sol.orders.map(order => ({
                      items: order.items,
                      total: order.subtotal.toFixed(2)
                    })),
                    totalPrice: sol.totalPrice.toFixed(2),
                    orderCount: sol.orders.length,
                    priceDiff: (sol.totalPrice - target * sol.orders.length).toFixed(2)
                  }))

                const result: ResultData = {
                  selectedItems: bestSolution.orders.flatMap(order => order.items),
                  totalPrice: bestSolution.totalPrice.toFixed(2),
                  orderCount: bestSolution.orders.length,
                  orders: bestSolution.orders.map(order => ({
                    items: order.items,
                    total: order.subtotal.toFixed(2)
                  })),
                  unusedItems: bestSolution.unusedItems.length,
                  priceDiff,
                  quantityDiff,
                  otherSolutions
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
  },

  // 加载历史记录
  loadHistory() {
    try {
      const history = wx.getStorageSync('calculator-history')
      if (history) {
        this.setData({
          historyList: history
        })
      }
    } catch (error) {
      console.error('加载历史记录失败:', error)
    }
  },

  // 保存历史记录
  saveHistory() {
    const validItems = this.data.items.filter(item => {
      const price = parseFloat(item.price)
      return !isNaN(price) && price > 0
    })

    const totalPrice = validItems.reduce((sum, item) => {
      return sum + parseFloat(item.price)
    }, 0)

    const record: HistoryItem = {
      timestamp: new Date().toLocaleString('zh-CN'),
      items: validItems.map(item => ({ ...item })),
      itemsPreview: validItems.slice(0, 5).map(item => ({ ...item })),
      targetPrice: this.data.targetPrice,
      targetQuantity: this.data.targetQuantity,
      totalPrice: totalPrice.toFixed(2)
    }

    if (validItems.length > 0 && this.data.targetPrice) {
      const historyList = [...this.data.historyList]
      // 添加到开头
      historyList.unshift(record)
      // 限制最多保存 20 条
      if (historyList.length > 20) {
        historyList.length = 20
      }

      this.setData({
        historyList
      })

      try {
        wx.setStorageSync('calculator-history', historyList)
      } catch (error) {
        console.error('保存历史记录失败:', error)
      }
    }
  },

  // 显示历史记录
  showHistoryDialog() {
    this.setData({
      showHistory: true
    })
  },

  // 隐藏历史记录
  hideHistoryDialog() {
    this.setData({
      showHistory: false
    })
  },

  // 从历史记录恢复
  restoreFromHistory(e: WechatMiniprogram.CustomEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const record = this.data.historyList[index]

    // 恢复商品列表（直接恢复历史记录的商品，不添加空输入框）
    const restoredItems: ItemData[] = record.items.map(item => ({
      name: item.name,
      price: item.price,
      required: item.required
    }))

    this.setData({
      items: restoredItems,
      targetPrice: record.targetPrice,
      targetQuantity: record.targetQuantity,
      showHistory: false
    })

    this.updateStats()

    wx.showToast({
      title: '已恢复历史记录',
      icon: 'success'
    })
  },

  // 删除单条历史记录
  deleteHistoryItem(e: WechatMiniprogram.CustomEvent) {
    const index = Number(e.currentTarget.dataset.index)
    const historyList = [...this.data.historyList]
    historyList.splice(index, 1)

    this.setData({
      historyList
    })

    try {
      wx.setStorageSync('calculator-history', historyList)
    } catch (error) {
      console.error('删除历史记录失败:', error)
    }
  },

  // 清空历史记录
  clearHistory() {
    wx.showModal({
      title: '确认',
      content: '确定要清空所有历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            historyList: [],
            showHistory: false
          })

          try {
            wx.removeStorageSync('calculator-history')
          } catch (error) {
            console.error('清空历史记录失败:', error)
          }
        }
      }
    })
  }
})
