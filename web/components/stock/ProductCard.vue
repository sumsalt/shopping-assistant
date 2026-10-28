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

      <!-- 监控按钮（仅无货商品显示） -->
      <UiButton
        v-if="!inStock && showMonitorButton"
        variant="outline"
        size="xs"
        :loading="isMonitoring"
        :disabled="isMonitoring"
        class="w-full mt-2"
        @click.stop="handleMonitorClick"
      >
        <svg v-if="!isMonitoring" class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {{ isMonitoring ? '创建中' : '监控到货' }}
      </UiButton>

      <!-- 价格监控按钮 -->
      <UiButton
        v-if="showPriceMonitorButton"
        variant="outline"
        size="xs"
        :loading="isPriceMonitoring"
        :disabled="isPriceMonitoring"
        class="w-full mt-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
        @click.stop="handlePriceMonitorClick"
      >
        <svg v-if="!isPriceMonitoring" class="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        {{ isPriceMonitoring ? '创建中' : '价格监控' }}
      </UiButton>
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
  showMonitorButton?: boolean
  isMonitoring?: boolean
  /** 是否显示价格监控按钮 */
  showPriceMonitorButton?: boolean
  /** 是否正在创建价格监控 */
  isPriceMonitoring?: boolean
}

// 默认属性
const props = withDefaults(defineProps<Props>(), {
  productId: '',
  productNo: '',
  imageUrl: '',
  message: '',
  sales: undefined,
  clickable: true,
  showMonitorButton: false,
  isMonitoring: false,
  showPriceMonitorButton: false,
  isPriceMonitoring: false,
})

// 定义事件
const emit = defineEmits<{
  click: [event: MouseEvent]
  monitor: []
  'price-monitor': []
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

// 监控按钮点击事件
const handleMonitorClick = () => {
  emit('monitor')
}

// 价格监控按钮点击事件
const handlePriceMonitorClick = () => {
  emit('price-monitor')
}
</script>
