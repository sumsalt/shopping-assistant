// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcPath = resolve(__dirname, '../src')

export default defineNuxtConfig({
  devtools: { enabled: true },

  // TypeScript 配置
  typescript: {
    strict: true,
    typeCheck: true,
  },

  // 模块配置
  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
  ],

  // TailwindCSS 配置
  tailwindcss: {
    cssPath: '~/assets/css/tailwind.css',
    configPath: 'tailwind.config.ts',
  },

  // 路径别名
  alias: {
    '@': '~/',
    '@core': srcPath,
  },

  // Nitro 配置（Server API）
  nitro: {
    alias: {
      '@core': srcPath,
    },
  },

  // 运行时配置
  runtimeConfig: {
    // 服务端私有配置
  },

  // 兼容性日期
  compatibilityDate: '2024-11-01',

  // 应用配置
  app: {
    head: {
      title: '库存监控助手',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '库存监控与查询助手' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    },
  },
})
