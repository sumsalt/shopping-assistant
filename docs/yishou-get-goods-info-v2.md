# 一手 `get_goods_info_v2` 接口实测记录

> 采集时间：2026-10-28（服务端时间戳 1793167751）｜测试商品：`goods_id=333816379`（货号 `1350300027`）
> 用途：确认接口实际返回字段，以及 uid + token（登录态）对返回结果的影响。

## 1. 请求构造

- URL：`POST https://api.yishouapp.com/goods/get_goods_info_v2`
- Content-Type：`application/x-www-form-urlencoded`
- Header：`sign`、`User-Agent`（iOS 微信 UA）、`Referer: https://servicewechat.com/wxe9634876e78aafd5/454/page-frame.html`
- 签名：`sign = md5(md5(openid + model + version + version_name) + t_t)`，`openid` 为空时签名依然通过

| 参数 | 本次取值 | 说明 |
| --- | --- | --- |
| `goods_id` | `333816379` | 商品 ID |
| `goods_no` | 空 | 与 goods_id 二选一 |
| `openid` | 空 | 参与签名，不决定登录态 |
| `model` | `iPhone 14 Pro Max` | 与 web 端 `/api/stock/check` 默认值一致 |
| `version` | `5.11.0` | 同上 |
| `version_name` | `5.11.0` | 同上 |
| `wx_version_name` | `8.0.43` | 同上 |
| `plat_type` | `wx` | 固定 |
| `uid` / `token` | 见下方三组对照 | 登录态凭证 |

### 三组对照

| 组 | uid / token | HTTP | 业务 code / msg | data 字段数 |
| --- | --- | --- | --- | --- |
| A 游客态 | 完全不传 | 200 | 200 / success | 137 |
| B 登录态 | `20478621` / `a878da****cef`（token 已脱敏） | 200 | 200 / success | 139 |
| C 伪登录态 | 传字符串 `"undefined"`（复现现有代码把 `undefined` 序列化的行为） | 200 | 200 / success | 137 |

结论：三种情况 HTTP 200、业务 code 均为 `"200"`；**C 与 A 除 `current_timestamp` 外完全一致**，说明 `uid=undefined&token=undefined` 被服务端忽略，等价于游客。

## 2. 响应结构

```json
{
  "code": "200",   // 注意是字符串，不是数字
  "msg": "success",
  "data": { ... }  // 对象，不是数组；游客态 137 个字段，登录态 139 个
}
```

## 3. 核心字段

| 字段 | 含义 | 实测值 |
| --- | --- | --- |
| `goods_id` | 商品 ID | 333816379 |
| `goods_no` | 商品货号 | 1350300027 |
| `goods_name` | 商品标题 | 冬上新！【美美桑蕾】…HL103#WT3 |
| `goods_status` | 商品状态：1 正常 / 2 下架 | 1 |
| `is_on_sale` | 是否在售：1 在售 / 0 停售 | 1 |
| `is_stockout` | 是否缺货：1 缺货 / 0 有货 | 0 |
| `goods_in_stock` | 是否有货标记（1 有货） | 1 |
| `shop_price` | 拿货价（shop_price_note 标注为"拿货价"，但游客态数值不同，见差异章节） | 2783.96 / 登录态 869.99 |
| `shoppe_price` | 零售价 / 门市价（仅登录态返回） | 登录态 1739.98 |
| `alone_price` | 单独购买价（实测等于登录态拿货价） | 869.99 |
| `old_price` | 划线价 | 0.00 |
| `vip_price` | VIP 价（本商品为空） | — |
| `color / size` | 默认展示的颜色、尺码 | 白色-现货 / S |
| `attribute[]` | 颜色-尺码-SKU 库存树，含 color/color_id/color_card/item[] | array(1) |
| `attribute[].item[].sku` | SKU ID | 75613832 |
| `attribute[].item[].stock` | 总库存 | 1 |
| `attribute[].item[].sale_stock` | 可售库存 | 1 |
| `attribute[].item[].sale_instock` | 入仓现货数 | 1 |
| `attribute[].item[].sale_stock_now_desc` | 库存现货文案 | 入仓1件现货 |
| `goods_thumb` | 列表缩略图 | https://img4.yishouapp.com/obs/baob/a078…jpeg |
| `main_img` | 主图 | https://img4.yishouapp.com/obs/baob/a078…jpeg?x-image-process=… |
| `goods_img` | 商品图集 URL 数组 | array(36) |
| `imgs` | 按类型分组的图片 {model, real, extra} | object |
| `video_url` | 商品视频地址 | https://img4.yishouapp.com/obs/baob/006d…mp4 |
| `sales / sales_total` | 销量 / 累计销量 | 12 / 12 |
| `collect_id` | 收藏 ID，0 表示未收藏（游客态恒为 0） | 游客 0 / 登录 373216991 |
| `supplier_id / brand_id / cat_id` | 档口、品牌、类目 ID | 40826 / 42048 / 312 |
| `cat_name` | 类目名 | 皮草 |
| `provider` | 档口信息（名称、市场、头像、档口商品列表） | object |
| `coupons / coupons_new` | 可领红包（coupons_new 仅登录态返回） | 游客 [] / 登录 5 条 |
| `member_data` | 会员权益入口 | object |
| `invite_activity_info` | 邀新助力价（仅登录态） | 登录态 756.89 |
| `new_user_special_power` | 新人首单权益（仅登录态） | 登录态有值 |
| `free_refund_insurance` | 免费退货卡信息（仅登录态有细节） | object |
| `prop_list` | 面料/成分等属性列表 | array(16) |
| `goods_tags` | 商品标签 | ["配可拆卸狐狸毛球围脖"] |
| `current_timestamp` | 服务端时间戳（秒） | 1793167751 |

