<template>
  <div class="max-w-4xl mx-auto">
    <!-- 页面标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900">凑单计算器</h1>
      <p class="mt-1 text-sm text-gray-500">输入商品价格和优惠券满减条件，计算最优凑单方案</p>
    </div>

    <!-- 输入区域 -->
    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div class="space-y-4">
        <!-- 商品价格输入 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            商品价格（元）
          </label>
          <div class="space-y-4">
            <!-- 快速输入方式 -->
            <div>
              <UiInput
                v-model="bulkInput"
                placeholder="快速输入：多个价格用逗号分隔，例如：59.9,88,129.5"
                @input="handleBulkInput"
              />
              <p class="mt-1 text-xs text-gray-500">
                支持批量输入多个价格，用逗号或空格分隔
              </p>
            </div>

            <!-- 分隔线 -->
            <div class="flex items-center">
              <div class="flex-1 border-t border-gray-300"></div>
              <span class="px-3 text-sm text-gray-500">或手动添加</span>
              <div class="flex-1 border-t border-gray-300"></div>
            </div>

            <!-- 手动输入方式 -->
            <div class="space-y-2">
              <div
                v-for="(item, index) in items"
                :key="index"
                class="flex gap-2"
              >
                <UiInput
                  v-model="item.price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="输入价格"
                  class="flex-1"
                />
                <div class="flex items-center gap-2">
                  <label class="flex items-center gap-1 cursor-pointer">
                    <input
                      v-model="item.required"
                      type="checkbox"
                      class="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span class="text-xs text-gray-600">必选</span>
                  </label>
                </div>
                <UiButton
                  v-if="items.length > 1"
                  variant="outline"
                  size="sm"
                  @click="removeItem(index)"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                  </svg>
                </UiButton>
              </div>
              <UiButton
                variant="outline"
                size="sm"
                class="w-full"
                @click="addItem"
              >
                <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                添加商品
              </UiButton>
            </div>
          </div>
        </div>

        <!-- 凑单价格输入 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              凑单价格（元）
            </label>
            <UiInput
              v-model="targetPrice"
              type="number"
              step="0.01"
              min="0"
              placeholder="输入凑单价格，例如：200"
            />
            <p class="mt-1 text-xs text-gray-500">
              优惠券满减条件，例如满200减50，请输入200
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">
              凑单数量（订单数）
            </label>
            <UiInput
              v-model="targetQuantity"
              type="number"
              step="1"
              min="1"
              placeholder="输入凑单数量，默认为1"
            />
            <p class="mt-1 text-xs text-gray-500">
              需要凑单的订单数量，默认为1
            </p>
          </div>
        </div>

        <!-- 商品总价格展示 -->
        <div
          v-if="validItemCount > 0"
          :class="[
            'p-4 rounded-lg border',
            meetsRequirements
              ? 'bg-green-50 border-green-200'
              : 'bg-blue-50 border-blue-200'
          ]"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm text-gray-600">已输入商品</div>
              <div class="text-lg font-semibold text-gray-900">{{ validItemCount }} 件</div>
            </div>
            <div class="text-right">
              <div class="text-sm text-gray-600">商品总价</div>
              <div
                :class="[
                  'text-2xl font-bold',
                  meetsRequirements ? 'text-green-600' : 'text-blue-600'
                ]"
              >
                ¥{{ totalPrice.toFixed(2) }}
              </div>
            </div>
          </div>
          <div v-if="targetPrice" class="mt-3 pt-3 border-t border-gray-200">
            <div class="grid grid-cols-2 gap-x-4 gap-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1 sm:gap-0">
                <span class="text-gray-600 whitespace-nowrap">单订单目标</span>
                <span class="font-semibold text-gray-900">
                  ¥{{ parseFloat(targetPrice).toFixed(2) }}
                </span>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1 sm:gap-0">
                <span class="text-gray-600 whitespace-nowrap">订单数目标</span>
                <span class="font-semibold text-gray-900">
                  {{ targetQuantity || 1 }} 单
                </span>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1 sm:gap-0">
                <span class="text-gray-600 whitespace-nowrap">价格差额</span>
                <span
                  :class="[
                    'font-semibold',
                    priceDiff >= 0 ? 'text-green-600' : 'text-orange-600'
                  ]"
                >
                  ¥{{ Math.abs(priceDiff).toFixed(2) }} {{ priceDiff >= 0 ? '超出' : '相差' }}
                </span>
              </div>
              <div class="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-1 sm:gap-0">
                <span class="text-gray-600 whitespace-nowrap">数量差额</span>
                <span
                  :class="[
                    'font-semibold',
                    quantityDiff >= 0 ? 'text-green-600' : 'text-orange-600'
                  ]"
                >
                  {{ Math.abs(quantityDiff) }} 件 {{ quantityDiff >= 0 ? '超出' : '相差' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 计算按钮 -->
        <UiButton
          variant="primary"
          size="lg"
          class="w-full"
          :disabled="validItemCount === 0"
          @click="calculate"
        >
          计算凑单方案
        </UiButton>
      </div>
    </div>

    <!-- 计算结果 -->
    <div v-if="result" class="space-y-6">
      <!-- 最优方案 -->
      <div class="bg-white rounded-lg border border-gray-200 p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">最优凑单方案</h3>
        <div class="space-y-4">
          <!-- 总览 -->
          <div class="flex items-center justify-between p-4 bg-green-50 rounded-lg">
            <div>
              <div class="text-sm text-gray-600 mb-1">选中的商品</div>
              <div class="text-lg font-semibold text-gray-900">
                {{ result.selectedItems.length }} 件
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm text-gray-600 mb-1">总价</div>
              <div class="text-2xl font-bold text-green-600">
                ¥{{ result.totalPrice.toFixed(2) }}
              </div>
            </div>
          </div>

          <!-- 订单分配详情 -->
          <div class="space-y-3">
            <h4 class="text-sm font-medium text-gray-700">订单分配详情</h4>
            <div
              v-for="(order, orderIndex) in result.orders"
              :key="orderIndex"
              class="p-4 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-sm">
                    {{ orderIndex + 1 }}
                  </div>
                  <span class="font-medium text-gray-900">订单 {{ orderIndex + 1 }}</span>
                </div>
                <div class="text-right">
                  <span class="text-sm text-gray-600">订单总价:</span>
                  <span class="ml-2 font-semibold text-green-600">¥{{ order.total.toFixed(2) }}</span>
                </div>
              </div>
              <div class="space-y-1">
                <div
                  v-for="(item, itemIndex) in order.items"
                  :key="itemIndex"
                  class="flex items-center justify-between text-sm py-1 px-2 bg-white rounded"
                  :class="item.required ? 'border-l-2 border-orange-500' : ''"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-gray-700">{{ item.name }}</span>
                    <span
                      v-if="item.required"
                      class="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded"
                    >
                      必选
                    </span>
                  </div>
                  <span class="font-medium text-gray-900">¥{{ item.price.toFixed(2) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 统计信息 -->
          <div :class="[
            'grid',
            result.unusedItems > 0 ? 'grid-cols-3 gap-3' : 'grid-cols-2 gap-4',
            'pt-4 border-t border-gray-200'
          ]">
            <div>
              <div class="text-sm text-gray-600 mb-1">单个订单目标</div>
              <div class="text-lg font-semibold text-gray-900">
                ¥{{ parseFloat(targetPrice).toFixed(2) }}
              </div>
            </div>
            <div>
              <div class="text-sm text-gray-600 mb-1">订单数量</div>
              <div class="text-lg font-semibold text-gray-900">
                {{ result.orderCount }} 单
              </div>
            </div>
            <div v-if="result.unusedItems > 0">
              <div class="text-sm text-gray-600 mb-1">未使用商品</div>
              <div class="text-lg font-semibold text-gray-500">
                {{ result.unusedItems }} 件
              </div>
            </div>
            <div>
              <div class="text-sm text-gray-600 mb-1">超出价格目标</div>
              <div class="text-lg font-semibold text-orange-600">
                ¥{{ (result.totalPrice - parseFloat(targetPrice) * result.orderCount).toFixed(2) }}
              </div>
            </div>
            <div :class="result.unusedItems > 0 ? 'col-span-2' : ''">
              <div class="text-sm text-gray-600 mb-1">超出数量目标</div>
              <div class="text-lg font-semibold text-orange-600">
                {{ result.selectedItems.length - result.orderCount }} 件
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 所有方案（按价格排序） -->
      <div v-if="result.allSolutions.length > 1" class="bg-white rounded-lg border border-gray-200 p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">其他可选方案</h3>
        <div class="space-y-4">
          <div
            v-for="(solution, solutionIndex) in result.allSolutions.slice(1, 6)"
            :key="solutionIndex"
            class="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="text-sm text-gray-600">
                {{ solution.items.length }} 件商品 / {{ solution.orderCount }} 单
              </div>
              <div class="text-lg font-semibold text-gray-900">
                ¥{{ solution.totalPrice.toFixed(2) }}
              </div>
            </div>

            <!-- 订单详情 -->
            <div class="space-y-2 mb-3">
              <div
                v-for="(order, orderIndex) in solution.orders"
                :key="orderIndex"
                class="p-2 bg-gray-50 rounded border border-gray-200"
              >
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-2">
                    <div class="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-xs">
                      {{ orderIndex + 1 }}
                    </div>
                    <span class="text-xs font-medium text-gray-700">订单 {{ orderIndex + 1 }}</span>
                  </div>
                  <span class="text-xs font-medium text-green-600">¥{{ order.total.toFixed(2) }}</span>
                </div>
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="(item, itemIndex) in order.items"
                    :key="itemIndex"
                    class="px-1.5 py-0.5 text-xs rounded"
                    :class="item.required ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'"
                  >
                    {{ item.name }} (¥{{ item.price.toFixed(2) }})
                  </span>
                </div>
              </div>
            </div>

            <div class="text-sm text-gray-500">
              超出目标: ¥{{ (solution.totalPrice - parseFloat(targetPrice) * solution.orderCount).toFixed(2) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!hasCalculated" class="bg-white rounded-lg border border-gray-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">等待计算</h3>
        <p class="text-gray-500 max-w-sm">
          在上方输入商品价格和凑单目标价格，点击计算按钮获取最优凑单方案
        </p>
      </div>
    </div>

    <!-- 无解状态 -->
    <div v-else-if="hasCalculated && !result" class="bg-white rounded-lg border border-orange-200 p-8">
      <div class="flex flex-col items-center justify-center text-center">
        <div class="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">无法凑单</h3>
        <p class="text-gray-500 max-w-sm">
          当前商品组合无法达到凑单目标，请添加更多商品或调整凑单价格
        </p>
      </div>
    </div>

    <!-- 使用说明 -->
    <div class="mt-6 p-4 bg-blue-50 rounded-lg">
      <h4 class="text-sm font-medium text-blue-800 mb-2">使用说明</h4>
      <ul class="text-sm text-blue-700 list-disc list-inside space-y-1">
        <li>输入多个商品的价格，点击"添加商品"增加更多商品</li>
        <li>勾选"必选"标记必须包含的商品，计算结果将强制包含这些商品</li>
        <li>输入凑单价格（优惠券满减条件）</li>
        <li>系统会自动计算出达到凑单价格的最优商品组合</li>
        <li>如果有多个方案，会显示所有可选方案供您选择</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
// 页面元信息
definePageMeta({
  title: '凑单计算器',
})

// 使用 toast
const toast = useToast()

// 批量输入框
const bulkInput = ref('')

// 商品列表
const items = ref([
  { price: '', required: false },
  { price: '', required: false },
  { price: '', required: false },
])

// 凑单价格
const targetPrice = ref('')

// 凑单数量
const targetQuantity = ref('1')

// 计算结果
const result = ref<any>(null)

// 是否已经计算过
const hasCalculated = ref(false)

// 计算有效商品数量
const validItemCount = computed(() => {
  return items.value.filter(item => {
    const price = parseFloat(item.price)
    return !isNaN(price) && price > 0
  }).length
})

// 计算商品总价格
const totalPrice = computed(() => {
  return items.value.reduce((sum, item) => {
    const price = parseFloat(item.price)
    if (!isNaN(price) && price > 0) {
      return sum + price
    }
    return sum
  }, 0)
})

// 是否满足凑单要求
const meetsRequirements = computed(() => {
  const target = parseFloat(targetPrice.value)
  const qty = parseInt(targetQuantity.value) || 1
  if (!target) return false
  return totalPrice.value >= target * qty && validItemCount.value >= qty
})

// 价格差额
const priceDiff = computed(() => {
  const target = parseFloat(targetPrice.value)
  const qty = parseInt(targetQuantity.value) || 1
  if (!target) return 0
  return totalPrice.value - target * qty
})

// 数量差额
const quantityDiff = computed(() => {
  const qty = parseInt(targetQuantity.value) || 1
  return validItemCount.value - qty
})

// 处理批量输入
const handleBulkInput = () => {
  const input = bulkInput.value.trim()
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
    items.value = prices.map(price => ({ price: price.toString(), required: false }))
    toast.success(`已添加 ${prices.length} 个商品`)
  }
}

// 添加商品
const addItem = () => {
  items.value.push({ price: '', required: false })
}

// 移除商品
const removeItem = (index: number) => {
  if (items.value.length > 1) {
    items.value.splice(index, 1)
  }
}

// 计算凑单方案
// 计算凑单方案
const calculate = async () => {
  // 获取有效的商品价格
  const validItems = items.value
    .map((item, index) => ({
      id: index,
      name: `商品 ${index + 1}`,
      price: parseFloat(item.price),
      required: item.required,
    }))
    .filter(item => !isNaN(item.price) && item.price > 0)

  if (validItems.length === 0) {
    toast.error('请至少输入一个有效的商品价格')
    return
  }

  const target = parseFloat(targetPrice.value)
  if (isNaN(target) || target <= 0) {
    toast.error('请输入有效的凑单价格')
    return
  }

  const targetQty = parseInt(targetQuantity.value) || 1

  // 首先检查是否有足够的商品总价值
  const totalValue = validItems.reduce((sum, item) => sum + item.price, 0)
  const minValueNeeded = target * targetQty

  if (totalValue < minValueNeeded) {
    toast.warning(`商品总价 ¥${totalValue.toFixed(2)} 不足以凑满 ${targetQty} 个订单，需要至少 ¥${minValueNeeded.toFixed(2)}`)
    result.value = null
    return
  }

  hasCalculated.value = true

  // 动态导入算法类
  const { OrderPoolingSolver } = await import('./OrderPoolingSolver')

  // 使用算法类计算
  const solver = new OrderPoolingSolver(validItems, target, targetQty)
  const calculationResult = solver.solve()

  if (!calculationResult.best) {
    const requiredItems = validItems.filter(item => item.required)
    const requiredTotal = requiredItems.reduce((sum, item) => sum + item.price, 0)
    
    if (requiredItems.length > 0) {
      toast.warning(`无法凑单：必选商品 ${requiredItems.length} 件总价 ¥${requiredTotal.toFixed(2)}，无法满足 ${targetQty} 个订单的要求`)
    } else {
      toast.warning(`无法凑单，请检查是否足够 ${targetQty} 个订单，每个订单都需要达到 ¥${target.toFixed(2)}`)
    }
    result.value = null
    return
  }

  // 转换结果格式以匹配页面显示需求
  const bestSolution = calculationResult.best
  const allSolutions = [bestSolution, ...calculationResult.alternatives]

  result.value = {
    selectedItems: bestSolution.orders.flatMap(order => order.items),
    totalPrice: bestSolution.totalPrice,
    orderCount: bestSolution.orders.length,
    orders: bestSolution.orders.map(order => ({
      items: order.items,
      total: order.subtotal
    })),
    unusedItems: bestSolution.unusedItems.length,
    allSolutions: allSolutions.map(sol => ({
      items: sol.orders.flatMap(order => order.items),
      orders: sol.orders.map(order => ({
        items: order.items,
        total: order.subtotal
      })),
      totalPrice: sol.totalPrice,
      orderCount: sol.orders.length
    }))
  }

  toast.success(`找到 ${allSolutions.length} 种凑单方案（${targetQty} 单）`)
}
</script>
