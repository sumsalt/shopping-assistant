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

        <!-- 凑单价格输入 -->
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

        <!-- 计算按钮 -->
        <UiButton
          variant="primary"
          size="lg"
          class="w-full"
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

          <!-- 商品详情 -->
          <div class="space-y-2">
            <div
              v-for="(item, index) in result.selectedItems"
              :key="index"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
                  {{ index + 1 }}
                </div>
                <span class="font-medium text-gray-900">商品 {{ item.originalIndex + 1 }}</span>
              </div>
              <span class="font-semibold text-gray-900">¥{{ item.price.toFixed(2) }}</span>
            </div>
          </div>

          <!-- 统计信息 -->
          <div class="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
            <div>
              <div class="text-sm text-gray-600 mb-1">凑单目标</div>
              <div class="text-lg font-semibold text-gray-900">¥{{ parseFloat(targetPrice).toFixed(2) }}</div>
            </div>
            <div>
              <div class="text-sm text-gray-600 mb-1">超出目标</div>
              <div class="text-lg font-semibold text-orange-600">
                ¥{{ (result.totalPrice - parseFloat(targetPrice)).toFixed(2) }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 所有方案（按价格排序） -->
      <div v-if="result.allSolutions.length > 1" class="bg-white rounded-lg border border-gray-200 p-6">
        <h3 class="text-lg font-medium text-gray-900 mb-4">其他可选方案</h3>
        <div class="space-y-3">
          <div
            v-for="(solution, index) in result.allSolutions.slice(1, 6)"
            :key="index"
            class="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div class="flex items-center justify-between mb-2">
              <div class="text-sm text-gray-600">
                {{ solution.items.length }} 件商品
              </div>
              <div class="text-lg font-semibold text-gray-900">
                ¥{{ solution.totalPrice.toFixed(2) }}
              </div>
            </div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(item, itemIndex) in solution.items"
                :key="itemIndex"
                class="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded"
              >
                商品 {{ item.originalIndex + 1 }} (¥{{ item.price.toFixed(2) }})
              </span>
            </div>
            <div class="mt-2 text-sm text-gray-500">
              超出目标: ¥{{ (solution.totalPrice - parseFloat(targetPrice)).toFixed(2) }}
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

// 商品列表
const items = ref([
  { price: '' },
  { price: '' },
  { price: '' },
])

// 凑单价格
const targetPrice = ref('')

// 计算结果
const result = ref<any>(null)

// 是否已经计算过
const hasCalculated = ref(false)

// 添加商品
const addItem = () => {
  items.value.push({ price: '' })
}

// 移除商品
const removeItem = (index: number) => {
  if (items.value.length > 1) {
    items.value.splice(index, 1)
  }
}

// 计算凑单方案
const calculate = () => {
  // 获取有效的商品价格
  const validItems = items.value
    .map((item, index) => ({
      price: parseFloat(item.price),
      originalIndex: index,
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

  hasCalculated.value = true

  // 计算所有可能的组合
  const solutions: any[] = []

  // 遍历所有可能的子集（非空）
  for (let i = 1; i < (1 << validItems.length); i++) {
    const selectedItems: any[] = []
    let total = 0

    for (let j = 0; j < validItems.length; j++) {
      if (i & (1 << j)) {
        selectedItems.push(validItems[j])
        total += validItems[j].price
      }
    }

    // 只保留达到凑单价格的组合
    if (total >= target) {
      solutions.push({
        items: selectedItems,
        totalPrice: total,
      })
    }
  }

  // 按总价升序排序，然后按商品数量升序排序
  solutions.sort((a, b) => {
    if (a.totalPrice !== b.totalPrice) {
      return a.totalPrice - b.totalPrice
    }
    return a.items.length - b.items.length
  })

  if (solutions.length === 0) {
    result.value = null
    toast.warning('无法凑单，请添加更多商品或调整凑单价格')
    return
  }

  // 返回最优方案和所有方案
  result.value = {
    selectedItems: solutions[0].items,
    totalPrice: solutions[0].totalPrice,
    allSolutions: solutions,
  }

  toast.success(`找到 ${solutions.length} 种凑单方案`)
}
</script>