## 4. 登录态差异（重点）

带 uid + token 后，共 **17 个字段**与游客态不同，其中 2 个（`coupons_new`、`check_status`）是登录态才出现的新字段。

### 4.1 价格：数值完全不同

| 字段 | A 游客态 | B 登录态 |
| --- | --- | --- |
| `shop_price` | 2783.96 | 869.99 |
| `shop_price_note` | 拿货价 | 拿货价 |
| `alone_price` | 869.99 | 869.99 |
| `shoppe_price` |  | 1739.98 |
| `old_price` | 0.00 | 0.00 |
| `vip_price` |  |  |
| `wholesale_price` |  |  |

- `shop_price_note` 两种情况都写着「拿货价」，但游客态 `shop_price=2783.96`、登录态 `shop_price=869.99`。
- 登录态额外返回 `shoppe_price=1739.98`（零售价/门市价），且 `shop_price == alone_price`。
- 注意：游客态的 `alone_price` 也是 `869.99`，与登录态拿货价相同；所以**游客态也能拿到 869.99，只是要读 `alone_price` 而不是 `shop_price`**。当前 web 端 `parseFloat(data.shop_price)` 在游客态展示的是 2783.96。

### 4.2 库存 / SKU：主体一致，颜色名与标签不同

| 字段 | A 游客态 | B 登录态 |
| --- | --- | --- |
| `goods_in_stock` | 1 | 1 |
| `is_stockout` | 0 | 0 |
| `is_on_sale` | 1 | 1 |
| `goods_status` | 1 | 1 |
| `enough_number` | 1 | 1 |
| `is_show_stock` | 0 | 0 |
| `is_replenish` |  |  |
| `buy_status` | 3 | 3 |
| `restriction_number` | -1 | -1 |
| `sale_note` | 今日已拼12件 | 今日已拼12件 |

- `attribute[0].color`：游客 `"白色"` → 登录 `"白色-现货"`（多了「-现货」后缀）
- `attribute[0].item[0].ontime_list`：游客 `[]` → 登录 `[{"sku_tag":"","color_tag":true}]`
- `sku` / `stock` / `sale_stock` / `sale_instock` / `sale_stock_now_desc` 完全一致，**游客态已能拿到完整 SKU 库存**。

### 4.3 个性化字段（只有登录态才有内容）

