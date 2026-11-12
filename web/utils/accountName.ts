/**
 * 账号显示名
 *
 * 账号可以设置一个标题（如「主号」「客户 A」），有标题就展示标题，
 * 为空才回退展示手机号。列表卡片、当前账号横幅、收藏夹 / 订单页的
 * 「正在查看 xx」提示统一走这里，避免各页面自己拼。
 */
export const accountDisplayName = (
  account: { title?: string | null; phone: string }
): string => account.title?.trim() || account.phone
