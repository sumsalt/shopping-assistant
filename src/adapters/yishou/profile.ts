/**
 * 请求档案解析
 *
 * 这是「一个账号怎么发请求」的唯一真相来源。
 *
 * 改造前每个请求方法都要写一遍：
 *   `this.config.model || readParam(params, 'model') || '默认值'`
 * 三层回退散落在 8 个方法里，通道差异（UA / t_t 单位 / 签名首段）也要每次判断。
 *
 * 现在统一在 `resolveRequestProfile` 里解析一次，产出不可变的 RequestProfile：
 *   - params / headers 已经合并好，调用方只管追加业务参数
 *   - channel 已经决定 UA、t_t 单位、签名首段
 *   - 匿名与登录态只是 auth 字段空不空，不需要额外分支
 */

import type { AdapterConfig } from '../types';
import { generateYishouSign, md5 } from '../../utils/crypto';

/** 请求通道：小程序 / H5 与 App 的公共参数、UA、时间戳单位都不同 */
export type RequestChannel = 'wx' | 'app';

/** 默认 wx 小程序 UA（无抓包快照时使用） */
export const WX_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.60(0x18003c32) NetType/4G Language/zh_CN';

/** 默认 App UA（抓包没带 UA 时兜底，网关靠 UA 与 plat_type 分流） */
export const APP_USER_AGENT = 'okhttp/3.14.9';

/** 无快照时的默认公共参数（= 改造前的写死值，保证老任务行为不变） */
export const DEFAULT_WX_PARAMS: Readonly<Record<string, string>> = {
  model: 'iPhone 14 Pro<iPhone15,2>',
  openid: '',
  version: '8.0.60',
  version_name: '4.9.0',
  wx_version_name: '3.5.32',
  plat_type: 'wx',
};

/** 小程序 / H5 网关靠这个 Referer 分流 */
const WX_REFERER = 'https://servicewechat.com/wxe9634876e78aafd5/454/page-frame.html';

/** 解析后的请求档案（不可变，可安全复用） */
export interface RequestProfile {
  channel: RequestChannel;
  /** 公共参数（已剔除动态字段 t_t / sign） */
  params: Readonly<Record<string, string>>;
  /** 请求头（已补齐 UA，未含每次生成的 sign） */
  headers: Readonly<Record<string, string>>;
  /** 代理地址（仅在启用且有值时存在） */
  proxyUrl?: string;
  /** 登录凭证（匿名时为空字符串） */
  uid: string;
  token: string;
  hasAuth: boolean;
  /** 是否来自真实抓包快照（决定是否沿用抓包里的版本号等） */
  captured: boolean;
  /** t_t 生成器：App 秒级、wx 毫秒级 */
  timestamp: () => number;
  /** 生成签名（调用方可传固定 timestamp / sign 复现抓包） */
  sign: (t_t: number) => string;
}

/** 大小写不敏感地读参数（抓包里的 key 大小写不稳定） */
export const readParam = (
  params: Record<string, string> | undefined,
  key: string
): string => {
  if (!params) return '';
  for (const [name, value] of Object.entries(params)) {
    if (name.toLowerCase() === key.toLowerCase()) return value;
  }
  return '';
};

/**
 * 按 OkHttp 的 form 编码规则编码单个字段
 *
 * 签名不在业务层算，而在 OkHttp 拦截器里用 **已编码** 的值算：
 *   `MI 8 UD` → `MI%208%20UD`。
 *
 * `encodeURIComponent` 与 OkHttp 只差 5 个字符：它不编码 `! ' ( ) *`，
 * 而 OkHttp 的 UNRESERVED 只有 `A-Za-z0-9-._~`，其余一律 `%XX`。
 * 机型名里出现括号（如 `MI 8 (UD)`）时两者结果不同，必须补上。
 */
export const encodeFormComponent = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );

/** 剔除动态字段，避免抓包里残留的 t_t / sign 被当成静态参数回放 */
const stripDynamicFields = (params: Record<string, string>): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const lower = key.toLowerCase();
    if (lower === 't_t' || lower === 'sign') continue;
    result[key] = value;
  }
  return result;
};

/** 补默认 UA；抓包已带 UA 时原样保留（UA 必须与 plat_type 匹配） */
const resolveHeaders = (
  captured: Record<string, string> | undefined,
  channel: RequestChannel
): Record<string, string> => {
  const headers: Record<string, string> = { ...(captured ?? {}) };
  const hasUserAgent = Object.keys(headers).some(name => name.toLowerCase() === 'user-agent');

  if (!hasUserAgent) {
    headers['User-Agent'] = channel === 'app' ? APP_USER_AGENT : WX_USER_AGENT;
  }

  // 有抓包快照时不补 Referer：用户抓到的头就是服务端认的那一套，不做额外改动
  const capturedHeaders = Boolean(captured && Object.keys(captured).length > 0);
  if (
    !capturedHeaders &&
    channel === 'wx' &&
    !Object.keys(headers).some(name => name.toLowerCase() === 'referer')
  ) {
    headers['Referer'] = WX_REFERER;
  }

  return headers;
};

