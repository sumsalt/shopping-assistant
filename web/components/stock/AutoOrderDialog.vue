<template>
  <UiDialog
    :open="open"
    title="有货自动下单"
    @update:open="handleOpenChange"
  >
    <div class="space-y-5">
      <!-- 商品摘要 -->
      <div v-if="product" class="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
        <div class="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-gray-100">
          <img
            v-if="product.productImage"
            :src="product.productImage"
            :alt="product.productName"
            class="w-full h-full object-cover"
          >
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-gray-900 truncate">
            {{ product.productName || product.productId }}
          </p>
          <p class="text-xs text-gray-500">货号：{{ product.productNo }}</p>
        </div>
      </div>

      <!-- 登录态提示 -->
      <div
        v-if="!hasCredential"
        class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800"
      >
        自动下单必须使用登录态，请先在
        <NuxtLink to="/settings" class="underline font-medium">系统配置</NuxtLink>
        中填写 uid 和 token。
      </div>

      <template v-else>
        <!-- 监控时长 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">监控时长</label>
          <select
            v-model.number="duration"
            :disabled="isLoading"
            class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option :value="21600">6 小时</option>
            <option :value="43200">12 小时</option>
            <option :value="86400">24 小时</option>
            <option :value="259200">72 小时</option>
            <option :value="604800">7 天</option>
          </select>
        </div>

        <!-- 购买件数 + 支付方式 -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">购买件数</label>
            <input
              v-model.number="num"
              type="number"
              min="1"
              max="99"
              :disabled="isLoading"
              class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">支付方式</label>
            <select
              v-model="payTool"
              :disabled="isLoading"
              class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="4">微信</option>
              <option value="1">支付宝</option>
            </select>
          </div>
        </div>

        <!-- 收货地址 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">
            收货地址
            <button
              type="button"
              class="ml-2 text-xs text-blue-600 hover:underline"
              :disabled="isLoadingAddress"
              @click="loadAddresses"
            >
              {{ isLoadingAddress ? '加载中…' : '刷新' }}
            </button>
          </label>
          <select
            v-if="addresses.length > 0"
            v-model="addressId"
            :disabled="isLoading"
            class="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option v-for="item in addresses" :key="item.addressId" :value="item.addressId">
              {{ item.consignee }} {{ maskMobile(item.mobile) }} · {{ item.area }} {{ item.address }}
            </option>
          </select>
          <p v-else class="text-xs text-gray-500 py-2">
            {{ addressError || '暂未读取到地址，将使用一手账号默认地址' }}
          </p>
        </div>

        <!-- 预检结果 -->
        <div
          v-if="precheck"
          class="p-3 rounded-lg text-sm"
          :class="precheck.success ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-700'"
        >
          <template v-if="precheck.success">
            <p class="font-medium">链路可用：{{ precheck.skuLabel }} × {{ precheck.num }}</p>
            <p class="mt-1">
              商品 ¥{{ precheck.goodsAmount?.toFixed(2) ?? '-' }} + 运费 ¥{{ precheck.shippingFee?.toFixed(2) ?? '-' }}
            </p>
            <p class="mt-1 text-xs">购物车已清理，未生成订单</p>
          </template>
          <template v-else>
            <p class="font-medium">预检失败（{{ precheck.stage ? stageText(precheck.stage) : '未知环节' }}）</p>
            <p class="mt-1">{{ precheck.message }}</p>
          </template>
        </div>

        <!-- 风险说明 -->
        <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
          <p class="font-medium">下单后需要你手动付款</p>
          <p class="text-xs">
            检测到有货会立刻加购、结算并<strong>创建待付款订单</strong>，锁住库存并邮件通知你。
            系统不会自动扣款，一手待付款订单约 <strong>20 分钟</strong>内有效，超时未付会自动关闭并释放库存。
          </p>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="flex gap-2 w-full">
        <UiButton
          variant="outline"
          class="flex-1 whitespace-nowrap"
          :disabled="isLoading"
          @click="handleClose"
        >
          取消
        </UiButton>
        <UiButton
          variant="outline"
          class="flex-1 whitespace-nowrap"
          :loading="isChecking"
          :disabled="isLoading || isChecking || !hasCredential"
          @click="handlePrecheck"
        >
          预检
        </UiButton>
        <UiButton
          variant="primary"
          class="flex-1 whitespace-nowrap"
          :loading="isLoading"
          :disabled="isLoading || !hasCredential || !product?.productNo"
          @click="handleSubmit"
        >
          {{ isLoading ? '创建中' : '开始监控' }}
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
interface AutoOrderProduct {
  productId: string
  productName?: string
  productImage?: string
  productNo?: string
}

interface AddressItem {
  addressId: string
  consignee: string
  mobile: string
  area: string
  address: string
  province: string
  city: string
  district: string
}

