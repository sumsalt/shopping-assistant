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
              <UiTextarea
                v-model="bulkInput"
                placeholder="支持接龙格式粘贴：名称 价格，或多个价格用逗号分隔

示例：
1. 夏言 123.45
2. 张三 23.45
3. 李四 89.99

或纯数字：59.9,88,129.5"
                :rows="6"
                @input="handleBulkInput"
              />
              <p class="mt-1 text-xs text-gray-500">
                支持批量输入，格式如："张三 123.45" 或 "59.9,88,129.5"
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
                class="flex gap-2 items-center"
              >
                <UiInput
                  v-model="item.name"
                  placeholder="名称"
                  class="w-16 sm:w-24"
                />
                <UiInput
                  v-model="item.price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="价格"
                  class="flex-1 min-w-[100px]"
                />
                <div class="flex items-center gap-2 flex-shrink-0">
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
                  class="flex-shrink-0"
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
        <div class="flex gap-2">
          <UiButton
            variant="outline"
            size="lg"
            @click="showHistory = true"
          >
            <svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            历史记录
          </UiButton>
          <UiButton
            variant="primary"
            size="lg"
            class="flex-1"
            :disabled="validItemCount === 0"
            @click="calculate"
          >
            计算凑单方案
          </UiButton>
        </div>
      </div>
    </div>

    <!-- 历史记录弹窗 -->
    <div
      v-if="showHistory"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      @click.self="showHistory = false"
    >
      <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div class="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="text-lg font-medium text-gray-900">历史记录</h3>
          <button
            @click="showHistory = false"
            class="text-gray-400 hover:text-gray-600"
          >
            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="p-4 overflow-y-auto flex-1">
          <div v-if="historyList.length === 0" class="text-center py-8 text-gray-500">
            暂无历史记录
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="(record, index) in historyList"
              :key="index"
              class="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              @click="restoreFromHistory(record)"
            >
              <div class="flex items-start justify-between mb-2">
                <div class="text-sm text-gray-500">
                  {{ record.timestamp }}
                </div>
                <button
                  @click.stop="deleteHistoryItem(index)"
                  class="text-gray-400 hover:text-red-500 p-1"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              <div class="text-sm font-medium text-gray-900 mb-1">
                {{ record.items.length }} 件商品，凑单 ¥{{ record.targetPrice }}
              </div>
              <div class="text-xs text-gray-500">
                商品总价: ¥{{ record.totalPrice.toFixed(2) }}
              </div>
              <div class="mt-2 flex flex-wrap gap-1">
                <span
                  v-for="(item, itemIndex) in record.items.slice(0, 5)"
                  :key="itemIndex"
                  class="px-2 py-1 text-xs bg-gray-100 rounded"
                >
                  {{ item.name || `商品${itemIndex + 1}` }}: ¥{{ item.price }}
                </span>
                <span
                  v-if="record.items.length > 5"
                  class="px-2 py-1 text-xs bg-gray-100 rounded"
                >
                  +{{ record.items.length - 5 }} 件
                </span>
              </div>
            </div>
          </div>
          <div
            v-if="historyList.length > 0"
            class="mt-4 pt-4 border-t border-gray-200"
          >
            <button
              @click="clearHistory"
              class="w-full text-sm text-red-600 hover:text-red-700 py-2"
            >
              清空历史记录
            </button>
          </div>
        </div>
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
                  <div class="flex items-center gap-2">
                    <span v-if="getActualPrice(item, -1)" class="text-xs text-purple-600">
                      实付: ¥{{ getActualPrice(item, -1)?.toFixed(2) }}
                    </span>
                    <span class="font-medium text-gray-900">¥{{ item.price.toFixed(2) }}</span>
                  </div>
                </div>
              </div>
              <div class="mt-3 pt-3 border-t border-gray-200 flex justify-center">
                <UiButton
                  variant="outline"
                  size="sm"
                  @click="openActualPriceDialog(orderIndex, -1)"
                >
                  计算实付
                </UiButton>
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
            v-for="(solution, idx) in result.allSolutions.slice(1, 6)"
            :key="idx"
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
            <div class="space-y-2">
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
                <div class="space-y-1">
                  <div
                    v-for="(item, itemIndex) in order.items"
                    :key="itemIndex"
                    class="flex items-center justify-between px-2 py-1 bg-white rounded"
                  >
                    <div class="flex items-center gap-1">
                      <span class="text-xs" :class="item.required ? 'bg-orange-100 text-orange-700 px-1 py-0.5 rounded' : ''">
                        {{ item.name }}
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span v-if="getActualPrice(item, idx + 1)" class="text-xs text-purple-600">
                        实付: ¥{{ getActualPrice(item, idx + 1)?.toFixed(2) }}
                      </span>
                      <span class="text-xs">¥{{ item.price.toFixed(2) }}</span>
                    </div>
                  </div>
                </div>
                <div class="mt-2 pt-2 border-t border-gray-200 flex justify-center">
                  <UiButton
                    variant="outline"
                    size="sm"
                    class="text-xs"
                    @click="openActualPriceDialog(orderIndex, idx + 1)"
                  >
                    计算实付
                  </UiButton>
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
        <li>点击"计算实际价格"按钮，输入实际支付价格，系统将计算每个商品的实际支付金额</li>
      </ul>
    </div>

    <!-- 实际价格弹窗 -->
    <UiDialog :open="actualPriceDialog.show" @update:open="actualPriceDialog.show = $event" title="输入实际支付价格">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            实际支付价格（元）
          </label>
          <UiInput
            v-model="actualPriceDialog.actualPrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="输入实际支付的价格"
            class="w-full"
          />
          <p class="mt-1 text-xs text-gray-500">
            输入实际支付的价格，系统将按比例计算每个商品的实际支付金额
          </p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            额外费用（元，可选）
          </label>
          <UiInput
            v-model="actualPriceDialog.extraFee"
            type="number"
            step="0.01"
            min="0"
            placeholder="例如：运费"
            class="w-full"
          />
          <p class="mt-1 text-xs text-gray-500">
            额外费用（如运费）将平均分配给每个商品
          </p>
        </div>
      </div>
      <template #footer>
        <div class="flex gap-2">
          <UiButton variant="outline" @click="closeActualPriceDialog">取消</UiButton>
          <UiButton variant="primary" @click="calculateActualPrices">计算</UiButton>
        </div>
      </template>
    </UiDialog>
  </div>
