<template>
  <UiDialog
    :open="open"
    title="价格监控"
    @update:open="handleOpenChange"
  >
    <!-- 第一步：输入商品 -->
    <div v-if="isSearchStep" class="space-y-4">
      <form @submit.prevent="handleSearchProduct">
        <UiInput
          v-model="searchInput"
          label="商品 ID / 货号 / 商品链接"
          placeholder="例如 333816379"
          size="lg"
          clearable
          :disabled="isSearching"
          :error="searchError"
          hint="输入后先查询商品，再设置监控参数"
        />
      </form>

      <div class="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
        价格监控只对比登录态下的拿货价，需先在账号管理中选择带登录态的账号。
      </div>
    </div>

    <!-- 第二步：设置参数 -->
    <div v-else class="space-y-5">
      <!-- 商品摘要（一个任务只监控一个商品） -->
      <div v-if="displayProduct" class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
        <div class="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-100">
          <img
            v-if="displayProduct.productImage"
            :src="displayProduct.productImage"
            :alt="displayProduct.productName"
            class="w-full h-full object-cover"
          >
          <div v-else class="w-full h-full flex items-center justify-center">
            <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-gray-900 truncate">
            {{ displayProduct.productName || displayProduct.productId }}
          </p>
          <p class="text-xs text-gray-500">ID：{{ displayProduct.productId }}</p>
        </div>
      </div>

      <!-- 登录态提示 -->
      <div
        v-if="!hasCredential"
        class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800"
      >
        价格监控只监控登录态下的拿货价，请先在
        <NuxtLink to="/accounts" class="underline font-medium">账号管理</NuxtLink>
        中选择带登录态的账号并设为当前账号。
      </div>

      <!-- 检测间隔 -->
      <UiInput
        v-model="intervalInput"
        type="number"
        label="检测间隔（秒）"
        hint="轮次间隔，最低 60 秒"
        :error="intervalError"
        :disabled="isLoading"
      />

      <!-- 监控时长 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">监控时长</label>
        <select
          v-model="duration"
          :disabled="isLoading"
          class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option :value="3600">1 小时</option>
          <option :value="7200">2 小时</option>
          <option :value="21600">6 小时</option>
          <option :value="43200">12 小时</option>
          <option :value="86400">24 小时</option>
          <option :value="172800">48 小时</option>
          <option :value="259200">72 小时</option>
        </select>
      </div>

      <!-- 通知条件 -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">通知条件</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="option in notifyOptions"
            :key="option.value"
            type="button"
            :disabled="isLoading"
            :class="[
              'px-2 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap',
              notifyOn === option.value
                ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50',
            ]"
            @click="notifyOn = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <!-- 最小变动 -->
      <UiInput
        v-model="minPriceDeltaInput"
        type="number"
        label="最小变动金额（元）"
        hint="低于该金额的变动不通知"
        :disabled="isLoading"
      />

      <!-- 预计周期 -->
      <div class="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
        预计每轮检测耗时：{{ cycleText }}
        <p class="mt-1 text-xs text-blue-600">
          轮次间隔在每次检测结束后再计算，实际节奏还受全局请求闸门限制（登录态约 15 秒一次请求）
        </p>
      </div>
    </div>

    <template #footer>
      <div class="flex gap-2">
        <UiButton
          v-if="isSearchStep"
          variant="outline"
          class="flex-1 whitespace-nowrap"
          :disabled="isSearching"
          @click="handleClose"
        >
          取消
        </UiButton>

        <template v-else>
          <UiButton
            v-if="isSearchMode"
            variant="outline"
            class="flex-1 whitespace-nowrap"
            :disabled="isLoading"
            @click="backToSearch"
          >
            重新输入
          </UiButton>
          <UiButton
            v-else
            variant="outline"
            class="flex-1 whitespace-nowrap"
            :disabled="isLoading"
            @click="handleClose"
          >
            取消
          </UiButton>
          <UiButton
            variant="primary"
            class="flex-1 whitespace-nowrap"
            :loading="isLoading"
            :disabled="isLoading || !hasCredential"
            @click="handleSubmit"
          >
            {{ isLoading ? '创建中' : '开始监控' }}
          </UiButton>
        </template>

        <UiButton
          v-if="isSearchStep"
          variant="primary"
          class="flex-1 whitespace-nowrap"
          :loading="isSearching"
          :disabled="isSearching || !searchInput.trim()"
          @click="handleSearchProduct"
        >
          {{ isSearching ? '查询中' : '查询商品' }}
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import {
  MIN_PRICE_MONITOR_INTERVAL,
  DEFAULT_PRICE_MONITOR_INTERVAL,
  DEFAULT_PRICE_MONITOR_DURATION,
  type PriceMonitorProduct,
  type PriceNotifyOn,
} from '~/composables/usePriceMonitor'

