<template>
  <UiDialog :open="open" title="新增 Tab 监控" size="lg" @update:open="emit('update:open', $event)">
    <form id="tabMonitorForm" @submit.prevent="handleSubmit">
      <div class="space-y-5">
        <!-- Tab 选择（快速选择） -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">快速选择</label>
          <UiSelect
            v-model="selectedTabOption"
            :options="tabOptions"
            placeholder="-- 请选择 --"
            @change="handleSelectTabFromDropdown"
          />
        </div>

        <!-- Tab ID 和 Tab 名称 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Tab ID <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.tabId"
              type="text"
              placeholder="请输入 Tab ID"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">
              Tab 名称 <span class="text-red-500">*</span>
            </label>
            <input
              v-model="form.tabName"
              type="text"
              placeholder="例如：羽绒服专区"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              required
            />
          </div>
        </div>

        <!-- 检测间隔、监控时长 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">检测间隔（秒）</label>
            <input
              v-model.number="form.interval"
              type="number"
              min="10"
              placeholder="默认 300 秒"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <p class="mt-1 text-xs text-gray-500">建议 300 秒以上，避免频繁请求</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1.5">监控时长（秒）</label>
            <input
              v-model.number="form.duration"
              type="number"
              min="0"
              placeholder="默认 10800 秒（3 小时）"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
            <p class="mt-1 text-xs text-gray-500">
              0 表示无限监控
              <span v-if="form.duration > 0" class="text-gray-400">· 约 {{ formatDuration(form.duration) }}</span>
            </p>
          </div>
        </div>

        <!-- 监控模式 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">监控模式</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              v-for="option in MODES"
              :key="option.value"
              class="flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors"
              :class="form.mode === option.value ? 'border-blue-500 bg-blue-50/60' : 'border-gray-200 hover:border-gray-300'"
            >
              <input
                v-model="form.mode"
                type="radio"
                :value="option.value"
                class="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span>
                <span class="block text-sm font-medium text-gray-900">{{ option.label }}</span>
                <span class="block mt-1 text-xs text-gray-500 leading-relaxed">{{ option.desc }}</span>
              </span>
            </label>
          </div>
          <p class="mt-2 text-xs text-gray-500">
            每轮先只查第一页；第一页出现新商品时，自动翻页抓取全部商品；没有新商品的轮次只看第一页。
          </p>
          <p class="mt-1 text-xs text-gray-400">
            任务跨天运行时，每天凌晨 04:00 会清空已记录商品并重新抓取一次，以当时的在售商品作为新一天的起点。
          </p>
        </div>

        <!-- 触发阈值 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1.5">
            {{ form.mode === 'accumulate' ? '累计新增多少件商品后提醒' : '每轮变化多少件商品后提醒' }}
          </label>
          <input
            v-model.number="form.minChangeCount"
            type="number"
            min="1"
            placeholder="默认 10"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
          />
          <p class="mt-1 text-xs text-gray-500">
            <template v-if="form.mode === 'accumulate'">
              任务内按商品去重累计，凑够这个数量才发一次邮件；同一商品反复上下架只记一次。
            </template>
            <template v-else>
              每轮与上一轮对比，新增和下架商品合计达到这个数量就发一次邮件；反复上下架会反复提醒。
            </template>
          </p>
        </div>

        <!-- 高级选项（默认收起，避免表单过长） -->
        <details class="border border-gray-200 rounded-lg">
          <summary class="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none">
            <span class="text-sm font-medium text-gray-700">高级选项</span>
            <span class="text-xs text-gray-400">生效时段 · 排序方式</span>
          </summary>

          <div class="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">
            <div class="pt-3">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  v-model="form.useActiveWindow"
                  type="checkbox"
                  class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-sm font-medium text-gray-700">只在指定时段运行（可选）</span>
              </label>
              <div v-if="form.useActiveWindow" class="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">每天开始时间</label>
                  <input
                    v-model="form.windowStart"
                    type="time"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1.5">每天结束时间</label>
                  <input
                    v-model="form.windowEnd"
                    type="time"
                    class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>
              <p v-if="form.useActiveWindow" class="mt-2 text-xs text-gray-500">
                时段外任务休眠、不发请求，也不消耗监控时长；结束时间早于开始时间表示跨天（如 22:00–02:00）。
                进入时段时会重新建立基线，休眠期间的商品变化不会补推。
              </p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1.5">价格排序方式</label>
              <UiSelect v-model="form.sort" :options="SORT_OPTIONS" />
              <p class="mt-1 text-xs text-gray-500">只影响抓取到的商品顺序，不改变监控范围</p>
            </div>
          </div>
        </details>
      </div>
    </form>

    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <UiButton type="button" variant="outline" @click="emit('update:open', false)">取消</UiButton>
        <UiButton type="submit" form="tabMonitorForm" :loading="isCreating" :disabled="isCreating">
          创建监控
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import { formatDuration } from '@/utils/taskFormat'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  created: []
}>()