</template>

<script setup lang="ts">
import { OrderPoolingSolver } from '../../../shared/OrderPoolingSolver';

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
  { name: '', price: '', required: false },
  { name: '', price: '', required: false },
  { name: '', price: '', required: false },
])

// 凑单价格
const targetPrice = ref('')

// 凑单数量
const targetQuantity = ref('1')

// 计算结果
const result = ref<any>(null)

// 是否已经计算过
const hasCalculated = ref(false)

// 历史记录
const showHistory = ref(false)
const historyList = ref<Array<{
  timestamp: string
  items: Array<{ name: string; price: string; required: boolean }>
  targetPrice: string
  targetQuantity: string
  totalPrice: number
}>>([])

// 初始化时加载历史记录
onMounted(() => {
  loadHistory()
})

// 加载历史记录
const loadHistory = () => {
  try {
    const saved = localStorage.getItem('calculator-history')
    if (saved) {
      historyList.value = JSON.parse(saved)
    }
  } catch (error) {
    console.error('加载历史记录失败:', error)
  }
}

// 保存历史记录
const saveHistory = () => {
  const totalPrice = items.value.reduce((sum, item) => {
    const price = parseFloat(item.price)
    return sum + (isNaN(price) ? 0 : price)
  }, 0)

  const record = {
    timestamp: new Date().toLocaleString('zh-CN'),
    items: items.value.filter(item => {
      const price = parseFloat(item.price)
      return !isNaN(price) && price > 0
    }).map(item => ({ ...item })),
    targetPrice: targetPrice.value,
    targetQuantity: targetQuantity.value,
    totalPrice
  }

  // 只保存有效的记录
  if (record.items.length > 0 && record.targetPrice) {
    // 添加到开头
    historyList.value.unshift(record)
    // 限制最多保存 20 条
    if (historyList.value.length > 20) {
      historyList.value = historyList.value.slice(0, 20)
    }
    // 保存到 localStorage
    localStorage.setItem('calculator-history', JSON.stringify(historyList.value))
  }
}

// 从历史记录恢复
const restoreFromHistory = (record: any) => {
  items.value = record.items.map((item: any) => ({
    name: item.name,
    price: item.price,
    required: item.required
  }))
  targetPrice.value = record.targetPrice
  targetQuantity.value = record.targetQuantity
  showHistory.value = false
  toast.success('已恢复历史记录')
}

// 删除单条历史记录
const deleteHistoryItem = (index: number) => {
  historyList.value.splice(index, 1)
  localStorage.setItem('calculator-history', JSON.stringify(historyList.value))
}

