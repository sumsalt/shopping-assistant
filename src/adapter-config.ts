/**
 * 账号请求快照 → 适配器配置（纯函数）
 *
 * 账号快照保存在服务端，发请求前统一在这里转成 AdapterConfig：
 *   - needAuth=false：剔除 uid/token，走匿名限流桶
 *   - needAuth=true：完整回放抓包里的公共参数与请求头
 *   - 没有快照（未选账号 / 账号没抓包）：回退默认 wx 匿名参数
 *
 * 不依赖数据库与 HTTP，便于单测；服务端只负责取快照与注入代理。
 */

import type { AdapterConfig } from './adapters/types';

/** 无账号时的默认匿名参数（与旧前端 config store 的默认值一致） */
export const DEFAULT_WX_ADAPTER_CONFIG = {
  openid: '',
  model: 'iPhone 14 Pro<iPhone15,2>',
  version: '8.0.60',
  version_name: '4.9.0',
  wx_version_name: '3.5.34',
  plat_type: 'wx',
} as const;

/** 账号里保存的请求快照结构（服务端 accountStore 的 AccountRequestProfile 子集） */
export interface StoredRequestProfile {
  channel?: 'wx' | 'app';
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

/** 大小写不敏感地取快照参数 */
const pickParam = (params: Record<string, string>, key: string): string => {
  const target = key.toLowerCase();
  for (const [name, value] of Object.entries(params)) {
    if (name.toLowerCase() === target) return value;
  }
  return '';
};

/** 剔除登录态字段（匿名桶） */
export const stripAuthParams = (params: Record<string, string>): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const lower = key.toLowerCase();
    if (lower !== 'uid' && lower !== 'token') {
      result[key] = value;
    }
  }
  return result;
};

/**
 * 构造适配器配置
 *
 * @param profile 账号保存的抓包快照
 * @param needAuth 是否需要登录态
 */
export const buildAdapterConfigFromProfile = (
  profile: StoredRequestProfile | null | undefined,
  needAuth: boolean
): AdapterConfig => {
  // 没有快照：回退默认 wx 匿名参数，不带任何登录态
  if (!profile?.params || Object.keys(profile.params).length === 0) {
    return { ...DEFAULT_WX_ADAPTER_CONFIG };
  }

  const raw = profile.params;
  const params = needAuth ? { ...raw } : stripAuthParams(raw);

  const config: AdapterConfig = {
    openid: pickParam(params, 'openid'),
    model: pickParam(params, 'model'),
    version: pickParam(params, 'version'),
    version_name: pickParam(params, 'version_name'),
    wx_version_name: pickParam(params, 'wx_version_name'),
    plat_type: pickParam(params, 'plat_type') || (profile.channel === 'app' ? 'Android' : 'wx'),
    requestParams: params,
    requestHeaders: { ...(profile.headers || {}) },
    channel: profile.channel,
  };

  if (needAuth) {
    const uid = pickParam(raw, 'uid');
    const token = pickParam(raw, 'token');
    if (uid) config.uid = uid;
    if (token) config.token = token;
  }

  return config;
};

/**
 * 去掉登录态的适配器配置（到货检测专用）
 *
 * 到货监控的轮询只判断「有没有货」，不需要身份：自动下单才需要。
 * 凭证同时存在于顶层 `uid/token` 与 `requestParams` 两处，必须一起摘掉，
 * 否则适配器会从快照里把 uid/token 读回去（profile 优先读 requestParams）。
 *
 * 不修改入参，返回新对象。
 */
export const toAnonymousAdapterConfig = (config: AdapterConfig = {}): AdapterConfig => {
  const anonymous: AdapterConfig = { ...config };
  delete anonymous.uid;
  delete anonymous.token;
  if (config.requestParams) {
    anonymous.requestParams = stripAuthParams(config.requestParams);
  }
  return anonymous;
};

/** 账号快照是否带登录态（uid + token 同时存在） */
export const hasProfileCredential = (
  profile: StoredRequestProfile | null | undefined
): boolean => {
  const params = profile?.params;
  if (!params) {
    return false;
  }
  return Boolean(pickParam(params, 'uid') && pickParam(params, 'token'));
};
