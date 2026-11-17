<template>
  <!-- 卡片内的快捷操作：到货监控 / 价格监控 / 一键下单 / 取消收藏 / 打开一手 App -->
  <div class="mt-2 flex items-center gap-1.5 border-t border-gray-100 pt-2" @click.stop>
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-md border border-blue-200 text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
      title="到货监控"
      aria-label="到货监控"
      @click.stop="emit('stock')"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    </button>

    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-200 text-emerald-600 transition-colors hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1"
      title="价格监控"
      aria-label="价格监控"
      @click.stop="emit('price')"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    </button>

    <button
      v-if="showOrder"
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed"
      :class="orderLoading ? 'animate-pulse' : ''"
      :title="orderLoading ? '正在查询库存...' : '一键下单'"
      aria-label="一键下单"
      :disabled="orderDisabled"
      @click.stop="emit('order')"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 5h12m-6-3a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z" />
      </svg>
    </button>

    <button
      v-if="showRemove"
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-1"
      title="取消收藏"
      aria-label="取消收藏"
      @click.stop="emit('remove')"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>

    <button
      v-if="showApp"
      type="button"
      class="ml-auto flex h-7 w-7 items-center justify-center rounded-md border border-orange-200 text-orange-600 transition-colors hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1"
      title="打开一手 App"
      aria-label="打开一手 App"
      @click.stop="emit('openApp')"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * 商品卡片上的快捷操作
 *
 * 卡片本身是整块可点的（进详情页），所以每个按钮都要 stop，避免误跳。
 * 「打开一手 App」只在手机端出现：桌面浏览器没有 App 可开。
 */
interface Props {
  /** 是否显示「打开一手 App」（手机端才为 true） */
  showApp?: boolean
  /** 是否显示「取消收藏」（收藏夹场景下为 true） */
  showRemove?: boolean
  /** 是否显示「一键下单」 */
  showOrder?: boolean
  /** 一键下单按钮是否禁用（如商品停售/无货） */
  orderDisabled?: boolean
  /** 一键下单按钮是否处于查询库存/下单中（显示脉冲动画） */
  orderLoading?: boolean
}

withDefaults(defineProps<Props>(), {
  showApp: false,
  showRemove: false,
  showOrder: false,
  orderDisabled: false,
  orderLoading: false,
})

const emit = defineEmits<{
  stock: []
  price: []
  remove: []
  openApp: []
  order: []
}>()
</script>
