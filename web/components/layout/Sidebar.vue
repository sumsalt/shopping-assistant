<template>
  <!-- 移动端侧边栏遮罩 -->
  <Transition
    enter-active-class="transition-opacity duration-300"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-300"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-gray-600 bg-opacity-75 z-40 lg:hidden"
      @click="handleClose"
    />
  </Transition>

  <!-- 侧边栏 -->
  <aside
    :class="[
      'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
      isOpen ? 'translate-x-0' : '-translate-x-full'
    ]"
  >
    <div class="flex flex-col h-full">
      <!-- 移动端关闭按钮 -->
      <div class="lg:hidden flex items-center justify-between p-4 border-b border-gray-200">
        <span class="text-lg font-semibold text-gray-900">导航菜单</span>
        <button
          type="button"
          class="p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          aria-label="关闭菜单"
          @click="handleClose"
        >
          <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 导航菜单 -->
      <nav class="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        <NuxtLink
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          :class="[
            'flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            isActive(item.path)
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          ]"
          @click="handleLinkClick"
        >
          <component :is="item.icon" class="h-5 w-5 mr-3" />
          {{ item.label }}
        </NuxtLink>
      </nav>

      <!-- 底部信息 -->
      <div class="p-4 border-t border-gray-200">
        <div class="text-xs text-gray-500 text-center">
          库存监控助手 v1.0.0
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
// 组件属性定义
interface Props {
  isOpen?: boolean
}

// 默认属性
withDefaults(defineProps<Props>(), {
  isOpen: false,
})

// 定义事件
const emit = defineEmits<{
  close: []
}>()

// 路由
const route = useRoute()

// 菜单项配置
const menuItems = [
  {
    path: '/',
    label: '首页',
    icon: defineComponent({
      template: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>`,
    }),
  },
  {
    path: '/stock/check',
    label: '库存查询',
    icon: defineComponent({
      template: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>`,
    }),
  },
  {
    path: '/collection',
    label: '收藏夹监控',
    icon: defineComponent({
      template: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>`,
    }),
  },
  {
    path: '/settings',
    label: '系统配置',
    icon: defineComponent({
      template: `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`,
    }),
  },
]

// 判断路由是否激活
const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(path)
}

// 关闭侧边栏
const handleClose = () => {
  emit('close')
}

// 点击链接后关闭侧边栏（移动端）
const handleLinkClick = () => {
  emit('close')
}
</script>