| 字段 | A 游客态 | B 登录态 |
| --- | --- | --- |
| `collect_id` | 0 | 373216991 |
| `coupons` | [] | [{"coupon_id":"269120","coupon_type_title":"平台… |
| `coupons_new` | — | [{"coupon_id":"284446","condition_goods_amount… |
| `check_status` | — | 0 |
| `hidden_entry` | 0 | 1 |
| `is_sub` |  | 0 |
| `remind_note` |  | 清仓现货仅剩1件，售完即下架，现货商品会在专场结束后24小时内发出（以实际下单为准） |
| `new_user_special_power` | {} | {"title":"新人首单权益","icon":"https://img3.yishoua… |
| `invite_activity_info` | {} | {"image_url":"https://static3.yishouapp.com/ob… |
| `good_download_pics` | [] | ["https://img4.yishouapp.com/obs/baob/a078efd7… |
| `free_refund_insurance` | {"is_supported":"2","tag_text":"","disabled_re… | {"is_supported":"2","tag_text":"","disabled_re… |
| `member_data` | {"price_level":"","extra_param":{"banner_id":"… | {"price_level":"","extra_param":{"banner_id":"… |
| `shopkeeper_img` | https://img5.yishouapp.com/2019/06/19AISa9ce9X… |  |
| `provider` | {"market_id":"232","provider_id":"40826","prov… | {"market_id":"232","provider_id":"40826","prov… |
| `attribute` | [{"color":"白色","color_id":"1018","color_card":… | [{"color":"白色-现货","color_id":"1018","color_car… |

- `coupons`：游客 `[]`，登录态 5 条（平台红包 / 档口红包 / 专场红包）。
- `coupons_new` 是登录态新增字段，含满减门槛（如满 1500 减 600、满 800 减 300）。
- `collect_id`：游客恒 `0`，登录态为真实收藏 ID（本次 `373216991`），可用于判断是否已收藏。
- `remind_note`：登录态返回清仓/发货提示文案。
- `provider` 差异只在 `follow_id`（`"0"` vs `0`）与内嵌 `stall_goods`/`supply_question` 的细微字段。

### 4.4 完全一致的字段

共 122 个字段（含图片、标题、销量、类目、档口信息、`goods_status`/`is_on_sale`/`is_stockout` 等）在两种状态下完全一致。

## 5. 全量字段清单

> 「差异」列标 ✅ 表示带登录态后该字段值发生变化；`—` 表示一致。`current_timestamp` 为服务端时间戳，天然会变，不计入差异。

| # | 字段 | 类型 | 游客态示例 | 登录态示例 | 差异 |
| --- | --- | --- | --- | --- | --- |
| 1 | `goods_thumb` | string | https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e01185afec4.j… | https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e01185afec4.j… | — |
| 2 | `main_img` | string | https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e01185afec4.j… | https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e01185afec4.j… | — |
| 3 | `goods_img` | array(36) | ["https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e01185afec4… | ["https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e01185afec4… | — |
| 4 | `imgs` | object | {"model":["https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e0… | {"model":["https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e0… | — |
| 5 | `image_activity_icon` | string |  |  | — |
| 6 | `sales_total` | string | 12 | 12 | — |
| 7 | `goods_desc` | string |  |  | — |
| 8 | `goods_no` | string | 1350300027 | 1350300027 | — |
| 9 | `is_exchange_zone_user` | string | 0 | 0 | — |
| 10 | `supplier_id` | string | 40826 | 40826 | — |
| 11 | `video_url` | string | https://img4.yishouapp.com/obs/baob/006d2af02416645bea03f5f7af363480.m… | https://img4.yishouapp.com/obs/baob/006d2af02416645bea03f5f7af363480.m… | — |
| 12 | `goods_video` | string |  |  | — |
| 13 | `goods_gif` | string |  |  | — |
| 14 | `video_status` | string | 1 | 1 | — |
| 15 | `voice_explain` | object | {"voice_explanation_url":"","voice_explanation_summary":""} | {"voice_explanation_url":"","voice_explanation_summary":""} | — |
| 16 | `brand_id` | string | 42048 | 42048 | — |
| 17 | `cat_id` | string | 312 | 312 | — |
| 18 | `cat_name` | string | 皮草 | 皮草 | — |
| 19 | `origin` | string | 2 | 2 | — |
| 20 | `origin_name` | string | 杭州发货商品 | 杭州发货商品 | — |
| 21 | `is_show_stock` | string | 0 | 0 | — |
| 22 | `attribute` | array(1) | [{"color":"白色","color_id":"1018","color_card":"https://img4.yishouapp.… | [{"color":"白色-现货","color_id":"1018","color_card":"https://img4.yishoua… | ✅ |
| 23 | `goods_id` | string | 333816379 | 333816379 | — |
| 24 | `special_id` | string | 610529 | 610529 | — |
| 25 | `is_new` | string | 0 | 0 | — |
| 26 | `old_price` | string | 0.00 | 0.00 | — |
| 27 | `goods_in_stock` | string | 1 | 1 | — |
| 28 | `goods_name` | string | 冬上新！【美美桑蕾】"芝士奶霜球"立体毛球绕脖围巾设计感狐狸毛皮草(配可拆卸狐狸毛球围脖)(含100%狐狸毛)(气质网红名媛辣妹爆款)HL1… | 冬上新！【美美桑蕾】"芝士奶霜球"立体毛球绕脖围巾设计感狐狸毛皮草(配可拆卸狐狸毛球围脖)(含100%狐狸毛)(气质网红名媛辣妹爆款)HL1… | — |
| 29 | `sales` | string | 12 | 12 | — |
| 30 | `enough_number` | string | 1 | 1 | — |
| 31 | `shoppe_discount` | string |  |  | — |
| 32 | `shoppe_price` | string |  | 1739.98 | ✅ |
| 33 | `shop_price` | string | 2783.96 | 869.99 | ✅ |
| 34 | `goods_status` | string | 1 | 1 | — |
| 35 | `is_on_sale` | string | 1 | 1 | — |
| 36 | `is_stockout` | string | 0 | 0 | — |
| 37 | `fabric_desc` | string |  |  | — |
| 38 | `special_remark` | string |  |  | — |
| 39 | `desc` | string | 1件成团，已拼12件 | 1件成团，已拼12件 | — |
| 40 | `desc2` | string | 成团后，买手向档口拿货 | 成团后，买手向档口拿货 | — |
| 41 | `is_replenish` | string |  |  | — |
| 42 | `is_show_progress` | string | 1 | 1 | — |
| 43 | `alone_price` | string | 869.99 | 869.99 | — |
| 44 | `diff_price` | string |  |  | — |
| 45 | `alone_discount` | string |  |  | — |
| 46 | `change_tips` | string |  |  | — |
| 47 | `collect_id` | string | 0 | 373216991 | ✅ |
| 48 | `goods_tags` | array(1) | ["配可拆卸狐狸毛球围脖"] | ["配可拆卸狐狸毛球围脖"] | — |
| 49 | `buy_status` | string | 3 | 3 | — |
| 50 | `color` | string | 白色 | 白色 | — |
| 51 | `size` | string | S | S | — |
| 52 | `describe` | array(0) | [] | [] | — |
| 53 | `fabric_tag` | string |  |  | — |
| 54 | `prop_list` | array(16) | [{"label":"面料","value":"狐狸毛(含量100%)","fabric_display":"100%狐狸毛"},{"lab… | [{"label":"面料","value":"狐狸毛(含量100%)","fabric_display":"100%狐狸毛"},{"lab… | — |
| 55 | `prop_list_new` | array(0) | [] | [] | — |
| 56 | `brandRecommends` | array(0) | [] | [] | — |
| 57 | `good_download_pics` | array(0) | [] | ["https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e01185afec4… | ✅ |
| 58 | `size_chart` | array(0) | [] | [] | — |
| 59 | `fitting_report` | object | {} | {} | — |
| 60 | `tips` | array(0) | [] | [] | — |
| 61 | `is_apply_replenishment` | string | 1 | 1 | — |
| 62 | `good_deatail_shareurl` | string | pages/product-detail/product-detail?id=shareurl-1350300027 | pages/product-detail/product-detail?id=shareurl-1350300027 | — |
| 63 | `good_deatail_shareh5` | string | http://y3s.yishouapp.com/h5/description.html?goods_id=shareh5-13503000… | http://y3s.yishouapp.com/h5/description.html?goods_id=shareh5-13503000… | — |
| 64 | `replenishment_id` | string | 0 | 0 | — |
| 65 | `remind_icon` | string |  |  | — |
| 66 | `remind_note` | string |  | 清仓现货仅剩1件，售完即下架，现货商品会在专场结束后24小时内发出（以实际下单为准） | ✅ |
| 67 | `remind_link` | string |  |  | — |
| 68 | `remind_off_sale` | string |  |  | — |
| 69 | `is_sub` | string |  | 0 | ✅ |
| 70 | `vip_price` | string |  |  | — |
| 71 | `vip_price_topic` | string |  |  | — |
| 72 | `vip_discount_topic` | string |  |  | — |
| 73 | `vip_discount` | string |  |  | — |
| 74 | `collocation` | object | {"col_img":"https://img5.yishouapp.com/2019/03/18gnOkXihKK0OsM.png","m… | {"col_img":"https://img5.yishouapp.com/2019/03/18gnOkXihKK0OsM.png","m… | — |
| 75 | `video_duration` | string |  |  | — |
| 76 | `action_value` | string | 0 | 0 | — |
| 77 | `add_cart_img` | string |  |  | — |
| 78 | `on_time_delivery` | object | {"title":"","tips":"","note":"","extra_param":{}} | {"title":"","tips":"","note":"","extra_param":{}} | — |
| 79 | `new_user_exclusive` | object | {"status":"0","exclusive_shop_price":"0","expried_time":"0","exclusive… | {"status":"0","exclusive_shop_price":"0","expried_time":"0","exclusive… | — |
| 80 | `current_timestamp` | number | 1793167751 | 1793167752 | — |
| 81 | `new_user_special_power` | object | {} | {"title":"新人首单权益","icon":"https://img3.yishouapp.com/oss/public_prefix… | ✅ |
| 82 | `hidden_entry` | string | 0 | 1 | ✅ |
| 83 | `sale_note` | string | 今日已拼12件 | 今日已拼12件 | — |
| 84 | `rebate_tag` | string |  |  | — |
| 85 | `advance_info` | object | {} | {} | — |
| 86 | `no_reason_title_text` | object | {} | {} | — |
| 87 | `activity_tag_object` | object | {} | {} | — |
| 88 | `goods_type` | string | 0 | 0 | — |
| 89 | `super_refund_insurance` | object | {} | {} | — |
| 90 | `other_price_rule_info` | object | {} | {} | — |
| 91 | `vip_info` | object | {} | {} | — |
| 92 | `seckill_info` | object | {} | {} | — |
| 93 | `activity_info` | object | {} | {} | — |
| 94 | `restriction_number` | number | -1 | -1 | — |
| 95 | `buy_number` | number | 0 | 0 | — |
| 96 | `tiered_pricing` | array(0) | [] | [] | — |
| 97 | `remind_type` | number | 0 | 0 | — |
| 98 | `shopkeeper_img` | string | https://img5.yishouapp.com/2019/06/19AISa9ce9XvprY.png |  | ✅ |
| 99 | `shop_price_note` | string | 拿货价 | 拿货价 | — |
| 100 | `vip_icon` | string | https://img3.yishouapp.com/oss/public_prefix/2020/9/3/fee00c450fe5c02d… | https://img3.yishouapp.com/oss/public_prefix/2020/9/3/fee00c450fe5c02d… | — |
| 101 | `provider` | object | {"market_id":"232","provider_id":"40826","provider_name":"美美桑蕾","stall… | {"market_id":"232","provider_id":"40826","provider_name":"美美桑蕾","stall… | ✅ |
| 102 | `vod_data` | object | {} | {} | — |
| 103 | `can_use_cash_coupon` | object | {} | {} | — |
| 104 | `picker_top_member` | object | {} | {} | — |
| 105 | `supply_question` | array(0) | [] | [] | — |
| 106 | `_abtest` | string | 0 | 0 | — |
| 107 | `coupons` | array(0) | [] | [{"coupon_id":"269120","coupon_type_title":"平台红包","coupon_title":"商品参与… | ✅ |
| 108 | `activities` | object | {"special":[],"goods":[]} | {"special":[],"goods":[]} | — |
| 109 | `goods_pinkage_desc` | object | {} | {} | — |
| 110 | `coupon_remind` | object | {"tips":"","title":"","background_img":""} | {"tips":"","title":"","background_img":""} | — |
| 111 | `billboard_route` | object | {} | {} | — |
| 112 | `buy_button` | string |  |  | — |
| 113 | `return_tip_pop` | object | {} | {} | — |
| 114 | `wholesale_price` | string |  |  | — |
| 115 | `wholesale_price_img` | string |  |  | — |
| 116 | `wholesale_button` | object | {} | {} | — |
| 117 | `goods_banner` | array(1) | [{"banner_id":"87631","banner_name":"10.28杭州","img":"https://img4.yish… | [{"banner_id":"87631","banner_name":"10.28杭州","img":"https://img4.yish… | — |
| 118 | `scheduling_display` | object | {"scheduling_type":"2","scheduling_content":"排单预计7天","extra_param":{"u… | {"scheduling_type":"2","scheduling_content":"排单预计7天","extra_param":{"u… | — |
| 119 | `delivery_data` | object | {"limit_string":"当前下单，现货商品预计10月29日凌晨5点前发货","extra_param":{"url":"https… | {"limit_string":"当前下单，现货商品预计10月29日凌晨5点前发货","extra_param":{"url":"https… | — |
| 120 | `h5_guide_certification_info` | object | {} | {} | — |
| 121 | `muti_goods_pop_config` | object | {} | {} | — |
| 122 | `show_peer_purchase` | string | 2 | 2 | — |
| 123 | `tiered_prices_info` | object | {"entitled_tiered_prices":"2","tiered_prices_threshold":"0","tiered_pr… | {"entitled_tiered_prices":"2","tiered_prices_threshold":"0","tiered_pr… | — |
| 124 | `tiered_prices_list` | array(0) | [] | [] | — |
| 125 | `member_data` | object | {"price_level":"","extra_param":{"banner_id":"0","banner_name":"","url… | {"price_level":"","extra_param":{"banner_id":"0","banner_name":"","url… | ✅ |
| 126 | `discount_info` | object | {} | {} | — |
| 127 | `goods_img_by_type` | object | {"model":["https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e0… | {"model":["https://img4.yishouapp.com/obs/baob/a078efd78fd110c3dfef5e0… | — |
| 128 | `multiple_distribution` | object | {} | {} | — |
| 129 | `distribution_tag_list` | array(1) | [{"border_color":"","border_radius":"2","label_url":"","width":"","hei… | [{"border_color":"","border_radius":"2","label_url":"","width":"","hei… | — |
| 130 | `large_order_bargain` | object | {} | {} | — |
| 131 | `invite_activity_info` | object | {} | {"image_url":"https://static3.yishouapp.com/obs/tools/def/2024/9/29/10… | ✅ |
| 132 | `price_govern_text` | object | {} | {} | — |
| 133 | `color_size_recommend` | object | {} | {} | — |
| 134 | `mep_pf_id` | string |  |  | — |
| 135 | `mep_pf_values` | string |  |  | — |
| 136 | `main_image_tag_type` | string | 0 | 0 | — |
| 137 | `free_refund_insurance` | object | {"is_supported":"2","tag_text":"","disabled_reason":"","free_refund_in… | {"is_supported":"2","tag_text":"","disabled_reason":"当前商品不可使用免费退货卡","f… | ✅ |
| 138 | `coupons_new` | array(3) | — | [{"coupon_id":"284446","condition_goods_amount":"1500","reduce_amount"… | ✅ |
| 139 | `check_status` | string | — | 0 | ✅ |

## 6. 结论与对本项目的影响

1. **登录态由 `uid` + `token` 决定**，`openid` 只参与签名、不参与登录判断（本次 openid 为空，签名照样通过）。
2. **游客态就能拿到库存与全量 SKU**，因此 `/api/stock/check` 注释掉 uid/token 不影响「有没有货」的判断。
3. **价格字段语义随登录态变化**：游客态 `shop_price=2783.96`、`alone_price=869.99`；登录态 `shop_price=869.99`、`shoppe_price=1739.98`。当前 `StockCheckResult.price` 固定取 `shop_price`，游客态会展示 2783.96，需要明确该字段到底是「拿货价」还是「展示价」，或改为取 `alone_price`。
4. **收藏、优惠券、新人权益、免费退货等个性化能力必须登录**；游客态这些字段为空/默认值。
5. 项目 `src/types.ts` 的 `YishouGoodsData` 只声明了 12 个字段，实际返回 137 个；像 `attribute`（SKU 库存树）、`imgs`、`provider`、`prop_list` 这些现成字段尚未接入。
6. `attribute[].item[]` 已包含 `sku`/`stock`/`sale_stock`/`sale_instock`，理论上可直接替代 `add_cart_goods_info` 的 SKU 查询接口，减少一次请求。

## 7. 复现方式

```bash
# 1. 组包（form-urlencoded）
#    model=iPhone 14 Pro Max&t_t=<ms>&openid=&version=5.11.0&version_name=5.11.0
#    &wx_version_name=8.0.43&plat_type=wx&goods_id=333816379&goods_no=
#    登录态再追加 &uid=20478621&token=<token>
# 2. 计算 sign = md5(md5(openid+model+version+version_name) + t_t)
# 3. POST https://api.yishouapp.com/goods/get_goods_info_v2，带上 sign / UA / Referer
```

> 安全提示：`uid` / `token` 属于真实账号凭证，不要写入仓库、日志或前端代码。本文档中的 token 已做脱敏。
