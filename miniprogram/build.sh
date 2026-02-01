#!/bin/bash

echo "🔧 开始编译 TypeScript..."

# 编译小程序 TS
npx tsc --project tsconfig.json

# 编译共享代码
cd ../shared
npx tsc --project tsconfig.miniprogram.json
cd ../miniprogram

echo "✅ 编译完成!"
