/**
 * 一手请求客户端
 *
 * 把「签名 + 公共参数 + 请求头 + 代理 + 闸门身份 + 响应解包 + 错误映射」收在一处。
 * 适配器每个接口方法因此只需要一行 post + 一行映射，不再重复样板。
 *
 * 闸门身份（flow / accountKey / localAddress）由本 client 在发请求时显式组装：
 * - flow 在构造时绑定（这个 client 的业务用途），方法可按需 override；
 * - accountKey / localAddress 从账号快照 profile 解析；
 * 出口据此查策略表决定排队还是放行，全程不依赖隐式上下文。
 */

import { httpPost } from '../../utils/http';
import { StockCheckError, StockCheckErrorType } from '../../types';
import type { GateFlow } from '../../utils/request-gate';
import type { AdapterConfig } from '../types';
import { resolveRequestProfile, type RequestProfile } from './profile';

/** 一手统一响应壳 */
export interface YishouEnvelope<T> {
  code: string;
  msg: string;
  data: T;
}

export interface YishouClientOptions {
  /**
   * 业务流标识：决定闸门策略（bypass / normal）与统计归类。
   * 默认 'manual'（手动操作）。下单传 'order.checkout'、登录传 'auth.login' 走豁免。
   */
  flow?: GateFlow;
  /** 超时（毫秒），默认 10 秒；下单链路用 20 秒 */
  timeout?: number;
  /** 是否使用配置里的代理，默认 true（收藏夹 / SKU 接口历史上直连） */
  useProxy?: boolean;
}

/**
 * 把一手返回的 code/msg 映射成统一错误
 */
const toApiError = (msg: string, code: string): StockCheckError => {
  if (msg.includes('登录')) {
    return new StockCheckError(StockCheckErrorType.AUTH_REQUIRED, msg);
  }
  if (msg.includes('不存在') || msg.includes('找不到')) {
    return new StockCheckError(StockCheckErrorType.PRODUCT_NOT_FOUND, msg);
  }
  return new StockCheckError(
    StockCheckErrorType.API_ERROR,
    `一手平台 API 错误: ${msg || `code=${code}`}`
  );
};

/** 统一把非业务异常包成 StockCheckError，保留原始堆栈 */
export const withErrorContext =
  (label: string) =>
  (error: unknown): never => {
    if (error instanceof StockCheckError) throw error;
    throw new StockCheckError(
      StockCheckErrorType.UNKNOWN_ERROR,
      `${label}: ${error instanceof Error ? error.message : '未知错误'}`,
      error
    );
  };

export class YishouClient {
  private readonly profile: RequestProfile;

  constructor(config: AdapterConfig = {}, private readonly options: YishouClientOptions = {}) {
    this.profile = resolveRequestProfile(config);
  }

  get hasAuth(): boolean {
    return this.profile.hasAuth;
  }

  /** 登录 uid：下单埋点 ID（add_cart_id / pay_id / event_id）需要 */
  get uid(): string {
    return this.profile.uid;
  }

  /** 是否来自真实抓包（端点需要按抓包决定是否覆盖默认参数时用） */
  get captured(): boolean {
    return this.profile.captured;
  }

  /** 需要登录态的接口统一在发请求前拦一次，避免白发一次注定失败的请求 */
  requireAuth(message: string): void {
    if (!this.profile.hasAuth) {
      throw new StockCheckError(StockCheckErrorType.AUTH_REQUIRED, message);
    }
  }

  /**
   * 发送请求并返回完整响应壳。
   *
   * 所有请求（含下单）都走这里，签名 / 请求头 / 代理 / 闸门身份只有一份实现。
   * @param flowOverride 本次请求覆盖 client 默认 flow（同一 client 服务多业务时用）
   */
  async request<T>(
    url: string,
    extra: Record<string, string> = {},
    flowOverride?: GateFlow
  ): Promise<YishouEnvelope<T>> {
    const t_t = this.profile.timestamp();
    const body: Record<string, string> = {
      ...this.profile.params,
      ...extra,
      t_t: `${t_t}`,
    };
    const headers: Record<string, string> = {
      ...this.profile.headers,
      sign: this.profile.sign(t_t),
    };

    // 闸门身份由这次请求的实际属性决定：
    // - flow 决定策略（bypass / normal）与统计；
    // - accountKey → UID 桶（登录 uid / 匿名空串跳过）；
    // - localAddress → IP 桶（账号绑定的出口网卡 / 默认）。
    return httpPost<YishouEnvelope<T>>(url, body, headers, {
      ...(this.options.useProxy !== false && this.profile.proxyUrl
        ? { proxyUrl: this.profile.proxyUrl }
        : {}),
      ...(this.options.timeout ? { timeout: this.options.timeout } : {}),
      gate: {
        flow: flowOverride ?? this.options.flow ?? 'manual',
        accountKey: this.profile.hasAuth ? this.profile.uid : '',
        localAddress: this.profile.localAddress,
      },
    });
  }

  /** 发送请求并解包 data；code 非 200 直接抛业务错误 */
  async post<T>(
    url: string,
    extra: Record<string, string> = {},
    flowOverride?: GateFlow
  ): Promise<T> {
    const response = await this.request<T>(url, extra, flowOverride);
    if (response?.code !== '200') {
      throw toApiError(response?.msg ?? '', String(response?.code ?? ''));
    }
    return response.data;
  }
}
