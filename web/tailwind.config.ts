import type { Config } from 'tailwindcss'

export default {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './app.vue',
    './error.vue',
  ],
  theme: {
    extend: {
      colors: {
        // 库存状态颜色
        'stock-available': '#22c55e', // green-500
        'stock-unavailable': '#ef4444', // red-500
        'stock-loading': '#9ca3af', // gray-400
      },
    },
  },
  plugins: [],
} satisfies Config
