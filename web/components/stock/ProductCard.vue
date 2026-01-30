<template>
  <div
    :class="cardClasses"
    :tabindex="clickable ? 0 : -1"
    :role="clickable ? 'button' : undefined"
    :aria-label="`商品：${name}，${inStock ? '有货' : '无货'}`"
    @click="handleClick"
    @keydown.enter="handleKeyDown"
    @keydown.space="handleKeyDown"
  >
    <!-- 商品图片 -->
    <div class="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="name"
        class="w-full h-full object-cover"
        loading="lazy"
        @error="handleImageError"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center text-gray-400"
      >
        <svg class="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      <!-- 库存状态角标 -->
      <div class="absolute top-2 right-2">
        <StockStockStatus
          :in-stock="inStock"
          variant="badge"
          size="sm"
          :show-icon="false"
          :show-message="false"
        />
      </div>
    </div>

    <!-- 商品信息 -->
    <div class="mt-3 space-y-1">
      <!-- 商品名称 -->
      <h3 class="text-sm font-medium text-gray-900 line-clamp-2" :title="name">
        {{ name }}
      </h3>

      <!-- 货号 -->
      <p v-if="productId" class="text-xs text-gray-500">
        货号：{{ productId }}
      </p>

      <!-- 价格 -->
      <div class="flex items-center justify-between">
        <span class="text-lg font-bold text-red-600">
          ¥{{ formatPrice(price) }}
        </span>

        <!-- 销量 -->
        <span v-if="sales !== undefined" class="text-xs text-gray-400">
          销量 {{ formatSales(sales) }}
        </span>
      </div>

      <!-- 状态信息 -->
      <div v-if="message && !inStock" class="text-xs text-gray-500 truncate" :title="message">
        {{ message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  productId?: string
  productNo?: string
  name: string
  imageUrl?: string
  price: number
  inStock: boolean
  message?: string
  sales?: number
  clickable?: boolean
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  productId: '',
  productNo: '',
  imageUrl: '',
  message: '',
  sales: undefined,
  clickable: true,
})

// 定义事件
const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

// 图片加载失败处理
const imageLoadError = ref(false)

// 计算卡片类名
const cardClasses = computed(() => {
  const base = 'bg-white rounded-lg p-3 transition-all duration-200'
  const border = 'border border-gray-200'
  const hover = props.clickable ? 'hover:shadow-md hover:border-gray-300 cursor-pointer' : ''
  const focus = props.clickable ? 'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2' : ''

  return [base, border, hover, focus].filter(Boolean).join(' ')
})

// 格式化价格
const formatPrice = (price: number): string => {
  return price.toFixed(2)
}

// 格式化销量
const formatSales = (sales: number): string => {
  if (sales >= 10000) {
    return `${(sales / 10000).toFixed(1)}万`
  }
  if (sales >= 1000) {
    return `${(sales / 1000).toFixed(1)}千`
  }
  return sales.toString()
}

// 图片加载失败
const handleImageError = () => {
  imageLoadError.value = true
}

// 点击事件处理
const handleClick = (event: MouseEvent) => {
  if (props.clickable) {
    emit('click', event)
  }
}

// 键盘事件处理
const handleKeyDown = (event: KeyboardEvent) => {
  if (props.clickable) {
    event.preventDefault()
    emit('click', event as unknown as MouseEvent)
  }
}
</script>
