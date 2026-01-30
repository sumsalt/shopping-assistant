# 实施计划

基于需求文档，以下是「库存查询核心逻辑」的实施任务清单。本次仅实现库存查询的核心功能，暂不涉及 Molt Bot Plugin 集成、到货提醒订阅等功能。

---

- [ ] 1. 初始化项目结构和类型定义
   - 创建项目目录结构（src/adapters、src/utils、src/types.ts）
   - 配置 TypeScript、package.json 等基础文件
   - 定义核心类型（Platform、StockCheckRequest、StockCheckResult、YishouGoodsData）
   - _需求：1.1、5.1_

- [ ] 2. 实现平台适配器架构
   - [ ] 2.1 创建平台适配器接口和基类
      - 定义 `PlatformAdapter` 接口
      - 创建 `BaseAdapter` 抽象类
      - 实现适配器工厂/注册机制
      - _需求：5.1、5.2、5.3_
   
   - [ ] 2.2 实现一手平台适配器
      - 创建 `YishouAdapter` 类
      - 封装一手平台 API 调用（POST https://api.yishouapp.com/goods/get_goods_info_v2）
      - 实现请求参数构建和签名 Header 处理
      - 实现 `YishouGoodsData` 到 `StockCheckResult` 的数据映射
      - _需求：1.2_

- [ ] 3. 实现库存状态判断逻辑
   - 根据 is_stockout、is_on_sale、goods_status 字段判断库存状态
   - 处理有货/无货的不同返回消息
   - _需求：1.3、1.4_

- [ ] 4. 实现库存查询入口函数
   - 创建 `checkStock` 主函数，接收 StockCheckRequest 参数
   - 根据 platform 参数选择对应适配器
   - 处理平台不支持的错误情况
   - 处理商品不存在/ID无效的错误情况
   - _需求：1.2、1.6、1.7_

- [ ] 5. 实现 HTTP 请求工具
   - 封装 HTTP POST 请求方法
   - 支持 application/x-www-form-urlencoded 格式
   - 支持自定义 Headers（sign 签名）
   - 实现请求错误处理
   - _需求：1.2、边界情况 1_

- [ ] 6. 编写单元测试
   - 测试库存状态判断逻辑（有货/无货各种情况）
   - 测试适配器数据转换逻辑
   - Mock API 响应进行集成测试
   - _需求：1.3、1.4、1.7_
