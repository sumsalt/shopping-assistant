/**
 * 一手账号密码登录（Android App 通道）
 *
 * 登录发生在官方 App 里，网页端以前只能靠「粘贴抓包」拿 uid/token。
 * 这里把 App 的登录请求复刻出来，用手机号 + 密码直接换 token：
 *
 *   POST /users/login
 *   password = md5(明文)，无盐（抓包已验证）
 *   签名     = md5(md5(udid + model + version + version_name) + t_t)
 *
 * 设备信息可以随机生成：一手对同一账号允许多设备各自持有 token，
 * 因此每台「虚拟设备」都是一条独立登录。
 */

import type { AdapterConfig } from '../../contract/platform';
import { md5 } from '../../utils/crypto';
import * as EP from './endpoints';
import { YishouClient } from './client';

/** App 版本口径：与线上账号快照保持一致，避免版本跨度太大引起风控 */
const APP_VERSION = '7.77.00';
const APP_VERSION_CODE = '77700';
const APP_VERSION_NUM = '35';
const APP_UA = 'okhttp/3.14.9';

/** 机型池：型号 / 厂商 / 分辨率 / Android 版本必须成套出现，不能随机拼 */
const DEVICE_POOL: ReadonlyArray<{
  model: string;
  manufacturer: string;
  screenWidth: string;
  screenHeight: string;
  osVersion: string;
}> = [
  { model: 'SO-51B', manufacturer: 'Sony', screenWidth: '1080', screenHeight: '2204', osVersion: '15' },
  { model: 'V1938T', manufacturer: 'vivo', screenWidth: '1080', screenHeight: '2204', osVersion: '15' },
  { model: 'SM-G9910', manufacturer: 'SAMSUNG', screenWidth: '1080', screenHeight: '2400', osVersion: '13' },
  { model: '22021211RC', manufacturer: 'Xiaomi', screenWidth: '1080', screenHeight: '2400', osVersion: '14' },
  { model: 'PDKM00', manufacturer: 'OPPO', screenWidth: '1080', screenHeight: '2412', osVersion: '14' },
  { model: 'NOH-AN00', manufacturer: 'HUAWEI', screenWidth: '1200', screenHeight: '2640', osVersion: '12' },
  { model: 'M816Q', manufacturer: 'MEIZU', screenWidth: '1080', screenHeight: '2208', osVersion: '12' },
  { model: 'LE2100', manufacturer: 'OnePlus', screenWidth: '1080', screenHeight: '2400', osVersion: '13' },
];

const CARRIERS = ['中国电信', '中国联通', '中国移动'] as const;

/** 一台虚拟设备 */
export interface YishouDeviceProfile {
  /** 设备唯一标识，同时用于 udid / device_id / android_id */
  udid: string;
  model: string;
  manufacturer: string;
  osVersion: string;
  screenWidth: string;
  screenHeight: string;
  carrier: string;
  /** 广告标识的 MD5，真机每台不同 */
  adIdMd5: string;
}

/** 登录成功后的完整请求快照，可直接写入 accounts.request_profile */
export interface YishouLoginProfile {
  channel: 'app';
  params: Record<string, string>;
  headers: Record<string, string>;
}

/** 登录结果 */
export type YishouLoginResult =
  | {
      ok: true;
      /** 一手 uid */
      uid: string;
      /** 一手 token */
      token: string;
      /** 昵称，便于确认登的是哪个号 */
      userName: string;
      device: YishouDeviceProfile;
      profile: YishouLoginProfile;
    }
  | {
      ok: false;
      reason: 'PASSWORD' | 'ACCOUNT' | 'UNKNOWN';
      message: string;
    };

/** 登录接口返回里我们关心的字段 */
interface YishouLoginData {
  user_id?: string | number;
  user_name?: string;
  token?: string;
}

/**
 * 生成随机 hex 串
 *
 * 非密码学用途（设备指纹 / 广告 ID），用 Math.random 足够，
 * 也避免给 src 内核引入 node:crypto 依赖。
 */
const randomHex = (length: number, random: () => number = Math.random): string => {
  let out = '';
  while (out.length < length) {
    out += Math.floor(random() * 16).toString(16);
  }
  return out.slice(0, length);
};

const pick = <T>(list: ReadonlyArray<T>, random: () => number): T =>
  list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/**
 * 随机生成一台 Android 虚拟设备
 * @param random 随机源（测试可注入固定序列）
 */
export const generateYishouDeviceProfile = (
  random: () => number = Math.random
): YishouDeviceProfile => {
  const base = pick(DEVICE_POOL, random);
  return {
    // 真机的 udid 是 16 位小写 hex
    udid: randomHex(16, random),
    model: base.model,
    manufacturer: base.manufacturer,
    osVersion: base.osVersion,
    screenWidth: base.screenWidth,
    screenHeight: base.screenHeight,
    carrier: pick(CARRIERS, random),
    adIdMd5: randomHex(32, random),
  };
};

/**
 * 把设备信息展开成登录请求的公共参数
 *
 * 字段集合照抄真机抓包（含埋点字段），少字段也能登录，
 * 但参数越完整越像正常客户端。
 */
