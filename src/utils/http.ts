/**
 * HTTP 请求工具
 *
 * 所有发往外部的请求都经这里。闸门是出口的默认属性：请求显式带上自己的
 * {@link GateIdentity}（由一手 client 从账号快照解析），出口按策略表决定
 * 是排队还是放行——不再依赖 AsyncLocalStorage 隐式上下文。
 */

import http from 'node:http';
import https from 'node:https';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { StockCheckError, StockCheckErrorType } from '../types';
import { acquireRequestSlot, GateTimeoutError, type GateIdentity } from './request-gate';
import { getRatePolicy } from './rate-policy';
import { recordOutbound, recordFailure, recordGateTimeout } from './request-audit';

// 审计是「事后告警」，绝不能影响请求本身：所有调用都经过这层吞异常的包装。
const auditOutbound = (gate: GateIdentity | undefined, url: string): void => {
  try { recordOutbound(gate, url); } catch { /* 审计失败不影响请求 */ }
};
const auditFailure = (gate: GateIdentity | undefined, url: string): void => {
  try { recordFailure(gate, url); } catch { /* 审计失败不影响请求 */ }
};
const auditGateTimeout = (gate: GateIdentity | undefined): void => {
  try { recordGateTimeout(gate); } catch { /* 审计失败不影响请求 */ }
};

/**
 * HTTP 请求选项
 */
export interface HttpRequestOptions {
  /** 请求方法 */
  method?: 'GET' | 'POST';
  /** 请求头 */
  headers?: Record<string, string>;
  /** 请求体（用于 POST 请求） */
  body?: Record<string, string> | string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 代理 URL（可选） */
  proxyUrl?: string;
  /**
   * 本次请求的闸门身份（显式传入，来自账号快照）。
   *
   * 携带时按身份里的 flow 查策略表：normal 走两级令牌排队，bypass（下单 / 登录）直接放行。
   * 不携带身份的请求（非平台请求、工具调用）也不过闸门——闸门只约束发往一手的请求。
   */
  gate?: GateIdentity;
}

/**
 * 创建 Axios 代理配置
 */
const createProxyConfig = (proxyUrl: string) => {
  const url = new URL(proxyUrl);
  return {
    protocol: url.protocol,
    host: url.hostname,
    port: parseInt(url.port || (url.protocol === 'https:' ? '443' : '80')),
    auth: url.username ? {
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password || ''),
    } : undefined,
  };
};

/**
 * 发送 HTTP 请求
 * @param url 请求 URL
 * @param options 请求选项
 * @returns 响应数据
 */
export const httpRequest = async <T>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<T> => {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 10000,
    proxyUrl,
    gate,
  } = options;

  const axiosConfig: AxiosRequestConfig = {
    url,
    method,
    timeout,
    headers,
    proxy: proxyUrl ? createProxyConfig(proxyUrl) : false,
  };

  // 出口网卡绑定：localAddress 必须是本机某块网卡上真实存在的 IP，
  // 否则 Node 会抛 EADDRNOTAVAIL。未配置时不设置 agent，走系统默认路由。
  // 注意：走 HTTP/HTTPS 代理时 localAddress 绑的是到代理的这条连接，需按实际网络拓扑评估。
  if (gate?.localAddress) {
    const urlObj = new URL(url);
    if (urlObj.protocol === 'https:') {
      axiosConfig.httpsAgent = new https.Agent({ localAddress: gate.localAddress });
    } else {
      axiosConfig.httpAgent = new http.Agent({ localAddress: gate.localAddress });
    }
  }

  // 处理请求体
  if (method === 'POST' && body) {
    if (typeof body === 'string') {
      axiosConfig.data = body;
    } else {
      axiosConfig.data = new URLSearchParams(body).toString();
      axiosConfig.headers = {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      };
    }
  }

  // 闸门：请求显式带身份且策略为 normal 时排队；bypass（下单 / 登录）或无身份（非平台请求）直接放行。
  // 分桶身份完全来自本次请求自带的 gate，不再读取任何隐式上下文，也不再被请求级参数覆盖。
  if (gate && getRatePolicy(gate.flow).gate === 'normal') {
    try {
      await acquireRequestSlot(gate);
    } catch (error) {
      if (error instanceof GateTimeoutError) {
        auditGateTimeout(gate);
        throw new StockCheckError(
          StockCheckErrorType.REQUEST_GATE_TIMEOUT,
          error.message,
          error
        );
      }
      throw error;
    }
  }

  // 审计：请求已过闸门、即将发出。无论后续成败都算一次实际负载；
  // 失败会再额外计一次 failure（用于失败风暴判定）。闸门超时的请求不会走到这里，单独记。
  auditOutbound(gate, url);

  try {
    const response: AxiosResponse<T> = await axios(axiosConfig);
    return response.data;
  } catch (error) {
    auditFailure(gate, url);
    if (axios.isAxiosError(error)) {
      const errorMessage = error.message;
      const code = error.code;

      // 代理相关错误
      if (proxyUrl && (
        code === 'ECONNREFUSED' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND' ||
        code === 'ECONNRESET' ||
        errorMessage.includes('ENOTFOUND')
      )) {
        throw new StockCheckError(
          StockCheckErrorType.NETWORK_ERROR,
          `代理连接失败: ${errorMessage}。请检查代理地址是否正确或代理服务器是否正常运行`,
          error
        );
      }

      // 网络错误
      if (code === 'ETIMEDOUT' || errorMessage.includes('timeout')) {
        throw new StockCheckError(
          StockCheckErrorType.NETWORK_ERROR,
          `请求超时（${timeout}ms）`,
          error
        );
      }

      // HTTP 错误响应
      if (error.response) {
        throw new StockCheckError(
          StockCheckErrorType.API_ERROR,
          `HTTP 请求失败: ${error.response.status} ${error.response.statusText}`,
          error
        );
      }

      // 其他错误
      throw new StockCheckError(
        StockCheckErrorType.NETWORK_ERROR,
        `网络请求失败: ${errorMessage}`,
        error
      );
    }

    // 非 Axios 错误
    throw new StockCheckError(
      StockCheckErrorType.NETWORK_ERROR,
      `网络请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
      error
    );
  }
};

/**
 * 发送 POST 请求（便捷方法）
 */
export const httpPost = async <T>(
  url: string,
  body: Record<string, string>,
  headers?: Record<string, string>,
  options?: Partial<Omit<HttpRequestOptions, 'method' | 'body' | 'headers'>>
): Promise<T> => {
  return httpRequest<T>(url, {
    method: 'POST',
    body,
    headers,
    ...options,
  });
};
