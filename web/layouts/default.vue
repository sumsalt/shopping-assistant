<template>
  <div class="min-h-screen bg-gray-50">
    <!-- 头部导航 -->
    <LayoutHeader
      :is-configured="isConfigured"
      @menu-toggle="handleMenuToggle"
    />

    <!-- 主体内容 -->
    <div class="flex">
      <!-- 侧边栏 -->
      <LayoutSidebar
        :is-open="isSidebarOpen"
        @close="handleSidebarClose"
      />

      <!-- 内容区域 -->
      <main class="flex-1 min-w-0 min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8 max-w-screen">
        <slot />
      </main>
    </div>

    <!-- 全局 Toast -->
    <UiToast
      v-model:visible="toastState.visible"
      :type="toastState.type"
      :message="toastState.message"
      :description="toastState.description"
      :duration="toastState.duration"
      :closable="toastState.closable"
      :position="toastState.position"
    />
  </div>
</template>

<script setup lang="ts">
// 导入 Toast composable
const { state: toastState } = useToast()

// 导入配置 store
const configStore = useConfigStore()

// 侧边栏状态
const isSidebarOpen = ref(false)

// 配置状态
//
// 未初始化时 activeAccount 还是空，Header 会先闪一句「请先完成配置」，
// 因此只在配置拉回来之后才交给它判断
const isConfigured = computed(() => configStore.isInitialized && configStore.isConfigured)


// 菜单切换处理
const handleMenuToggle = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

// 侧边栏关闭处理
const handleSidebarClose = () => {
  isSidebarOpen.value = false
}
</script>