interface PrecheckResult {
  success: boolean
  message?: string
  skuLabel?: string
  num?: number
  goodsAmount?: number
  shippingFee?: number
  stage?: string
}

const props = withDefaults(defineProps<{ open: boolean; product?: AutoOrderProduct | null }>(), {
  product: null,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  created: [taskId: string]
}>()

const configStore = useConfigStore()
const { createMonitorTask, isLoading } = useMonitor()
const toast = useToast()

const num = ref(1)
const duration = ref(86400)
const payTool = ref<'1' | '4'>('4')
const addresses = ref<AddressItem[]>([])
const addressId = ref('')
const isLoadingAddress = ref(false)
const addressError = ref('')
const isChecking = ref(false)
const precheck = ref<PrecheckResult | null>(null)

const hasCredential = computed(() => {
  const config = configStore.getConfigForApi()
  return Boolean(config?.uid && config?.token)
})

const stageText = (stage: string): string => {
  const map: Record<string, string> = {
    address: '收货地址',
    sku: '查询规格',
    cart: '加入购物车',
    confirm: '结算确认',
    create: '创建订单',
  }
  return map[stage] || stage
}

const maskMobile = (mobile: string): string =>
  mobile ? mobile.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : ''

/** 取配置里的凭证，统一透传给服务端 */
const buildAdapterConfig = () => {
  const config = configStore.getConfigForApi()
  if (!config) {
    return null
  }

  return {
    uid: config.uid || '',
    token: config.token || '',
    openid: config.openid || '',
    model: config.model || '',
    version: config.version || '',
    version_name: config.version_name || '',
    wx_version_name: config.wx_version_name || '',
    proxyUrl: config.proxyUrl,
    proxyEnabled: config.proxyEnabled || '0',
  }
}

const loadAddresses = async () => {
  const adapterConfig = buildAdapterConfig()
  if (!adapterConfig?.uid || !adapterConfig.token) {
    return
  }

  isLoadingAddress.value = true
  addressError.value = ''

  try {
    const response = await $fetch<{
      success: boolean
      data?: { addresses: AddressItem[] }
      error?: { message: string }
    }>('/api/order/addresses', { method: 'POST', body: { adapterConfig } })

    if (response.success && response.data) {
      addresses.value = response.data.addresses
      if (!addressId.value && addresses.value.length > 0) {
        addressId.value = addresses.value[0].addressId
      }
    } else {
      addressError.value = response.error?.message || '读取地址失败'
    }
  } catch (error) {
    addressError.value = error instanceof Error ? error.message : '读取地址失败'
  } finally {
    isLoadingAddress.value = false
  }
}

const handlePrecheck = async () => {
  if (!props.product?.productNo) {
    toast.warning('缺少商品货号，无法预检')
    return
  }

  const adapterConfig = buildAdapterConfig()
  if (!adapterConfig) {
    toast.warning('请先完成系统配置')
    return
  }

  isChecking.value = true
  precheck.value = null

  try {
    const response = await $fetch<{
      success: boolean
      data?: PrecheckResult
      error?: { message: string }
    }>('/api/order/precheck', {
      method: 'POST',
      body: {
        adapterConfig,
        goodsId: props.product.productId,
        goodsNo: props.product.productNo,
        num: num.value,
        addressId: addressId.value || undefined,
      },
    })

    if (response.success && response.data) {
      precheck.value = response.data
      if (response.data.success) {
        toast.success('预检通过，可以创建任务')
      }
    } else {
      toast.error(response.error?.message || '预检失败')
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '预检失败')
  } finally {
    isChecking.value = false
  }
}

const handleSubmit = async () => {
  if (!props.product?.productNo) {
    toast.warning('缺少商品货号，无法自动下单')
    return
  }

  const taskId = await createMonitorTask(
    {
      productId: props.product.productId,
      productName: props.product.productName || '',
      productImage: props.product.productImage,
    },
    {
      duration: duration.value,
      autoOrder: {
        enabled: true,
        num: num.value,
        payTool: payTool.value,
        ...(addressId.value ? { addressId: addressId.value } : {}),
      },
    }
  )

  if (taskId) {
    emit('created', taskId)
    emit('update:open', false)
  }
}

const handleClose = () => {
  emit('update:open', false)
}

const handleOpenChange = (value: boolean) => {
  emit('update:open', value)
}

// 打开时拉一次地址；切商品时清掉上一次的预检结果
watch(
  () => props.open,
  (open) => {
    if (open) {
      precheck.value = null
      if (addresses.value.length === 0) {
        loadAddresses()
      }
    }
  }
)

watch(
  () => props.product?.productId,
  () => {
    precheck.value = null
  }
)
</script>