// 组件属性
interface Props {
  open: boolean
  /** 已确定的商品；为空时弹窗进入“先查询商品”模式 */
  product?: PriceMonitorProduct | null
}

const props = withDefaults(defineProps<Props>(), {
  product: null,
})

// 定义事件
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [taskId: string]
}>()

const configStore = useConfigStore()
const { createPriceMonitorTask, isLoading } = usePriceMonitor()
const { checkStock } = useStock()

// 是否为“先查询商品”模式
const isSearchMode = computed(() => !props.product)

// 当前步骤
const step = ref<'search' | 'config'>('search')
const isSearchStep = computed(() => step.value === 'search')

// 查询商品
const searchInput = ref('')
const searchError = ref('')
const isSearching = ref(false)
const searchedProduct = ref<PriceMonitorProduct | null>(null)

// 检测间隔
const intervalInput = ref(String(MIN_PRICE_MONITOR_INTERVAL))
// 监控时长（默认 24 小时）
const duration = ref(DEFAULT_PRICE_MONITOR_DURATION)
// 通知条件
const notifyOn = ref<PriceNotifyOn>('any')
// 最小变动金额
const minPriceDeltaInput = ref('0.01')

const intervalError = ref('')

const notifyOptions: Array<{ value: PriceNotifyOn; label: string }> = [
  { value: 'any', label: '涨跌都通知' },
  { value: 'drop', label: '仅降价' },
  { value: 'rise', label: '仅涨价' },
]

// 实际要监控的商品（一个任务只监控一个商品）
const displayProduct = computed(() => props.product ?? searchedProduct.value)

// 是否已配置登录态（当前账号的抓包快照里带 uid + token）
const hasCredential = computed(() => Boolean(configStore.activeAccount?.hasCredential))

// 预计检测周期
const cycleText = computed(() => {
  const interval = Number(intervalInput.value) || DEFAULT_PRICE_MONITOR_INTERVAL
  return `约 ${interval} 秒/次`
})

// 从输入中解析商品 ID（兼容商品链接）
const parseProductId = (input: string): string => {
  const value = input.trim()

  const linkMatch = value.match(/goods\/(\d+)/)
  if (linkMatch?.[1]) {
    return linkMatch[1]
  }

  const idMatch = value.match(/(?:goods_id|goodsId|id)=(\d+)/)
  if (idMatch?.[1]) {
    return idMatch[1]
  }

  return value
}

/**
 * 查询商品，成功后进入参数设置
 */
const handleSearchProduct = async () => {
  const productId = parseProductId(searchInput.value)

  if (!productId) {
    searchError.value = '请输入商品 ID、货号或商品链接'
    return
  }

  isSearching.value = true
  searchError.value = ''

  try {
    const result = await checkStock(productId)

    if (!result) {
      searchError.value = '未查询到商品，请检查 ID 是否正确'
      return
    }

    searchedProduct.value = {
      productId: result.productId,
      productName: result.productName,
      productImage: result.productImage,
    }
    step.value = 'config'
  } finally {
    isSearching.value = false
  }
}

/**
 * 返回上一步重新输入
 */
const backToSearch = () => {
  step.value = 'search'
  searchedProduct.value = null
  searchError.value = ''
}

// 关闭弹窗
const handleClose = () => {
  emit('update:open', false)
}

// 外部控制开关
const handleOpenChange = (value: boolean) => {
  emit('update:open', value)
}

// 提交
const handleSubmit = async () => {
  intervalError.value = ''

  const interval = Number(intervalInput.value)
  if (!Number.isFinite(interval) || interval < MIN_PRICE_MONITOR_INTERVAL) {
    intervalError.value = `检测间隔不能小于 ${MIN_PRICE_MONITOR_INTERVAL} 秒`
    return
  }

  if (!displayProduct.value) {
    searchError.value = '请先选择要监控的商品'
    step.value = 'search'
    return
  }

  const minPriceDelta = Number(minPriceDeltaInput.value)

  const taskId = await createPriceMonitorTask(displayProduct.value, {
    interval,
    duration: duration.value,
    notifyOn: notifyOn.value,
    minPriceDelta: Number.isFinite(minPriceDelta) && minPriceDelta > 0 ? minPriceDelta : 0.01,
  })

  if (taskId) {
    emit('created', taskId)
    handleClose()
  }
}

// 每次打开时重置状态
watch(
  () => props.open,
  (open) => {
    if (!open) {
      return
    }

    step.value = props.product ? 'config' : 'search'
    searchInput.value = ''
    searchError.value = ''
    searchedProduct.value = null
    intervalInput.value = String(MIN_PRICE_MONITOR_INTERVAL)
    duration.value = DEFAULT_PRICE_MONITOR_DURATION
    notifyOn.value = 'any'
    minPriceDeltaInput.value = '0.01'
    intervalError.value = ''
  }
)
</script>