// 清空历史记录
const clearHistory = () => {
  if (confirm('确定要清空所有历史记录吗？')) {
    historyList.value = []
    localStorage.removeItem('calculator-history')
    showHistory.value = false
  }
}

// 实际支付弹窗状态
const actualPriceDialog = ref({
  show: false,
  orderIndex: -1,
  solutionIndex: -1,
  actualPrice: '',
  extraFee: ''
})

// 计算后的商品实际价格映射
const actualItemPrices = ref<Map<string, Map<number, number>>>(new Map())


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

  // 尝试解析接龙格式：识别名称和价格
  const parsedItems = parseJielongInput(input)

  if (parsedItems.length > 0) {
    // 将解析出的商品填充到 items
    items.value = parsedItems.map(item => ({
      name: item.name || '',
      price: item.price.toString(),
      required: false
    }))
    toast.success(`已添加 ${parsedItems.length} 个商品`)
  }
}

/**
 * 解析接龙输入格式
 * 支持多种格式：
 * 1. 接龙格式：以 #接龙 开头，如 "#接龙\n1. 张三 123.45"
 * 2. 纯数字格式：逗号或空格分隔的数字，如 "59.9,88,129.5"
 */
function parseJielongInput(input: string): Array<{ name: string; price: number }> {
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
}

// 添加商品
const addItem = () => {
  items.value.push({ name: '', price: '', required: false })
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
  // 清空之前的实际价格计算结果
  actualItemPrices.value.clear()
  // 获取有效的商品价格
  const validItems = items.value
    .map((item, index) => ({
      id: index,
      name: item.name || `商品 ${index + 1}`,
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

  // 保存到历史记录
  saveHistory()
}

// 打开实际支付价格弹窗
const openActualPriceDialog = (orderIndex: number, solutionIndex: number = -1) => {
  actualPriceDialog.value = {
    show: true,
    orderIndex,
    solutionIndex,
    actualPrice: '',
    extraFee: ''
  }
}

// 关闭弹窗
const closeActualPriceDialog = () => {
  actualPriceDialog.value.show = false
  actualPriceDialog.value.actualPrice = ''
  actualPriceDialog.value.extraFee = ''
}

// 计算商品实际价格
const calculateActualPrices = () => {
  const { orderIndex, solutionIndex, actualPrice, extraFee } = actualPriceDialog.value
  const actualPayPrice = parseFloat(actualPrice)
  const feeAmount = parseFloat(extraFee) || 0

  if (isNaN(actualPayPrice) || actualPayPrice <= 0) {
    toast.error('请输入有效的实际支付价格')
    return
  }

  if (feeAmount < 0) {
    toast.error('额外费用不能为负数')
    return
  }

  // 获取对应方案的订单
  let order: any
  if (solutionIndex === -1) {
    // 最优方案
    order = result.value.orders[orderIndex]
  } else {
    // 备选方案
    order = result.value.allSolutions[solutionIndex].orders[orderIndex]
  }

  if (!order) {
    toast.error('订单信息不存在')
    return
  }

  // 计算每个商品的实际价格
  const orderOriginalTotal = order.items.reduce((sum: number, item: any) => sum + item.price, 0)
  const ratio = actualPayPrice / orderOriginalTotal

  // 计算每个商品的额外费用分配（均摊）
  const itemCount = order.items.length
  const feePerItem = feeAmount / itemCount

  // 存储每个商品的实际价格
  const solutionKey = solutionIndex === -1 ? 'best' : `alt-${solutionIndex}`
  if (!actualItemPrices.value.has(solutionKey)) {
    actualItemPrices.value.set(solutionKey, new Map())
  }

  const solutionPrices = actualItemPrices.value.get(solutionKey)!
  order.items.forEach((item: any) => {
    // 商品实际价格 = 商品原价 × 比例 + 额外费用均摊
    const itemActualPrice = item.price * ratio + feePerItem
    solutionPrices.set(item.id, itemActualPrice)
  })

  const message = feeAmount > 0
    ? `已计算完成，实际支付 ¥${actualPayPrice.toFixed(2)}，额外费用 ¥${feeAmount.toFixed(2)}`
    : `已计算完成，实际支付 ¥${actualPayPrice.toFixed(2)}`
  toast.success(message)
  closeActualPriceDialog()
}

// 获取商品的实际价格
const getActualPrice = (item: any, solutionIndex: number = -1) => {
  const solutionKey = solutionIndex === -1 ? 'best' : `alt-${solutionIndex}`
  const solutionPrices = actualItemPrices.value.get(solutionKey)
  if (!solutionPrices) return null
  return solutionPrices.get(item.id) || null
}
</script>
