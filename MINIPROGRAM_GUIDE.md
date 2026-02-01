# 凑单计算器小程序实现指南

## 项目结构

```
shopping-assistant/
├── shared/                          # 🔑 共享代码目录
│   ├── OrderPoolingSolver.ts       # 核心算法 (TypeScript)
│   ├── package.json                # 共享包配置
│   └── tsconfig.miniprogram.json   # 小程序编译配置
├── miniprogram/                     # 📱 微信小程序
│   ├── pages/
│   │   └── calculator/
│   │       ├── index.wxml          # 页面模板
│   │       ├── index.js            # 页面逻辑
│   │       ├── index.wxss          # 页面样式
│   │       └── index.json          # 页面配置
│   ├── OrderPoolingSolver.js       # 编译后的核心算法
│   ├── app.js                      # 小程序入口
│   ├── app.json                    # 小程序配置
│   ├── app.wxss                    # 全局样式
│   ├── project.config.json         # 项目配置
│   ├── sitemap.json                # 搜索配置
│   └── README.md                   # 详细说明
└── web/                            # 🌐 Web 端（Nuxt3）
    └── pages/calculator/
        ├── index.vue               # 引用共享算法
        └── OrderPoolingSolver.ts   # (旧文件，可删除)
```

## 核心算法复用

### 100% 复用

`OrderPoolingSolver.ts` 是纯算法实现，完全无平台依赖：

```typescript
// 核心算法逻辑
export class OrderPoolingSolver {
  constructor(items: OrderItem[], targetPrice: number, orderCount: number) { ... }
  solve(): CalculationResult { ... }
}
```

**被两个平台引用：**
- Web 端: `import { OrderPoolingSolver } from '../../../shared/OrderPoolingSolver'`
- 小程序: `import { OrderPoolingSolver } from '../../../shared/OrderPoolingSolver.js'`

## 快速开始

### 1. 编译核心算法

```bash
# 编译 TypeScript 为 JavaScript 供小程序使用
npm run shared:build
```

### 2. 在微信开发者工具中打开

1. 打开微信开发者工具
2. 导入项目，选择 `/Users/yanxia/Documents/shopping-assistant/miniprogram` 目录
3. AppID 选择"测试号"或填写自己的 AppID
4. 点击"编译"即可预览

### 3. 修改算法后重新编译

```bash
# 每次修改 shared/OrderPoolingSolver.ts 后
npm run shared:build
```

## 代码复用度对比

| 模块 | 复用度 | 说明 |
|------|--------|------|
| 核心算法 `OrderPoolingSolver.ts` | **100%** | 无修改直接使用 |
| 类型定义 `interface` | **100%** | TypeScript 类型定义 |
| 数据模型 | **100%** | `OrderItem`, `Solution` 等结构 |
| 计算逻辑 | **100%** | DFS 算法、剪枝策略 |
| UI 视图 | **0%** | 小程序需重写 (WXML + WXSS) |
| 页面逻辑 | **80%** | 需适配小程序 API (如 `wx.showToast`) |

## 小程序实现要点

### 1. 模板语法差异

```vue
<!-- Web 端 (Vue3) -->
<div class="container">
  <input v-model="bulkInput" />
  <button @click="calculate">计算</button>
</div>

<!-- 小程序 (WXML) -->
<view class="container">
  <input value="{{bulkInput}}" bindinput="onBulkInputChange" />
  <button bindtap="calculate">计算</button>
</view>
```

### 2. 数据绑定

```javascript
// Web 端 (Vue3)
const bulkInput = ref('')

// 小程序
Page({
  data: {
    bulkInput: ''
  },
  onBulkInputChange(e) {
    this.setData({ bulkInput: e.detail.value })
  }
})
```

### 3. API 差异

```javascript
// Web 端
toast.success('计算成功')

// 小程序
wx.showToast({
  title: '计算成功',
  icon: 'success'
})
```

## 功能清单

### ✅ 已实现功能

- [x] 批量输入商品价格（支持逗号、空格分隔）
- [x] 手动添加/删除商品
- [x] 标记必选商品
- [x] 设置凑单价格和订单数量
- [x] 智能计算最优凑单方案
- [x] 显示多个备选方案（最多 6 个）
- [x] 订单分配详情展示
- [x] 实时统计商品总价和差额
- [x] 无解状态提示
- [x] 使用说明

### 🎨 UI 特性

- 响应式设计（适配不同屏幕）
- 统计卡片（蓝色/绿色状态）
- 订单分配可视化
- 必选商品标记
- 优雅的空状态和错误提示

## 技术栈

- **小程序框架**: 原生微信小程序
- **核心算法**: TypeScript + 深度优先搜索（DFS）
- **样式**: WXSS (类似 CSS)
- **编译**: TypeScript → ES6 JavaScript

## 与其他方案对比

| 方案 | 核心算法复用 | UI 复用 | 开发效率 | 性能 |
|------|-------------|---------|---------|------|
| **原生小程序** | ✅ 100% | ❌ 0% | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| uni-app | ✅ 100% | ✅ 90% | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Taro | ✅ 100% | ✅ 85% | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

## 注意事项

1. **小程序不支持直接引用 `.ts` 文件**
   - 必须先编译为 `.js`
   - 使用 `npm run shared:build` 编译

2. **更新算法后的同步**
   ```bash
   # 修改 shared/OrderPoolingSolver.ts 后
   npm run shared:build
   # Web 端无需编译，直接运行
   ```

3. **小程序开发者工具配置**
   - 详情 → 本地设置 → 开启"ES6 转 ES5"
   - 开启"不校验合法域名"（开发时）

## 未来扩展

如果需要支持 uni-app 或 Taro，可以：

1. 将 `shared/OrderPoolingSolver.ts` 作为 npm 包发布
2. 小程序端: `npm install @shopping-assistant/shared`
3. 各平台通过 npm 引用同一份算法代码

## 总结

通过将核心算法抽离到 `shared/` 目录，实现了：
- ✅ 100% 的算法代码复用
- ✅ Web 端和小程序端逻辑同步更新
- ✅ 清晰的项目结构
- ✅ 便于后续扩展到其他平台

核心算法无需修改即可在两个平台运行，只需要编译生成对应的 JS 文件供小程序使用。
