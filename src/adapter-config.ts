/**
 * 账号请求快照 → 适配器配置（纯函数）
 *
 * 账号快照保存在服务端，发请求前统一在这里转成 AdapterConfig：
 *   - 有快照：完整回放抓包里的公共参数、请求头与登录态（uid/token）
 *   - 没有快照（未选账号 / 账号没抓包）：回退默认 wx 匿名参数
 *
 * 是否匿名取决于「当前是否选了带凭证的账号」：
 * 所有请求一律跟随当前账号，无凭证时自然走匿名。
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

/**
 * 构造适配器配置：完整回放当前账号的抓包快照
 *
 * 有 uid/token 就带上（登录态），没有就保持匿名——由当前账号决定，无额外开关。
 *
 * @param profile 账号保存的抓包快照
 */
export const buildAdapterConfigFromProfile = (
  profile: StoredRequestProfile | null | undefined
): AdapterConfig => {
  // 没有快照：回退默认 wx 匿名参数，不带任何登录态
  if (!profile?.params || Object.keys(profile.params).length === 0) {
    return { ...DEFAULT_WX_ADAPTER_CONFIG };
  }

  const params = { ...profile.params };

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

  const uid = pickParam(params, 'uid');
  const token = pickParam(params, 'token');
  if (uid) config.uid = uid;
  if (token) config.token = token;

  return config;
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
