/**
 * 一手 App 深链构造（服务端版）。
 *
 * 与 web/utils/yishou-deeplink.ts 内容保持一致：src 与 web 各自有 rootDir 约束，
 * 编译期不能跨层 import，故此处放一份服务端的副本。链接格式以 2026-11-11
 * 在 iPhone 上实测为准，改动需两端同步。
 *
 * 依据：一手 H5 里那张声明式路由表（80 条），每条同时给出 iOS 类名、Android 类名和入参。
 * 1. scheme 固定 `yishou://fmkj/openyishou`，唯一参数是 `extra`，值是 JSON；
 * 2. `ios_class_name` 是 iOS 端分发的唯一开关，缺了它 App 会被拉起但静默停在首页；
 * 3. `android_class_name` 对 iOS 无意义，带上只是让同一条链接双端通用；
 * 4. `extra` 传 JSON 原文和 percent 编码一次等价（iOS 只解一次码），这里默认编码，方便直接放进 href。
 */

export const YISHOU_DEEP_LINK_SCHEME = 'yishou://fmkj/openyishou'

export type YishouDeepLinkParams = Record<string, string | number | null | undefined>

export interface YishouDeepLinkRoute {
  /** iOS 侧分发用的类名，缺失会导致 App 打开后停在首页 */
  iosClassName: string
  /** Android 侧分发用的 Activity 名 */
  androidClassName: string
  /** 路由表里的默认入参，同时决定 extra 的字段顺序 */
  defaults?: YishouDeepLinkParams
}

/** 常用路由，其余 80 条按需补充；字段名必须与路由表 options 一致 */
export const YISHOU_ROUTES = {
  productDetail: {
    iosClassName: 'FMDetailViewController',
    androidClassName: 'GoodsDetailActivity',
    defaults: {
      goods_id: '',
      goods_no: '',
      replenishmentSource: '',
      check_login: 0,
    },
  },
  orderDetail: {
    iosClassName: 'FMMyOrderDetailViewController',
    androidClassName: 'OrderDetailActivity',
    defaults: {
      orderSn: '',
      status: '',
      isFromAlone: '',
      check_login: 1,
    },
  },
  myOrder: {
    iosClassName: 'FMMyOrderViewController',
    androidClassName: 'MyOrderActivity',
    defaults: {
      check_login: 1,
      type: '',
    },
  },
  cart: {
    iosClassName: 'FMCarViewController',
    androidClassName: 'ShoppingMainFragment',
    defaults: {
      check_login: 1,
    },
  },
  receivingAddress: {
    iosClassName: 'FMAddressManagementViewController',
    androidClassName: 'ManageAddressActivityV2',
    defaults: {
      check_login: 1,
    },
  },
} satisfies Record<string, YishouDeepLinkRoute>

export interface BuildYishouDeepLinkOptions {
  /** 是否对 extra 做 percent 编码，默认 true */
  encode?: boolean
}

/**
 * 拼一条深链。参数里传空值（null/undefined）时回落到路由表默认值，
 * 这样 `goods_no` 这类可缺省字段会以空串出现，和官方链接保持一致。
 */
export const buildYishouDeepLink = (
  route: YishouDeepLinkRoute,
  params: YishouDeepLinkParams = {},
  options: BuildYishouDeepLinkOptions = {},
): string => {
  const extra: Record<string, string | number> = {
    ios_class_name: route.iosClassName,
    android_class_name: route.androidClassName,
  }

  for (const [key, fallback] of Object.entries(route.defaults ?? {})) {
    extra[key] = params[key] ?? fallback ?? ''
  }

  // 允许传路由表默认值之外的额外字段
  for (const [key, value] of Object.entries(params)) {
    if (key in extra || value === null || value === undefined) {
      continue
    }
    extra[key] = value
  }

  const json = JSON.stringify(extra)
  const query = options.encode === false ? json : encodeURIComponent(json)
  return `${YISHOU_DEEP_LINK_SCHEME}?extra=${query}`
}

/** 商品详情深链：goods_id 必需，goods_no 有就带上（详情页靠它查 SKU） */
export const buildYishouProductLink = (productId: string, productNo?: string): string =>
  buildYishouDeepLink(YISHOU_ROUTES.productDetail, {
    goods_id: String(productId),
    goods_no: productNo ?? '',
  })
