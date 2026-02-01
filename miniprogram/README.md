# 凑单计算器小程序 - TypeScript 版本

## 项目结构

```
shopping-assistant/
├── shared/                      # 共享代码（TypeScript）
│   └── OrderPoolingSolver.ts   # 核心算法（Web 端和小程序端共用）
├── miniprogram/                 # 微信小程序（TypeScript）
│   ├── pages/
│   │   └── calculator/
│   │       ├── index.wxml       # 页面模板
│   │       ├── index.ts         # 页面逻辑（TypeScript）
│   │       ├── index.js         # 编译后的 JS
│   │       ├── index.wxss       # 页面样式
│   │       └── index.json       # 页面配置
│   ├── app.ts                  # 小程序入口（TypeScript）
│   ├── app.js                  # 编译后的 JS
│   ├── app.json                # 小程序配置
│   ├── app.wxss                # 全局样式
│   ├── tsconfig.json           # TypeScript 配置
│   ├── build.sh                # 构建脚本
│   ├── sitemap.json            # 搜索配置
│   └── project.config.json     # 项目配置
└── web/                        # Web 端（Nuxt3 + TypeScript）
    └── pages/calculator/
        ├── index.vue
        └── OrderPoolingSolver.ts # 引用 shared 版本
```

## 核心算法复用

`OrderPoolingSolver.ts` 是纯 TypeScript 算法文件，无任何平台依赖：

- **Web 端**: `import { OrderPoolingSolver } from '../../../shared/OrderPoolingSolver'`
- **小程序端**: `import { OrderPoolingSolver } from '@shared/OrderPoolingSolver'`

使用路径别名 `@shared/*` 简化引用。

## 开发指南

### 1. 使用微信开发者工具打开项目

1. 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
2. 打开微信开发者工具
3. 导入项目，选择 `/Users/yanxia/Documents/shopping-assistant/miniprogram` 目录
4. AppID 可以选择"测试号"或填写自己的 AppID

### 2. 安装依赖

```bash
cd miniprogram
npm install
```

### 3. 编译 TypeScript

**方式一：使用项目根目录的脚本**
```bash
npm run miniprogram:build
```

**方式二：在小程序目录下编译**
```bash
cd miniprogram
./build.sh
```

**方式三：手动编译**
```bash
# 编译小程序 TS
cd miniprogram
npx tsc --project tsconfig.json

# 编译共享代码
cd ../shared
npx tsc --project tsconfig.miniprogram.json
```

### 4. 开发流程

1. 修改 `shared/OrderPoolingSolver.ts` (核心算法)
2. 修改 `miniprogram/pages/calculator/index.ts` (页面逻辑)
3. 运行编译命令生成 `.js` 文件
4. 在小程序开发者工具中预览效果

### 5. TypeScript 特性

✅ **完整类型支持**
```typescript
import { OrderPoolingSolver, OrderItem } from '@shared/OrderPoolingSolver'

interface PageData {
  items: Array<{ price: string; required: boolean }>
  result: ResultData | null
}

Page<PageData, WechatMiniprogram.Page.CustomOption>({
  data: { ... },
  onItemPriceChange(e: WechatMiniprogram.Input) { ... }
})
```

✅ **类型定义复用**
- 共享的 `OrderItem`, `Solution` 等类型直接引用
- 小程序特有的类型通过 `@types/wechat-miniprogram` 提供

✅ **编译时类型检查**
- 所有类型错误在编译时发现
- IDE 智能提示和自动补全

## 功能特性

- ✅ 批量输入商品价格（支持逗号、空格分隔）
- ✅ 手动添加/删除商品
- ✅ 标记必选商品
- ✅ 设置凑单价格和订单数量
- ✅ 智能计算最优凑单方案
- ✅ 显示多个备选方案
- ✅ 订单分配详情展示
- ✅ 实时统计商品总价和差额
- ✅ 完整的 TypeScript 类型支持

## 技术栈

- **小程序框架**: 原生微信小程序 + TypeScript
- **核心算法**: TypeScript + 深度优先搜索（DFS）
- **样式**: WXSS
- **代码复用**: 核心算法 100% 复用，类型定义 100% 复用
- **开发体验**: 完整的类型检查和 IDE 支持

## TypeScript 配置说明

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2019",           // 目标 ES 版本
    "module": "ES6",              // 模块系统
    "lib": ["ES2019"],            // 库文件（支持 flatMap 等）
    "moduleResolution": "node",   // 模块解析
    "paths": {
      "@shared/*": ["../shared/*"] // 路径别名
    },
    "types": [],                 // 使用 node_modules/@types
    "skipLibCheck": true,        // 跳过类型库检查
    "strict": false              // 宽松模式
  }
}
```

### project.config.json

```json
{
  "setting": {
    "useCompilerPlugins": ["typescript"]  // 启用 TypeScript 编译器
  }
}
```

## 对比：JavaScript 版本 vs TypeScript 版本

| 特性 | JavaScript 版本 | TypeScript 版本 |
|------|---------------|----------------|
| **类型安全** | ❌ 无 | ✅ 完整类型检查 |
| **类型提示** | ❌ 无 | ✅ IDE 智能提示 |
| **类型复用** | ❌ 无 | ✅ 共享类型定义 |
| **重构安全** | ⚠️ 易出错 | ✅ 编译时检查 |
| **开发体验** | ⭐⭐ | ⭐⭐⭐⭐⭐ |

## 注意事项

1. **每次修改 TS 文件后需要重新编译**
   ```bash
   npm run miniprogram:build
   ```

2. **微信开发者工具配置**
   - 详情 → 本地设置 → 开启"增强编译"
   - TypeScript 编译器会在开发者工具中自动编译

3. **共享代码更新**
   - 修改 `shared/OrderPoolingSolver.ts` 后
   - 运行编译命令同时更新 Web 端和小程序端

## 快速开始

```bash
# 1. 安装依赖
cd miniprogram
npm install

# 2. 编译 TypeScript
npm run miniprogram:build

# 3. 用微信开发者工具打开 miniprogram 目录
# 4. 点击"编译"即可预览
```

## 总结

使用 TypeScript 版本，我们获得了：

✅ **100% 类型安全** - 编译时发现错误
✅ **100% 类型复用** - Web 端和小程序端共享类型定义
✅ **更好的开发体验** - IDE 智能提示和自动补全
✅ **更易维护** - 重构时类型系统保驾护航
✅ **代码质量提升** - 类型检查减少运行时错误

核心算法和类型定义在两个平台之间完全同步！