/**
 * App 通道补 `equipmd5 = md5(udid)`
 *
 * 服务端当前不校验，但真机每个请求都带；补上成本为零，能让请求更像真实客户端。
 * 抓包已经带了就原样保留（预发环境该值可能是字符串 `11`）。
 */
const ensureAppFingerprint = (
  headers: Record<string, string>,
  params: Record<string, string>
): void => {
  const udid = readParam(params, 'udid') || readParam(params, 'device_id');
  if (!udid) return;
  const hasEquipMd5 = Object.keys(headers).some(name => name.toLowerCase() === 'equipmd5');
  if (!hasEquipMd5) {
    headers.equipmd5 = md5(udid);
  }
};

/**
 * 把外部传入的 AdapterConfig 解析成请求档案
 *
 * 优先级（保持改造前语义）：
 *   1. 有 requestParams 快照 → 原样使用（用户粘贴的是自己设备上真实可用的请求）
 *   2. 没有快照 → 用顶层散字段拼出默认 wx 参数
 *
 * 顶层散字段仍然优先于快照里的同名字段，因为它们代表调用方本次的显式意图
 * （例如价格监控强制覆盖 model）。
 */
export const resolveRequestProfile = (config: AdapterConfig = {}): RequestProfile => {
  const channel: RequestChannel = config.channel === 'app' ? 'app' : 'wx';
  const captured = Boolean(config.requestParams && Object.keys(config.requestParams).length > 0);

  const params: Record<string, string> = captured
    ? stripDynamicFields(config.requestParams!)
    : {
        model: config.model || DEFAULT_WX_PARAMS.model,
        openid: config.openid || DEFAULT_WX_PARAMS.openid,
        version: config.version || DEFAULT_WX_PARAMS.version,
        version_name: config.version_name || DEFAULT_WX_PARAMS.version_name,
        wx_version_name: config.wx_version_name || DEFAULT_WX_PARAMS.wx_version_name,
        plat_type: config.plat_type || DEFAULT_WX_PARAMS.plat_type,
      };

  // 凭证：快照优先，其次顶层字段。匿名链路前端已剔除快照里的 uid/token，
  // 这里再判一次空，确保不会发出 uid=undefined&token=undefined
  const uid = readParam(config.requestParams, 'uid') || config.uid || '';
  const token = readParam(config.requestParams, 'token') || config.token || '';

  // 快照里没有凭证、但顶层带了（老调用方）时补进请求体
  if (!captured) {
    if (uid) params.uid = uid;
    if (token) params.token = token;
  }

  const headers = resolveHeaders(config.requestHeaders, channel);
  if (channel === 'app') {
    ensureAppFingerprint(headers, params);
  }

  // 签名原料：显式字段优先，其次快照
  const rawModel = config.model || readParam(params, 'model');
  // App 用 udid（device_id 在真机上与其完全同值，抓包工具可能只留其中一个）
  const signFirst = channel === 'app'
    ? readParam(params, 'udid') || readParam(params, 'device_id')
    : config.openid || readParam(params, 'openid');
  // 签名取的是 form 里「已编码」的值，见 encodeFormComponent 注释
  const signModel = channel === 'app' ? encodeFormComponent(rawModel) : rawModel;
  const signVersion = config.version || readParam(params, 'version');
  const signVersionName = config.version_name || readParam(params, 'version_name');

  const timestamp = (): number => {
    // 固定 timestamp 用于复现抓包现场；否则 App 秒级、小程序毫秒级
    if (config.timestamp) return config.timestamp;
    return channel === 'app' ? Math.floor(Date.now() / 1000) : Date.now();
  };

  const sign = (t_t: number): string => {
    if (config.sign) return config.sign;
    return generateYishouSign({
      openid: signFirst,
      model: signModel,
      version: signVersion,
      version_name: signVersionName,
      t_t,
    });
  };

  return {
    channel,
    params,
    headers,
    proxyUrl: config.proxyEnabled === '1' && config.proxyUrl ? config.proxyUrl : undefined,
    uid,
    token,
    hasAuth: Boolean(uid && token),
    captured,
    timestamp,
    sign,
  };
};
