/**
 * 登录态自检
 *
 * 一手把 (uid, token, udid) 当作一个三元组校验：
 *   - 三者同源 → 200，返回用户信息
 *   - 任一不匹配 / token 过期 → 201「请登录」，且**不告诉你是哪个错了**
 *
 * 最坑的是可匿名接口（get_goods_info_v2）不报错，只把 shop_price 静默降级成
 * `??.??`、会员字段清空。于是任务照常跑、价格全是问号，很难第一时间发现。
 *
 * 所以这里用一个必须登录的接口（/users/get_user_info）做探针，
 * 让用户在账号管理里点一下就知道这份抓包还能不能用。
 */

import type { AdapterConfig } from '../types';
import * as EP from './endpoints';
import { YishouClient } from './client';

/** 自检结果 */
export interface AuthCheckResult {
  ok: boolean;
  /** 服务端返回的用户 ID（可与快照里的 uid 对照） */
  uid: string;
  /** 昵称，便于用户确认是哪个账号 */
  nickname: string;
  /** 直接展示给用户的结论 */
  message: string;
}

/** uid / token / udid 不同源或 token 过期的统一提示 */
const MISMATCH_MESSAGE =
  '一手返回「请登录」：token 可能已过期，或 uid / token / udid 不是同一台设备（三者必须来自同一次登录）';

/**
 * 用必须登录的接口验证这份请求快照
 *
 * @param config 账号的完整请求快照（channel + params + headers）
 */
export const checkYishouAuth = async (
  config: AdapterConfig = {}
): Promise<AuthCheckResult> => {
  const client = new YishouClient(config, { timeout: 15000 });

  if (!client.hasAuth) {
    return {
      ok: false,
      uid: '',
      nickname: '',
      message: '该账号没有 uid / token，请粘贴带登录态的抓包',
    };
  }

  try {
    const data = await client.post<Record<string, unknown>>(EP.USER_INFO);
    // 不同版本返回结构略有差异，逐个兜底
    const user = (data?.user_info ?? data?.userInfo ?? data) as Record<string, unknown>;
    const uid = String(user?.user_id ?? user?.uid ?? '');
    const nickname = String(user?.nickname ?? user?.nick_name ?? user?.user_name ?? '');

    return {
      ok: true,
      uid,
      nickname,
      message: nickname ? `登录态正常（${nickname}）` : '登录态正常',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/登录|token|未授权/i.test(message)) {
      return { ok: false, uid: '', nickname: '', message: MISMATCH_MESSAGE };
    }
    return { ok: false, uid: '', nickname: '', message: `校验失败：${message}` };
  }
};