/** 常用 Tab 的快捷选项；也允许直接手填 ID */
const TAB_OPTIONS = [
  { id: '146453', name: '2000-1100-羽绒服' },
  { id: '133353', name: '2000-1100-外套' },
  { id: '33713', name: '3折-19元封顶' },
  { id: '78820', name: '3折-39元封顶' },
  { id: '78821', name: '3折-79元封顶' },
  { id: '78822', name: '3折-更多超值' },
  { id: '33478', name: '5折-19元封顶' },
  { id: '78823', name: '5折-39元封顶' },
  { id: '78824', name: '5折-79元封顶' },
  { id: '78825', name: '5折-更多超值' },
  { id: '91342', name: '800-400-上装预告' },
]

const MODES = [
  {
    value: 'accumulate' as const,
    label: '累计新商品',
    desc: '记住任务内出现过的所有商品，累计够数量才提醒一次；反复上下架不重复提醒。',
  },
  {
    value: 'diff' as const,
    label: '逐轮对比',
    desc: '第一页出现新商品时翻页抓全部，和上一轮全量对比，新增 + 下架达到数量就提醒。',
  },
]

const defaultForm = () => ({
  tabId: '',
  tabName: '',
  interval: 300,
  duration: 10800,
  sort: 1,
  mode: 'accumulate' as 'accumulate' | 'diff',
  minChangeCount: 10,
  useActiveWindow: false,
  windowStart: '09:00',
  windowEnd: '23:00',
})

/** 快速选择下拉选项 */
const tabOptions = TAB_OPTIONS.map(tab => ({
  value: tab.id,
  label: `${tab.name} (ID: ${tab.id})`,
}))

/** 价格排序方式 */
const SORT_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '默认排序' },
  { value: 3, label: '从高到低' },
  { value: 4, label: '从低到高' },
]

const form = ref(defaultForm())
const selectedTabOption = ref('')

const { createTabMonitorTask, isLoading: isCreating } = useTabMonitor()

const handleSelectTabFromDropdown = () => {
  const selected = TAB_OPTIONS.find(tab => tab.id === selectedTabOption.value)
  if (!selected) return
  form.value.tabId = selected.id
  form.value.tabName = selected.name
}

const handleSubmit = async () => {
  if (!form.value.tabId.trim() || !form.value.tabName.trim()) return

  const { useActiveWindow, windowStart, windowEnd, ...rest } = form.value
  const taskId = await createTabMonitorTask({
    ...rest,
    ...(useActiveWindow ? { activeWindow: { start: windowStart, end: windowEnd } } : {}),
  })
  if (!taskId) return

  form.value = defaultForm()
  selectedTabOption.value = ''
  emit('created')
}

// 每次打开都回到干净状态，避免上次的残留参数
watch(
  () => props.open,
  open => {
    if (open) form.value = defaultForm()
  }
)
</script>