export const buildYishouDeviceParams = (
  device: YishouDeviceProfile,
  phone: string,
  now: number = Date.now()
): Record<string, string> => ({
  _abtest: '1',
  app_version: APP_VERSION,
  plat_type: 'Android',
  channel: 'xiaomi',
  ua: `Mozilla/5.0 (Linux; Android ${device.osVersion}; ${device.model}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/137.0.7151.115 Mobile Safari/537.36`,
  manufacturer: device.manufacturer,
  screen_height: device.screenHeight,
  IS_PRODUCTION: '1',
  model: device.model,
  udid: device.udid,
  oaid: '',
  screen_width: device.screenWidth,
  device_id: device.udid,
  os: 'Android',
  level: '0',
  os_version: device.osVersion,
  mobile: phone,
  version_code: APP_VERSION_CODE,
  version: APP_VERSION_NUM,
  carrier: device.carrier,
  version_name: APP_VERSION,
  event_id: `${device.udid}_${now}`,
  ad_idMD5: device.adIdMd5,
  android_id: device.udid,
  network_type: 'WIFI',
});

/**
 * 登录请求头
 *
 * equipmd5 真机是设备指纹，服务端当前不校验，用 md5(udid) 占位即可。
 */
export const buildYishouDeviceHeaders = (device: YishouDeviceProfile): Record<string, string> => ({
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': APP_UA,
  'Accept-Encoding': 'gzip',
  equipmd5: md5(device.udid),
});

/**
 * 从已有快照里还原设备信息
 *
 * 用于「同一账号固定一台设备」：老账号重登时沿用上次的 udid / 机型，
 * 避免设备画像漂移；字段缺失（例如小程序快照）时返回 null 由调用方重新生成。
 */
export const extractYishouDevice = (
  params: Record<string, string> | null | undefined
): YishouDeviceProfile | null => {
  if (!params) return null;
  const udid = params.udid || params.device_id;
  const model = params.model;
  if (!udid || !model) return null;
  return {
    udid,
    model,
    manufacturer: params.manufacturer ?? '',
    osVersion: params.os_version ?? params.osVersion ?? '',
    screenWidth: params.screen_width ?? '',
    screenHeight: params.screen_height ?? '',
    carrier: params.carrier ?? '',
    adIdMd5: params.ad_idMD5 ?? '',
  };
};

/**
 * 用手机号 + 密码登录一手
 *
 * @param options 登录参数（密码可传明文，也可传 32 位 MD5）
 * @returns 成功时带 uid / token / 设备 / 可直接落库的请求快照
 */
export const loginYishouByPassword = async (options: {
  phone: string;
  password: string;
  /** 复用已有设备；不传则随机生成 */
  device?: YishouDeviceProfile;
  proxyUrl?: string;
  proxyEnabled?: '0' | '1';
}): Promise<YishouLoginResult> => {
  const device = options.device ?? generateYishouDeviceProfile();
  const params = buildYishouDeviceParams(device, options.phone);
  const headers = buildYishouDeviceHeaders(device);

  // 线上可能已经存了哈希（32 位 hex），此时直接用；否则按明文算 md5
  const passwordHash = /^[a-f0-9]{32}$/i.test(options.password)
    ? options.password.toLowerCase()
    : md5(options.password);

  const config: AdapterConfig = {
    channel: 'app',
    requestParams: params,
    requestHeaders: headers,
    model: device.model,
    version: APP_VERSION_NUM,
    version_name: APP_VERSION,
    plat_type: 'Android',
    ...(options.proxyUrl && options.proxyEnabled === '1'
      ? { proxyUrl: options.proxyUrl, proxyEnabled: '1' as const }
      : {}),
  };

  // 登录是用户主动触发的一次性动作，不进检测闸门
  const client = new YishouClient(config, { skipGate: true, timeout: 15000 });

  try {
    const data = await client.post<YishouLoginData>(EP.USER_LOGIN, {
      mobile: options.phone,
      password: passwordHash,
      slide_result: '',
    });

    const uid = String(data?.user_id ?? '').trim();
    const token = String(data?.token ?? '').trim();
    if (!uid || !token) {
      return { ok: false, reason: 'UNKNOWN', message: '登录返回缺少 uid / token，请稍后重试' };
    }

    return {
      ok: true,
      uid,
      token,
      userName: String(data?.user_name ?? ''),
      device,
      profile: {
        channel: 'app',
        // uid/token 写进快照，后续所有请求直接复用
        params: { ...params, uid, token },
        headers,
      },
    };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const message = raw.replace(/^一手平台 API 错误:\s*/, '');

    if (message.includes('密码')) {
      return { ok: false, reason: 'PASSWORD', message: '手机号或密码错误' };
    }
    if (message.includes('不存在') || message.includes('未注册') || message.includes('没有找到')) {
      return { ok: false, reason: 'ACCOUNT', message: '该手机号未注册一手账号' };
    }
    return { ok: false, reason: 'UNKNOWN', message: `登录失败：${message}` };
  }
};
