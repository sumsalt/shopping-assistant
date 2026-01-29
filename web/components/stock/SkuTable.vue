<template>
  <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
    <!-- 颜色筛选器 -->
    <div v-if="colors.length > 1" class="p-4 border-b border-gray-100 bg-gray-50">
      <div class="flex items-center flex-wrap gap-2">
        <span class="text-sm text-gray-600 mr-2">筛选颜色：</span>
        <button
          type="button"
          :class="[
            'px-3 py-1 text-sm rounded-full transition-colors',
            selectedColor === ''
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          ]"
          @click="handleColorSelect('')"
        >
          全部
        </button>
        <button
          v-for="color in colors"
          :key="color"
          type="button"
          :class="[
            'px-3 py-1 text-sm rounded-full transition-colors',
            selectedColor === color
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
          ]"
          @click="handleColorSelect(color)"
        >
          {{ color }}
        </button>
      </div>
    </div>

    <!-- SKU 表格 -->
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              颜色
            </th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              尺码
            </th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              库存
            </th>
            <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              状态
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr
            v-for="(sku, index) in filteredSkus"
            :key="sku.skuId || index"
            :class="getRowClass(sku)"
          >
            <td class="px-4 py-3">
              <div class="flex items-center">
                <img
                  v-if="sku.colorImage"
                  :src="sku.colorImage"
                  :alt="sku.color"
                  class="w-8 h-8 rounded object-cover mr-2"
                />
                <span class="text-sm text-gray-900">{{ sku.color }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-sm text-gray-900">
              {{ sku.size }}
            </td>
            <td class="px-4 py-3 text-center">
              <span :class="getStockClass(sku.stock)">
                {{ sku.stock }}
              </span>
            </td>
            <td class="px-4 py-3 text-center">
              <StockStockStatus
                :in-stock="sku.inStock"
                variant="badge"
                size="sm"
                :show-icon="false"
                :show-message="false"
              />
            </td>
          </tr>

          <!-- 空状态 -->
          <tr v-if="filteredSkus.length === 0">
            <td colspan="4" class="px-4 py-8 text-center text-gray-500">
              暂无 SKU 数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 统计信息 -->
    <div class="px-4 py-3 border-t border-gray-100 bg-gray-50">
      <div class="flex items-center justify-between text-sm text-gray-600">
        <span>
          共 {{ filteredSkus.length }} 个规格
          <span v-if="selectedColor">({{ selectedColor }})</span>
        </span>
        <span>
          <span class="text-green-600 font-medium">{{ inStockCount }}</span> 有货 /
          <span class="text-red-600 font-medium">{{ outOfStockCount }}</span> 无货
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// SKU 项类型
interface SkuItem {
  skuId: string
  color: string
  colorId?: string
  size: string
  stock: number
  saleStock?: number
  inStock: boolean
  colorImage?: string
}

// 组件属性定义
interface Props {
  skus: SkuItem[]
  colors?: string[]
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  colors: () => [],
})

// 选中的颜色
const selectedColor = ref('')

// 计算颜色列表（如果未提供则从 SKU 中提取）
const colors = computed(() => {
  if (props.colors.length > 0) {
    return props.colors
  }
  const colorSet = new Set(props.skus.map((sku) => sku.color))
  return Array.from(colorSet)
})

// 筛选后的 SKU 列表
const filteredSkus = computed(() => {
  if (!selectedColor.value) {
    return props.skus
  }
  return props.skus.filter((sku) => sku.color === selectedColor.value)
})

// 有货数量
const inStockCount = computed(() => {
  return filteredSkus.value.filter((sku) => sku.inStock).length
})

// 无货数量
const outOfStockCount = computed(() => {
  return filteredSkus.value.filter((sku) => !sku.inStock).length
})

// 颜色选择处理
const handleColorSelect = (color: string) => {
  selectedColor.value = color
}

// 获取行样式
const getRowClass = (sku: SkuItem): string => {
  if (sku.inStock) {
    return 'bg-green-50 hover:bg-green-100'
  }
  return 'bg-gray-50 hover:bg-gray-100'
}

// 获取库存数量样式
const getStockClass = (stock: number): string => {
  const base = 'text-sm font-medium'
  if (stock > 10) {
    return `${base} text-green-600`
  }
  if (stock > 0) {
    return `${base} text-yellow-600`
  }
  return `${base} text-red-600`
}
</script>
